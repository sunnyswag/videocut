import fs from 'fs';
import path from 'path';
import { transcribe } from './transcribe.js';
import { analyzeSignals } from './analyze-signals.js';

export interface ProcessOptions {
  output?: string;
  model?: string;
  language?: string;
  device?: string;
  computeType?: string;
  hotwords?: string;
  python?: string;
  vadFilter?: boolean;
  beamSize?: string;
  silenceMinMs?: string;
  silenceNoiseDb?: string;
}

function resolveOutputDir(videoFile: string, explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const today = new Date().toISOString().slice(0, 10);
  const base = path.basename(videoFile, path.extname(videoFile));
  return path.resolve('output', `${today}_${base}`);
}

function symlinkSource(src: string, dst: string): void {
  try { fs.unlinkSync(dst); } catch { /* noop */ }
  try {
    fs.symlinkSync(path.resolve(src), dst);
  } catch {
    fs.copyFileSync(path.resolve(src), dst);
  }
}

export async function processVideo(
  videoPath: string,
  options: ProcessOptions
): Promise<void> {
  const videoFile = path.resolve(videoPath);
  if (!fs.existsSync(videoFile)) {
    console.error(`❌ 找不到视频文件: ${videoFile}`);
    process.exit(1);
  }

  const outputDir = resolveOutputDir(videoFile, options.output);
  const inputsDir = path.join(outputDir, 'inputs');
  const workDir = path.join(outputDir, 'work');
  const finalDir = path.join(outputDir, 'final');
  fs.mkdirSync(inputsDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(finalDir, { recursive: true });

  const sourceLink = path.join(inputsDir, `source${path.extname(videoFile)}`);
  symlinkSource(videoFile, sourceLink);

  console.log('=== 步骤 1/2: 转录 ===');
  await transcribe(videoFile, {
    ...options,
    output: workDir,
    outSrt: path.join(workDir, 'transcript.srt'),
    outWords: path.join(workDir, 'transcript.words.json'),
  });

  console.log('\n=== 步骤 2/2: 信号分析（静音） ===');
  await analyzeSignals(videoFile, {
    output: path.join(workDir, 'signals.json'),
    silenceMinMs: options.silenceMinMs,
    silenceNoiseDb: options.silenceNoiseDb,
  });

  const manifest = {
    baseDir: outputDir,
    inputsDir,
    workDir,
    finalDir,
    sourceLink,
    transcriptSrt: path.join(workDir, 'transcript.srt'),
    transcriptWordsJson: path.join(workDir, 'transcript.words.json'),
    signalsJson: path.join(workDir, 'signals.json'),
    nextStep: {
      description: '可选先跑 videocut suggest-edits 扫出骨架；然后读 work/ 下 transcript.srt + signals.json (+ 可选 inputs/video_script.md, work/hotwords.txt)，写 work/edits.json + work/analysis.md，再 videocut cut',
      llmInputs: [
        path.join(workDir, 'transcript.srt'),
        path.join(workDir, 'signals.json'),
      ],
      llmOptionalInputs: [
        path.join(inputsDir, 'video_script.md'),
        path.join(workDir, 'hotwords.txt'),
        path.join(workDir, 'edits.candidates.json'),
      ],
      llmOutputs: [
        path.join(workDir, 'edits.json'),
        path.join(workDir, 'analysis.md'),
      ],
      cliCommand: `videocut cut "${sourceLink}" "${path.join(workDir, 'edits.json')}"`,
      finalOutputs: [
        path.join(finalDir, 'edited.mp4'),
        path.join(finalDir, 'edited.srt'),
      ],
    },
  };
  console.log('\n=== ✅ 完成 ===');
  console.log(JSON.stringify(manifest, null, 2));
}
