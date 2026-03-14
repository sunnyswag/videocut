import fs from 'fs';
import path from 'path';
import type { Utterance } from '../core/types.js';

export function generateReview(
  subtitlesPath: string,
  options: { output?: string }
): void {
  const sourceFile = path.resolve(subtitlesPath);
  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ 找不到字幕文件: ${sourceFile}`);
    process.exit(1);
  }

  const opted: Utterance[] = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  if (!Array.isArray(opted) || opted.length === 0) {
    console.error('❌ 字幕不是数组或为空');
    process.exit(1);
  }

  let out = '';
  opted.forEach((u: Utterance, i: number) => {
    if (u.opt === 'blank') {
      out += `${i}|blank_${((u.end_time - u.start_time) / 1000).toFixed(1)}s\n`;
    } else {
      out += `${i}|${u.text}\n`;
      if (u.words) {
        u.words.forEach((w, j) => {
          out += `${j}|${w.text}\n`;
        });
      }
    }
  });

  const outFile = options.output || path.join(path.dirname(sourceFile), '..', '2_analysis', 'readable.txt');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out, 'utf8');
  console.log(`✅ 已保存: ${outFile}`);
}
