import fs from 'fs';
import path from 'path';
import { runWhisper } from '../core/whisper.js';

export interface TranscribeOptions {
  output?: string;
  outSrt?: string;
  outWords?: string;
  model?: string;
  language?: string;
  device?: string;
  computeType?: string;
  hotwords?: string;
  python?: string;
  vadFilter?: boolean;
  beamSize?: string;
}

function resolveOutputDir(videoFile: string, explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const today = new Date().toISOString().slice(0, 10);
  const base = path.basename(videoFile, path.extname(videoFile));
  return path.resolve('output', `${today}_${base}`);
}

export async function transcribe(
  videoPath: string,
  options: TranscribeOptions
): Promise<void> {
  const videoFile = path.resolve(videoPath);
  if (!fs.existsSync(videoFile)) {
    console.error(`❌ 找不到视频文件: ${videoFile}`);
    process.exit(1);
  }

  const outputDir = resolveOutputDir(videoFile, options.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const outSrt = options.outSrt ? path.resolve(options.outSrt) : path.join(outputDir, 'transcript.srt');
  const outWordsJson = options.outWords
    ? path.resolve(options.outWords)
    : path.join(outputDir, 'transcript.words.json');

  const beamSize = options.beamSize ? Number(options.beamSize) : undefined;
  if (options.beamSize && !Number.isFinite(beamSize)) {
    console.error(`❌ --beam-size 必须是整数，收到: ${options.beamSize}`);
    process.exit(1);
  }

  console.log(`📹 输入视频: ${videoFile}`);
  console.log(`📁 输出: ${outSrt}`);

  try {
    await runWhisper({
      videoPath: videoFile,
      outSrt,
      outWordsJson,
      model: options.model,
      language: options.language,
      device: options.device,
      computeType: options.computeType,
      hotwordsFile: options.hotwords,
      vadFilter: options.vadFilter,
      beamSize,
      pythonPath: options.python,
    });
  } catch (err) {
    console.error(`❌ 转录失败: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`✅ 转录完成:`);
  console.log(`   ${outSrt}`);
  console.log(`   ${outWordsJson}`);
}
