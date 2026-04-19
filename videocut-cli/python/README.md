# videocut Python backend

`whisper_transcribe.py` is the local ASR entrypoint spawned by the Node CLI (`videocut transcribe` / `videocut process`). It uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) and produces:

- a standard SRT file (`--out-srt`)
- a JSON with word-level timestamps (`--out-json`)

All progress is emitted to **stderr**. `stdout` stays silent.

## Install

Modern Debian/Ubuntu/Fedora ships with PEP 668-marked system Python — `pip install` will be rejected. Use a venv:

```bash
python3 -m venv .venv
.venv/bin/pip install -r videocut-cli/python/requirements.txt

# Point the CLI at this venv
export VIDEOCUT_PYTHON="$PWD/.venv/bin/python"
# (or pass --python /path/to/.venv/bin/python on every command)
```

Alternative: `pipx install faster-whisper` (if you prefer pipx-managed envs).

First run downloads the model (~1.5 GB for `large-v3-turbo`) into `~/.cache/huggingface/`.

## GPU acceleration (optional, 10× faster)

faster-whisper uses CTranslate2. For CUDA:

- CUDA 12.x runtime
- `libcublas.so.12` + `libcudnn.so.9` reachable from `LD_LIBRARY_PATH`

The pip wheels of CTranslate2 do **not** bundle cuBLAS/cuDNN. On systems without them (including WSL2 with Windows-side drivers only), install the runtime bits yourself:

```bash
.venv/bin/pip install nvidia-cublas-cu12 nvidia-cudnn-cu12
```

If the libs still aren't found, the Python entrypoint now auto-falls back to `cpu + int8` and logs the reason.

## CPU fallback

On CPU-only machines, bump quality ↓ / speed ↑:

```bash
videocut transcribe my.mp4 --device cpu --compute-type int8
```

## Direct invocation (debugging)

```bash
python3 videocut-cli/python/whisper_transcribe.py \
  --video my.mp4 \
  --out-srt out.srt \
  --out-json out.words.json \
  --model large-v3-turbo \
  --language auto
```
