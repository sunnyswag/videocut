import fs from 'fs';
import path from 'path';
import type { Utterance, Word } from '../core/types.js';

const GAP_MS = 100;

function removeSpeechAttribute(obj: any): void {
  if (obj && typeof obj === 'object' && obj.attribute && obj.attribute.event === 'speech') {
    const keys = Object.keys(obj.attribute);
    if (keys.length === 1 && keys[0] === 'event') {
      delete obj.attribute;
    }
  }
}

function makeGapNode(startTime: number, endTime: number): Utterance {
  return { opt: 'blank', start_time: startTime, end_time: endTime, text: '' };
}

function isEmptyNode(item: any): boolean {
  const text = (item.text != null ? String(item.text) : '').trim();
  const start = typeof item.start_time === 'number' ? item.start_time : 0;
  const end = typeof item.end_time === 'number' ? item.end_time : start;
  return start === end && !text;
}

function editNode(cur: any): void {
  removeSpeechAttribute(cur);
  cur.opt = 'keep';
}

function produceGapNode(cur: any, preEndTime: number): Utterance | null {
  const currStart = typeof cur.start_time === 'number' ? cur.start_time : preEndTime;
  const gapMs = currStart - preEndTime;
  return gapMs > GAP_MS ? makeGapNode(preEndTime, currStart) : null;
}

function loopItems(items: any[], parentStartTime = 0): void {
  if (!Array.isArray(items)) return;
  let i = 0;
  while (i < items.length) {
    if (isEmptyNode(items[i])) {
      items.splice(i, 1);
      continue;
    }
    editNode(items[i]);

    const preEndTime = i > 0 ? items[i - 1].end_time : parentStartTime;
    const gap = produceGapNode(items[i], preEndTime);
    if (gap) {
      items.splice(i, 0, gap);
      i++;
    }
    loopItems(items[i].words, items[i].start_time);
    i++;
  }
}

export function generateSubtitles(
  jsonPath: string,
  options: { output?: string }
): void {
  const sourceFile = path.resolve(jsonPath);
  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ 找不到文件: ${sourceFile}`);
    process.exit(1);
  }

  const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  if (!Array.isArray(source.utterances)) {
    console.error('❌ 缺少 utterances 数组');
    process.exit(1);
  }

  loopItems(source.utterances);

  const outDir = path.dirname(path.dirname(sourceFile));
  const outFile = options.output || path.join(outDir, 'common', 'subtitles_words.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(source.utterances, null, 2), 'utf8');
  console.log(`✅ 已保存: ${outFile}`);
}
