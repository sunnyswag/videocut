#!/usr/bin/env node
import { Command } from 'commander';
import { transcribe } from './commands/transcribe.js';
import { analyzeSignals } from './commands/analyze-signals.js';
import { processVideo } from './commands/process.js';
import { cutVideo } from './commands/cut-video.js';
import { suggestEdits } from './commands/suggest-edits.js';

const program = new Command();

program
  .name('videocut')
  .description('Local faster-whisper ASR + AI 粗剪 + ffmpeg 输出')
  .version('2.0.0');

program
  .command('transcribe <video>')
  .description('本地 faster-whisper 转录 → transcript.srt + transcript.words.json')
  .option('-o, --output <dir>', '输出目录，默认 output/YYYY-MM-DD_<name>/')
  .option('--model <name>', 'Whisper 模型，默认 large-v3-turbo', 'large-v3-turbo')
  .option('--language <code>', '语言代码或 auto', 'auto')
  .option('--device <device>', 'auto | cuda | cpu', 'auto')
  .option('--compute-type <type>', 'auto | float16 | int8_float16 | int8', 'auto')
  .option('--hotwords <file>', '热词文件路径（每行一词）')
  .option('--python <path>', 'Python 可执行文件路径，覆盖 VIDEOCUT_PYTHON 与 python3')
  .option('--no-vad-filter', '禁用 VAD 前过滤（VAD 有时会吃掉首尾轻声词）')
  .option('--beam-size <n>', 'beam search 宽度', '5')
  .action(transcribe);

program
  .command('analyze-signals <video>')
  .description('ffmpeg 静音检测 → signals.json')
  .option('-o, --output <file>', '输出路径，默认 <video-dir>/signals.json')
  .option('--silence-min-ms <n>', '最短静音时长（ms）', '700')
  .option('--silence-noise-db <n>', '静音检测噪声阈值（dB）', '-30')
  .action(analyzeSignals);

program
  .command('process <video>')
  .description('一键跑 transcribe + analyze-signals；为 LLM 产出 edits.json 准备输入')
  .option('-o, --output <dir>', '输出目录，默认 output/YYYY-MM-DD_<name>/')
  .option('--model <name>', 'Whisper 模型', 'large-v3-turbo')
  .option('--language <code>', '语言代码或 auto', 'auto')
  .option('--device <device>', 'auto | cuda | cpu', 'auto')
  .option('--compute-type <type>', 'auto | float16 | int8_float16 | int8', 'auto')
  .option('--hotwords <file>', '热词文件路径')
  .option('--python <path>', 'Python 可执行文件路径')
  .option('--no-vad-filter', '禁用 VAD 前过滤')
  .option('--beam-size <n>', 'beam search 宽度', '5')
  .option('--silence-min-ms <n>', '最短静音时长（ms）', '700')
  .option('--silence-noise-db <n>', '静音检测噪声阈值（dB）', '-30')
  .action(processVideo);

program
  .command('suggest-edits <baseDir>')
  .description('扫 transcript.srt + signals.json → 候选 edits（gap / mid-cue / filler-only）')
  .option('-o, --output <file>', '输出路径，默认 <baseDir>/work/edits.candidates.json')
  .option('--srt <path>', 'transcript.srt 路径，默认 <baseDir>/work/transcript.srt')
  .option('--signals <path>', 'signals.json 路径，默认 <baseDir>/work/signals.json')
  .option('--gap-min <sec>', 'cue 间 gap 阈值（秒）', '1.8')
  .option('--mid-cue-min <sec>', 'cue 内停顿阈值（秒）', '1.3')
  .option('--edge-pad <sec>', 'gap 两端保护垫（秒）', '0.15')
  .option('--stdout', '打印到 stdout，不写文件')
  .action(suggestEdits);

program
  .command('cut <video> <edits>')
  .description('按 edits.json 剪切视频 → edited.mp4 + edited.srt')
  .option('-o, --output <file>', '输出 mp4 路径，默认 <deletes-dir>/<video-name>_cut.mp4')
  .option('--srt <path>', '原始 SRT，默认 <deletes-dir>/transcript.srt')
  .option('--words <path>', '原始 words JSON，默认 <deletes-dir>/transcript.words.json（用于词边界吸附）')
  .option('--srt-out <path>', '输出 SRT 路径，默认 <output>.srt')
  .option('--no-srt-out', '不输出 SRT')
  .option('--no-snap', '禁用词边界吸附')
  .option('--project <path>', '旧项目路径（仅用于读取 audio 偏移；现在一般不用）')
  .action(cutVideo);

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
