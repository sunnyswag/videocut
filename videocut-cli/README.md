# @huiqinghuang/videocut-cli

本地 faster-whisper ASR + AI 粗剪 + ffmpeg 输出 CLI。适合口播 / 播客 / 教程类视频。

## 安装

```bash
# CLI
npm install -g @huiqinghuang/videocut-cli

# ASR 后端（venv，因为现代 Debian/Ubuntu 的 PEP 668 不让 pip 装到系统 Python）
python3 -m venv .venv
.venv/bin/pip install faster-whisper
export VIDEOCUT_PYTHON="$PWD/.venv/bin/python"   # 或每次 --python 指定
```

需要 Node 18+、ffmpeg、ffprobe、Python 3.10+。

**可选：启用 GPU**（约 10× 速度，默认没装是正常现象，Python 端会自动回退到 CPU）：

```bash
.venv/bin/pip install nvidia-cublas-cu12 nvidia-cudnn-cu12
```

## 命令一览

| 命令 | 作用 |
|---|---|
| `videocut transcribe <video>` | 本地 faster-whisper 转录 → `transcript.srt` + `transcript.words.json` |
| `videocut analyze-signals <video>` | ffmpeg 静音检测 → `signals.json` |
| `videocut process <video>` | 一键跑 transcribe + analyze-signals（粗剪前的单步命令） |
| `videocut suggest-edits <baseDir>` | 扫 transcript + signals → `edits.candidates.json`（机械骨架） |
| `videocut cut <video> <edits.json>` | 按 `edits.json` 剪切 → `edited.mp4` + `edited.srt` |

所有命令支持 `--help` 看全部 flag。

## 典型工作流

```bash
# 1. 转录 + 信号分析（自动建 inputs/ work/ final/ 三目录）
videocut process input.mp4 -o output/demo --hotwords hotwords.txt

# 2. 可选：机械骨架
videocut suggest-edits output/demo
# → output/demo/work/edits.candidates.json

# 3. （LLM）读 transcript.srt + signals.json + candidates
#    写 output/demo/work/edits.json + analysis.md
#    格式见 .cursor/skills/videocut/edits.example.json

# 4. 剪辑（默认输出到 final/）
videocut cut output/demo/inputs/source.mp4 output/demo/work/edits.json
# 产出 output/demo/final/edited.mp4 + edited.srt
```

## 输出目录

```
output/<BASE>/
├── inputs/            # source.<ext>（CLI 软链）、video_script.md（用户放）
├── work/              # transcript.srt、signals.json、edits.json、edits.candidates.json、analysis.md、hotwords.txt
└── final/             # edited.mp4、edited.srt
```

## edits.json 格式（精简版）

```json
{
  "schema_version": 2,
  "deletes": [
    { "type": "cue",   "cueIdx": 1,  "reason": "filler_word" },
    { "type": "cue",   "cueIdx": 12, "cueIdxEnd": 14, "reason": "duplicate" },
    { "type": "range", "start": 152.4, "end": 155.1, "reason": "silence" }
  ],
  "textEdits": [
    { "cueIdx": 23, "newText": "macro 是一种宏观视角", "reason": "asr_error" }
  ]
}
```

- `type:"cue"` + `cueIdx`：删该 cue（1 基序号，和 SRT 文件一致）
- `type:"cue"` + `cueIdxEnd`：闭区间删
- `type:"range"`：按绝对秒删（用于静音）
- `textEdits`：cue 级**整行**文本替换（时间戳不变）；用于修 ASR 识错的专名 / 同音字

CLI 会硬校验越界索引、按 `transcript.words.json` 做 ±150ms 词边界吸附、加 50ms buffer + 30ms 音频 crossfade。

## 热词

`hotwords.txt` 每行一个词，会被当作 faster-whisper 的 `initial_prompt`：

```txt
GitHub
MCP
container_of
Claude Code
```

## 相关项目

- 配套的 Cursor / Claude Code skill: `.cursor/skills/videocut/` （见仓库 SKILL.md）
- 仓库: https://github.com/sunnyswag/videocut
