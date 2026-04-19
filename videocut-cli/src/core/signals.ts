import type { SilenceRange } from './types.js';

const SILENCE_START_RE = /silence_start:\s*(-?\d+(?:\.\d+)?)/g;
const SILENCE_END_RE = /silence_end:\s*(-?\d+(?:\.\d+)?)/g;

export function parseSilenceDetect(stderr: string): SilenceRange[] {
  const starts: number[] = [];
  const ends: number[] = [];
  let m: RegExpExecArray | null;
  SILENCE_START_RE.lastIndex = 0;
  while ((m = SILENCE_START_RE.exec(stderr)) !== null) {
    starts.push(Math.max(0, parseFloat(m[1])));
  }
  SILENCE_END_RE.lastIndex = 0;
  while ((m = SILENCE_END_RE.exec(stderr)) !== null) {
    ends.push(parseFloat(m[1]));
  }

  const ranges: SilenceRange[] = [];
  const n = Math.min(starts.length, ends.length);
  for (let i = 0; i < n; i += 1) {
    if (ends[i] > starts[i]) {
      ranges.push({ start: starts[i], end: ends[i] });
    }
  }
  return ranges;
}
