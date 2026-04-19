import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

export interface WhisperOptions {
  videoPath: string;
  outSrt: string;
  outWordsJson: string;
  model?: string;
  language?: string;
  device?: string;
  computeType?: string;
  hotwordsFile?: string;
  vadFilter?: boolean;
  beamSize?: number;
  pythonPath?: string;
  scriptPath?: string;
}

function resolveScriptPath(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const here = fileURLToPath(import.meta.url);
  const candidates = [
    path.resolve(path.dirname(here), '..', '..', 'python', 'whisper_transcribe.py'),
    path.resolve(path.dirname(here), '..', '..', '..', 'python', 'whisper_transcribe.py'),
    path.resolve(process.cwd(), 'python', 'whisper_transcribe.py'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `找不到 whisper_transcribe.py；尝试了:\n  ${candidates.join('\n  ')}\n` +
    '可通过 --python-script 指定绝对路径。'
  );
}

function resolvePython(explicit?: string): string {
  return explicit || process.env.VIDEOCUT_PYTHON || 'python3';
}

export async function runWhisper(opts: WhisperOptions): Promise<void> {
  const script = resolveScriptPath(opts.scriptPath);
  const python = resolvePython(opts.pythonPath);

  const args: string[] = [
    script,
    '--video', path.resolve(opts.videoPath),
    '--out-srt', path.resolve(opts.outSrt),
    '--out-json', path.resolve(opts.outWordsJson),
    '--model', opts.model || 'large-v3-turbo',
    '--language', opts.language || 'auto',
    '--device', opts.device || 'auto',
    '--compute-type', opts.computeType || 'auto',
    '--vad-filter', opts.vadFilter === false ? 'false' : 'true',
    '--beam-size', String(opts.beamSize ?? 5),
  ];
  if (opts.hotwordsFile && fs.existsSync(opts.hotwordsFile)) {
    args.push('--hotwords', path.resolve(opts.hotwordsFile));
  }

  fs.mkdirSync(path.dirname(path.resolve(opts.outSrt)), { recursive: true });
  fs.mkdirSync(path.dirname(path.resolve(opts.outWordsJson)), { recursive: true });

  console.log(`🎙️  启动 faster-whisper: ${python} ${path.basename(script)}`);

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout?.on('data', () => { /* script is silent on stdout */ });
    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    child.on('error', (err) => {
      reject(new Error(`启动 Python 失败 (${python}): ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`faster-whisper 退出码 ${code}`));
        return;
      }
      if (!fs.existsSync(opts.outSrt)) {
        reject(new Error(`faster-whisper 成功退出但缺少 ${opts.outSrt}`));
        return;
      }
      if (!fs.existsSync(opts.outWordsJson)) {
        reject(new Error(`faster-whisper 成功退出但缺少 ${opts.outWordsJson}`));
        return;
      }
      resolve();
    });
  });
}
