import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { parseSilenceDetect } from '../core/signals.js';
import type { Signals } from '../core/types.js';

export interface AnalyzeSignalsOptions {
  output?: string;
  silenceMinMs?: string;
  silenceNoiseDb?: string;
}

function collectStderr(videoFile: string, filterArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-nostats', '-i', `file:${videoFile}`, ...filterArgs, '-f', 'null', '-'];
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const chunks: Buffer[] = [];
    child.stderr.on('data', (c: Buffer) => chunks.push(c));
    child.on('error', reject);
    child.on('close', (code) => {
      const buf = Buffer.concat(chunks).toString('utf8');
      if (code !== 0) reject(new Error(`ffmpeg 退出码 ${code}\n${buf.slice(-2000)}`));
      else resolve(buf);
    });
  });
}

function getVideoDuration(videoFile: string): number {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${videoFile}"`
  ).toString().trim();
  const d = parseFloat(out);
  return Number.isFinite(d) ? d : 0;
}

export async function analyzeSignals(
  videoPath: string,
  options: AnalyzeSignalsOptions
): Promise<void> {
  const videoFile = path.resolve(videoPath);
  if (!fs.existsSync(videoFile)) {
    console.error(`❌ 找不到视频文件: ${videoFile}`);
    process.exit(1);
  }

  const outFile = path.resolve(
    options.output || path.join(path.dirname(videoFile), 'signals.json')
  );

  const silenceMinMs = Number(options.silenceMinMs ?? 700);
  const silenceNoiseDb = Number(options.silenceNoiseDb ?? -30);
  if (![silenceMinMs, silenceNoiseDb].every(Number.isFinite)) {
    console.error('❌ 信号参数必须为数字');
    process.exit(1);
  }

  const silenceFilter = `silencedetect=noise=${silenceNoiseDb}dB:d=${(silenceMinMs / 1000).toFixed(3)}`;

  console.log(`📹 分析信号: ${videoFile}`);
  console.log(`   静音: noise=${silenceNoiseDb}dB, min=${silenceMinMs}ms`);

  try {
    const silenceStderr = await collectStderr(videoFile, ['-af', silenceFilter]);

    const signals: Signals = {
      duration: getVideoDuration(videoFile),
      silences: parseSilenceDetect(silenceStderr),
    };

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(signals, null, 2), 'utf8');

    console.log(`✅ 写入 ${outFile}`);
    console.log(`   duration=${signals.duration.toFixed(2)}s  silences=${signals.silences.length}`);
  } catch (err) {
    console.error(`❌ 分析失败: ${(err as Error).message}`);
    process.exit(1);
  }
}
