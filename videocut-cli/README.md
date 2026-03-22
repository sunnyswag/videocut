# videocut CLI

`videocut` is a command-line tool for talking-head video workflows. It handles transcription, subtitle structuring, human-readable review output, edit application, review UI hosting, and final cutting based on approved delete segments.

## Installation

```bash
npm install -g @huiqinghuang/videocut-cli
```

After installation, verify that the command is available:

```bash
videocut --help
```

## Requirements

- Node.js 18+
- FFmpeg
- Volcengine speech transcription API key: `VOLCENGINE_API_KEY`

Example:

```bash
export VOLCENGINE_API_KEY="your_api_key"
```

## Commands

```bash
videocut transcribe <video> -o <output-dir> [--hotwords <hotwords.txt>]
videocut generate-subtitles <volcengine-result.json> -o <subtitles.json>
videocut generate-readable <subtitles.json> -o <readable.txt>
videocut apply-edits <subtitles.json> <edits.json> -o <subtitles-edited.json>
videocut review-server 8899 --path <project-or-output-root>
videocut cut <video> <delete-segments.json> -o <output-video>
```

## Typical Workflow

```bash
# 1. Transcribe the video
videocut transcribe input.mp4 -o output/demo --hotwords hotwords.txt

# 2. Build the subtitle structure
videocut generate-subtitles output/demo/1_transcribe/volcengine_result.json

# 3. Generate readable review text for AI or human review
videocut generate-readable output/demo/common/subtitles_words.json -o output/demo/2_analysis/readable.txt

# 4. Apply edits from edits.json back to the structured subtitles
videocut apply-edits output/demo/common/subtitles_words.json output/demo/2_analysis/edits.json

# 5. Start the review server
videocut review-server 8899 --path output/demo
```

### Hotwords File

Use a plain text file with one term per line:

```txt
container_of
offsetof
list_entry
GitHub
Gist
```

If `--hotwords` is provided, the list is submitted to Volcengine ASR and also recorded to `1_transcribe/hotwords_used.json`.

## Related Project

- Skills repository: `videocut-skill`
- Repository: [https://github.com/sunnyswag/videocut](https://github.com/sunnyswag/videocut)
