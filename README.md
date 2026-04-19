# VideoCut

本地 faster-whisper 转录 + AI 粗剪 + ffmpeg 输出的口播视频剪辑工具链。适合给**「AI 粗剪 → 外部编辑器（剪映 / Premiere / DaVinci）精修」**这种工作流使用。

## 组成

- **`videocut-cli/`** — Node CLI，spawn Python 跑 faster-whisper，ffmpeg 切视频。发布包 `@huiqinghuang/videocut-cli`。
- **`.cursor/skills/videocut/`** — Cursor / Claude Code 的 skill 定义，把 AI 分析步骤固化下来。

## 四步流程

```
1. videocut process <video> -o <BASE>
     → BASE/inputs/source.mp4 (symlink) + BASE/work/transcript.srt + BASE/work/signals.json
2. videocut suggest-edits <BASE>
     → BASE/work/edits.candidates.json（机械扫出 gap / mid-cue / filler-only；可选）
3. [AI]  读 work/transcript.srt + signals.json + candidates
     → 写 work/edits.json + work/analysis.md（加 stutter 合并 + textEdits）
4. videocut cut BASE/inputs/source.mp4 BASE/work/edits.json
     → BASE/final/edited.mp4 + BASE/final/edited.srt
```

目录约定：`inputs/`（用户放 source + video_script）/ `work/`（CLI 和 LLM 的工作区）/ `final/`（成片）。

AI 在 step 3 里干三件事：
- 标出要删的 cue / 时间段（静音、填充词、口吃、重复、自我纠正、残句）
- 修正 ASR 识错的专名 / 同音字（`textEdits` 字段，cue 级整行替换）
- 把推理过程写到 `work/analysis.md`

CLI 在 step 4 里：
- 校验 LLM 产出的索引合法性
- 应用 textEdits
- 按 words JSON 做词边界吸附（±150ms）
- ffmpeg 剪切 + 硬件编码器自动回退（NVENC / VAAPI / QSV / VideoToolbox / libx264）
- 重映射 SRT 时间轴到剪辑后的视频（按每段实际渲染时长缩放，避免 GOP 累积 drift）

## 快速开始

```bash
# 一次性安装
npm install -g @huiqinghuang/videocut-cli

# Python 后端装到 venv（现代 Debian/Ubuntu 的 PEP 668 不让 pip 装到系统 Python）
python3 -m venv .venv
.venv/bin/pip install faster-whisper
export VIDEOCUT_PYTHON="$PWD/.venv/bin/python"

# 需要 ffmpeg、ffprobe、Python 3.10+、Node 18+
# 可选：GPU 加速（约 10× 速度，没装会自动回退 CPU）
#   .venv/bin/pip install nvidia-cublas-cu12 nvidia-cudnn-cu12

# 跑一个视频
videocut process my_video.mp4 -o output/demo
# 首次会下载 ~1.5GB 模型到 ~/.cache/huggingface/
# 产出 output/demo/{inputs,work,final}/

# 可选：生成候选骨架
videocut suggest-edits output/demo
# → output/demo/work/edits.candidates.json

# （这一步由 AI 完成，见 SKILL.md 的启发式）
# 生成 output/demo/work/edits.json

videocut cut output/demo/inputs/source.mp4 output/demo/work/edits.json
# 默认输出到 output/demo/final/edited.mp4 + edited.srt
```

批量模式：在 Cursor / Claude Code 里说「剪辑 @videos 文件夹」，skill 会给每个视频起一个 subagent 并行跑。

## 文档

- [CLI README](./videocut-cli/README.md) — 命令行使用详解
- [SKILL.md](./.cursor/skills/videocut/SKILL.md) — 完整工作流 + AI 启发式 + 批量模式
- [edits.example.json](./.cursor/skills/videocut/edits.example.json) — LLM 产出格式示例
- [Python 后端](./videocut-cli/python/README.md) — faster-whisper 安装与 GPU 配置

## 迁移自 1.x

1.x 版本依赖火山引擎 ASR + 浏览器审核 UI + 多级 `subtitles_words.json` / `readable.txt` / `edits.json (pathSet)` 工作流。2.0 全部废弃：

- ASR：Volcengine → **faster-whisper 本地**，无 API 费、无轮询、无 `uguu.se` 依赖
- AI 输入：`readable.txt` (两级索引) → **标准 SRT**
- AI 输出：旧 `edits.json` (pathSet / textChanges / combines) → **新 `edits.json`**（只有 deletes + cue 级 textEdits；schema_version: 2）
- UI：React 浏览器审核 → 去掉；直接在 CLI + 外部剪辑软件完成

`output/` 目录下 1.x 的项目文件**不兼容**新 CLI，需要对源视频重跑 `videocut process`。
