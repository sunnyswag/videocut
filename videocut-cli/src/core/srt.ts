import type { SrtCue } from './types.js';
import { formatSrtTime } from './subtitle.js';

const TIME_RE = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function parseSrtTime(h: string, m: string, s: string, ms: string): number {
  return (
    parseInt(h, 10) * 3600 +
    parseInt(m, 10) * 60 +
    parseInt(s, 10) +
    parseInt(ms.padEnd(3, '0').slice(0, 3), 10) / 1000
  );
}

export function parseSrt(text: string): SrtCue[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SrtCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd());
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length < 2) continue;

    let timeLineIdx = 0;
    let idx = cues.length + 1;
    const maybeIdx = Number(lines[0].trim());
    if (Number.isInteger(maybeIdx) && maybeIdx > 0 && TIME_RE.test(lines[1] || '')) {
      idx = maybeIdx;
      timeLineIdx = 1;
    } else if (!TIME_RE.test(lines[0])) {
      continue;
    }

    const timeMatch = TIME_RE.exec(lines[timeLineIdx]);
    if (!timeMatch) continue;
    const start = parseSrtTime(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
    const end = parseSrtTime(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
    const textLines = lines.slice(timeLineIdx + 1);
    const cueText = textLines.join('\n').trim();
    if (!cueText) continue;

    cues.push({ idx, start, end, text: cueText });
  }

  return cues;
}

export function serializeSrt(cues: SrtCue[]): string {
  return (
    cues
      .map((cue, i) => {
        const idx = cue.idx || i + 1;
        return `${idx}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`;
      })
      .join('\n')
  );
}
