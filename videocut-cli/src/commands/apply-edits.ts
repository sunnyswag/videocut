import fs from 'fs';
import path from 'path';
import { applyEditsToOpted, deepClone } from '../core/edits.js';
import type { Utterance, Edits } from '../core/types.js';

export function applyEdits(
  subtitlesPath: string,
  editsPath: string,
  options: { output?: string }
): void {
  const optedFile = path.resolve(subtitlesPath);
  const editsFile = path.resolve(editsPath);

  if (!fs.existsSync(optedFile)) {
    console.error(`❌ 找不到字幕文件: ${optedFile}`);
    process.exit(1);
  }

  const opted: Utterance[] = JSON.parse(fs.readFileSync(optedFile, 'utf8'));
  if (!Array.isArray(opted) || opted.length === 0) {
    console.error('❌ 字幕不是数组或为空');
    process.exit(1);
  }

  if (!fs.existsSync(editsFile)) {
    console.error(`❌ 找不到编辑文件: ${editsFile}`);
    process.exit(1);
  }

  const edits: Edits = JSON.parse(fs.readFileSync(editsFile, 'utf8'));
  const edited = applyEditsToOpted(deepClone(opted), edits);

  const outDir = path.dirname(optedFile);
  const outFile = options.output || path.join(outDir, 'subtitles_words_edited.json');
  fs.writeFileSync(outFile, JSON.stringify(edited, null, 2), 'utf8');
  console.log(`✅ 已保存: ${outFile}`);
}
