# VideoCut

A CLI toolkit and web-based review UI for cutting talking-head / podcast videos. It transcribes speech via the Volcengine ASR API, identifies filler words and mistakes with AI, and lets you visually confirm deletions in a browser before exporting the final cut.

## Features

- **Automatic transcription** — extracts audio, uploads it, and polls the Volcengine ASR API for word-level timestamps.
- **AI-assisted edit suggestions** — generates a readable transcript and proposes deletions (fillers, repeated words, long pauses).
- **Web review UI** — a React-based single-page app with inline word timeline, playback controls, dark/light themes, and i18n (Chinese / English).
- **Precise FFmpeg cutting** — merges selected delete segments, compensates for audio offset, and exports with hardware-accelerated encoding when available (NVENC / VideoToolbox).
- **Subtitle burning** — optionally hardcodes subtitles into the output video.

## Quick Start

```bash
# Install the CLI globally
npm install -g @videocut/cli

# Transcribe a video
videocut transcribe video.mp4 -o output/

# Generate editable subtitle structure
videocut generate-subtitles output/transcription.json -o output/subtitles_words.json

# Generate human-readable transcript for AI analysis
videocut generate-readable output/subtitles_words.json -o output/readable.txt

# Apply AI-suggested edits
videocut apply-edits output/subtitles_words.json edits.json -o output/subtitles_words_edited.json

# Launch the review UI in a browser
videocut review-server 8899 -p output/

# Cut the video (also available from the review UI)
videocut cut video.mp4 delete_segments.json -o video_cut.mp4
```

## CLI Commands

| Command | Description |
|---|---|
| `transcribe <video>` | Transcribe video via Volcengine ASR. Outputs word-level JSON. |
| `generate-subtitles <json>` | Convert raw transcription into an editable subtitle structure. |
| `generate-readable <subtitles>` | Produce a plain-text transcript for AI analysis. |
| `apply-edits <subtitles> <edits>` | Merge AI edit suggestions into the subtitle file. |
| `review-server [port]` | Start the web review UI on the given port (default 3000). |
| `cut <video> <segments>` | Execute the final cut using FFmpeg. |

## Development

```bash
# Install dependencies
cd videocut-cli && npm install
cd ../videocut-ui && npm install

# Build the UI (outputs to videocut-cli/static/)
cd videocut-ui && npm run build

# Build the CLI
cd ../videocut-cli && npm run build

# Run the UI dev server (hot reload)
cd videocut-ui && npm run dev

# Start the backend in another terminal
node videocut-cli/bin/videocut.js review-server 8899 -p output/
```

## Project Structure

```
videocut-skills-test/
├── videocut-cli/              # CLI package (TypeScript + Commander)
│   ├── bin/                   #   Entry script
│   ├── src/
│   │   ├── commands/          #   One file per CLI command
│   │   │   ├── transcribe.ts
│   │   │   ├── generate-subtitles.ts
│   │   │   ├── generate-readable.ts
│   │   │   ├── apply-edits.ts
│   │   │   ├── review-server.ts
│   │   │   └── cut-video.ts
│   │   └── index.ts           #   CLI entry point
│   └── static/                #   Compiled UI assets (generated)
├── videocut-ui/               # Web review UI (React + Vite)
│   └── src/
│       ├── components/        #   React components
│       ├── hooks/             #   Custom React hooks
│       ├── i18n.ts            #   Internationalization (zh/en)
│       ├── api.ts             #   API client
│       ├── types.ts           #   Shared TypeScript types
│       └── style.css          #   Global styles + theming
├── .cursor/skills/            # Cursor Agent Skill definitions
└── output/                    # Working directory for processed videos
```

## Environment Variables

| Variable | Description |
|---|---|
| `VOLCENGINE_API_KEY` | API key for Volcengine ASR service |

## License

MIT
