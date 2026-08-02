#!/usr/bin/env python3
"""Local faster-whisper transcription entrypoint.

Called by the Node CLI as a subprocess. Writes SRT + words JSON to the
requested paths. All progress/logs go to stderr; stdout stays silent so
the parent process can spawn us cleanly.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def extract_audio(video_path: str, out_wav: str) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        f"file:{video_path}",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        out_wav,
    ]
    log(f"[audio] extract → {out_wav}")
    subprocess.run(cmd, check=True)


def read_hotwords(path: str | None) -> list[str]:
    if not path or not os.path.isfile(path):
        return []
    words: list[str] = []
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            words.append(line)
    return words


def build_initial_prompt(hotwords: list[str], limit_chars: int = 400) -> str | None:
    if not hotwords:
        return None
    joined = ", ".join(hotwords)
    if len(joined) > limit_chars:
        joined = joined[:limit_chars].rsplit(",", 1)[0]
    return f"Domain terms: {joined}"


def preload_nvidia_libs() -> list[str]:
    """预加载 pip 装的 CUDA 库（nvidia-cublas-cu12 / nvidia-cudnn-cu12）。

    这些库落在 site-packages/nvidia/*/lib 下，不在动态链接器的搜索路径里，
    所以按 soname 的 dlopen 会失败。这里用绝对路径 + RTLD_GLOBAL 先加载一遍，
    之后 loader 按 soname 查找时会直接命中已加载的对象，
    调用方不必设 LD_LIBRARY_PATH。
    """
    import glob
    import sysconfig

    dirs: list[str] = []
    for key in ("purelib", "platlib"):
        base = sysconfig.get_paths().get(key)
        if base:
            dirs.extend(glob.glob(os.path.join(base, "nvidia", "*", "lib")))
    dirs = sorted(dict.fromkeys(dirs))
    if not dirs:
        return []

    pending: list[str] = []
    for d in dirs:
        pending.extend(sorted(glob.glob(os.path.join(d, "lib*.so*"))))

    # 库之间有依赖（libcudnn_cnn → libcudnn_ops/graph），一趟装不完；
    # 反复重试直到没有新增成功为止。
    for _ in range(4):
        failed = [
            lib
            for lib in pending
            if not _try_dlopen(lib)
        ]
        if not failed or len(failed) == len(pending):
            break
        pending = failed
    return dirs


def _try_dlopen(path: str) -> bool:
    import ctypes

    try:
        ctypes.CDLL(path, mode=ctypes.RTLD_GLOBAL)
        return True
    except OSError:
        return False


def pick_cuda_compute_type() -> str:
    """按 ctranslate2 实际支持的类型挑，别硬写 float16。

    Pascal（sm_6x，如 GTX 10 系）的 float16 吞吐只有 fp32 的一个零头，
    ctranslate2 会直接把 float16 从支持列表里剔掉；此时应落到 int8_float32
    （sm_61 有 dp4a，int8 比 float32 快，显存也省）。
    """
    try:
        import ctranslate2  # type: ignore

        supported = ctranslate2.get_supported_compute_types("cuda")
    except Exception:
        return "default"
    for ct in ("float16", "int8_float16", "int8_float32", "float32"):
        if ct in supported:
            return ct
    return "default"


def format_srt_time(seconds: float) -> str:
    if seconds is None or seconds < 0:
        seconds = 0.0
    total_ms = int(round(seconds * 1000))
    h, rem = divmod(total_ms, 3600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", help="Path to video file (audio will be extracted)")
    ap.add_argument("--audio", help="Path to audio file (wav/mp3/etc)")
    ap.add_argument("--out-srt", required=True)
    ap.add_argument("--out-json", required=True)
    ap.add_argument("--model", default="large-v3-turbo")
    ap.add_argument("--language", default="auto")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--compute-type", default="auto")
    ap.add_argument("--hotwords", default=None)
    ap.add_argument("--vad-filter", dest="vad_filter", default="true", choices=["true", "false"])
    ap.add_argument("--beam-size", type=int, default=5)
    args = ap.parse_args()

    if not args.video and not args.audio:
        log("ERROR: one of --video or --audio is required")
        return 1

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError:
        log(
            "ERROR: faster-whisper is not installed. Run:\n"
            "  python3 -m pip install --user -r python/requirements.txt"
        )
        return 1

    if not shutil.which("ffmpeg"):
        log("ERROR: ffmpeg not found on PATH")
        return 1

    tmp_root = None
    audio_path = args.audio
    try:
        if not audio_path:
            tmp_root = tempfile.mkdtemp(prefix="videocut_wav_")
            audio_path = os.path.join(tmp_root, "audio.wav")
            extract_audio(args.video, audio_path)

        device = args.device
        compute_type = args.compute_type

        def load_with(dev: str, ct: str) -> "WhisperModel":
            effective_ct = "default" if ct == "auto" else ct
            log(f"[whisper] load model={args.model} device={dev} compute_type={effective_ct}")
            return WhisperModel(args.model, device=dev, compute_type=effective_ct)

        def cuda_runtime_ok() -> tuple[bool, str]:
            import ctypes
            for lib in ("libcublas.so.12", "libcudnn_ops.so.9", "libcudnn_cnn.so.9"):
                try:
                    ctypes.CDLL(lib)
                except OSError as e:
                    return False, f"{lib}: {e}"
            return True, "ok"

        if device in ("auto", "cuda"):
            found = preload_nvidia_libs()
            if found:
                log(f"[whisper] 预加载 pip CUDA 库：{len(found)} 个目录")

        if device == "auto":
            ok, why = cuda_runtime_ok()
            if ok:
                ct = pick_cuda_compute_type() if compute_type == "auto" else compute_type
                try:
                    model = load_with("cuda", ct)
                    device = "cuda"
                    compute_type = ct
                except Exception as gpu_err:
                    log(f"[whisper] CUDA 加载失败，回退 CPU+int8: {type(gpu_err).__name__}: {str(gpu_err)[:160]}")
                    model = load_with("cpu", "int8")
                    device = "cpu"
                    compute_type = "int8"
            else:
                log(f"[whisper] CUDA 运行时缺失，回退 CPU+int8（{why[:160]}）")
                log(
                    "[whisper] 如需启用 GPU，装 cuBLAS/cuDNN：\n"
                    "           pip install nvidia-cublas-cu12 nvidia-cudnn-cu12"
                )
                model = load_with("cpu", "int8")
                device = "cpu"
                compute_type = "int8"
        else:
            if device == "cuda" and compute_type == "auto":
                compute_type = pick_cuda_compute_type()
            model = load_with(device, compute_type)

        hotwords = read_hotwords(args.hotwords)
        initial_prompt = build_initial_prompt(hotwords)
        if initial_prompt:
            log(f"[whisper] hotwords applied: {len(hotwords)} terms")

        language = None if args.language == "auto" else args.language
        log(f"[whisper] transcribe language={language or 'auto'} vad={args.vad_filter}")
        segments_iter, info = model.transcribe(
            audio_path,
            language=language,
            beam_size=args.beam_size,
            vad_filter=(args.vad_filter == "true"),
            word_timestamps=True,
            initial_prompt=initial_prompt,
        )
        log(f"[whisper] detected language={info.language} duration={info.duration:.2f}s")

        utterances: list[dict] = []
        srt_lines: list[str] = []
        last_progress = -10.0
        for i, seg in enumerate(segments_iter, start=1):
            text = (seg.text or "").strip()
            if not text:
                continue

            words_out: list[dict] = []
            if seg.words:
                for w in seg.words:
                    w_text = (w.word or "").strip() if hasattr(w, "word") else ""
                    if not w_text:
                        continue
                    words_out.append(
                        {
                            "text": w_text,
                            "start": float(w.start) if w.start is not None else float(seg.start),
                            "end": float(w.end) if w.end is not None else float(seg.end),
                            "probability": float(getattr(w, "probability", 0.0) or 0.0),
                        }
                    )

            utterances.append(
                {
                    "id": i,
                    "text": text,
                    "start": float(seg.start),
                    "end": float(seg.end),
                    "words": words_out,
                }
            )
            srt_lines.append(
                f"{i}\n{format_srt_time(seg.start)} --> {format_srt_time(seg.end)}\n{text}\n"
            )

            if seg.end - last_progress >= 10.0:
                log(f"PROGRESS pos={seg.end:.1f} dur={info.duration:.1f}")
                last_progress = seg.end

        if not utterances:
            log("ERROR: no speech detected")
            return 1

        Path(os.path.dirname(os.path.abspath(args.out_srt))).mkdir(parents=True, exist_ok=True)
        Path(os.path.dirname(os.path.abspath(args.out_json))).mkdir(parents=True, exist_ok=True)

        with open(args.out_srt, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(srt_lines))
            if srt_lines:
                f.write("\n")

        transcript = {
            "language": info.language,
            "duration": float(info.duration),
            "model": args.model,
            "utterances": utterances,
        }
        with open(args.out_json, "w", encoding="utf-8") as f:
            json.dump(transcript, f, ensure_ascii=False, indent=2)

        log(f"[whisper] wrote {args.out_srt} ({len(utterances)} cues)")
        log(f"[whisper] wrote {args.out_json}")
        return 0
    except subprocess.CalledProcessError as e:
        log(f"ERROR: ffmpeg failed with exit {e.returncode}")
        return 1
    except Exception as e:
        log(f"ERROR: {type(e).__name__}: {e}")
        return 1
    finally:
        if tmp_root and os.path.isdir(tmp_root):
            shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
