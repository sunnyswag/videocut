import type { DeleteSegment, SrtCue, Subtitle, WhisperWord } from './types.js';

export function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export function generateSrt(subtitles: Subtitle[]): string {
  return subtitles
    .map((s, i) => `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text}\n`)
    .join('\n');
}

function segOutputLength(seg: DeleteSegment, idx: number, renderedDurations?: number[]): number {
  if (renderedDurations && Number.isFinite(renderedDurations[idx]) && renderedDurations[idx] > 0) {
    return renderedDurations[idx];
  }
  return seg.end - seg.start;
}

function remapIntervalToKeepSegments(
  start: number,
  end: number,
  keepSegments: DeleteSegment[],
  renderedDurations?: number[]
): DeleteSegment[] {
  const out: DeleteSegment[] = [];
  let cumulative = 0;

  for (let i = 0; i < keepSegments.length; i += 1) {
    const seg = keepSegments[i];
    const sourceLen = seg.end - seg.start;
    const outLen = segOutputLength(seg, i, renderedDurations);
    const scale = sourceLen > 0 ? outLen / sourceLen : 1;
    const overlapStart = Math.max(start, seg.start);
    const overlapEnd = Math.min(end, seg.end);
    if (overlapEnd > overlapStart) {
      out.push({
        start: cumulative + (overlapStart - seg.start) * scale,
        end: cumulative + (overlapEnd - seg.start) * scale,
      });
    }
    cumulative += outLen;
  }

  return out;
}

const MAP_TOLERANCE = 0.05;

function mapSourceToOutput(
  t: number,
  keepSegments: DeleteSegment[],
  renderedDurations?: number[]
): number | undefined {
  let cumulative = 0;
  for (let i = 0; i < keepSegments.length; i += 1) {
    const seg = keepSegments[i];
    const sourceLen = seg.end - seg.start;
    const outLen = segOutputLength(seg, i, renderedDurations);
    const scale = sourceLen > 0 ? outLen / sourceLen : 1;
    if (t >= seg.start - MAP_TOLERANCE && t <= seg.end + MAP_TOLERANCE) {
      const clamped = Math.min(Math.max(t, seg.start), seg.end);
      return cumulative + (clamped - seg.start) * scale;
    }
    cumulative += outLen;
  }
  return undefined;
}

interface MappedWord {
  text: string;
  start: number;
  end: number;
}

function mapCueByWords(
  cue: SrtCue,
  cueWords: WhisperWord[],
  keepSegments: DeleteSegment[],
  renderedDurations?: number[]
): Subtitle[] {
  const survivors: MappedWord[] = [];
  for (const w of cueWords) {
    const mid = (w.start + w.end) / 2;
    const outMid = mapSourceToOutput(mid, keepSegments, renderedDurations);
    if (outMid === undefined) continue;
    const outStart = mapSourceToOutput(Math.max(w.start, cue.start), keepSegments, renderedDurations);
    const outEnd = mapSourceToOutput(Math.min(w.end, cue.end), keepSegments, renderedDurations);
    if (outStart === undefined || outEnd === undefined || outEnd <= outStart) {
      survivors.push({ text: w.text, start: outMid, end: outMid + 0.05 });
    } else {
      survivors.push({ text: w.text, start: outStart, end: outEnd });
    }
  }

  if (survivors.length === 0) return [];

  const groups: MappedWord[][] = [];
  let group: MappedWord[] = [];
  const GAP = 0.3;
  for (const s of survivors) {
    if (group.length > 0 && s.start - group[group.length - 1].end > GAP) {
      groups.push(group);
      group = [];
    }
    group.push(s);
  }
  if (group.length > 0) groups.push(group);

  return groups
    .map((g) => {
      const text = g.map((w) => w.text).join('').trim() || cue.text;
      return { text, start: g[0].start, end: g[g.length - 1].end };
    })
    .filter((s) => s.end - s.start >= 0.05);
}

export function remapSrtToKeepSegments(
  srtCues: SrtCue[],
  keepSegments: DeleteSegment[],
  wordsByCue?: Map<number, WhisperWord[]>,
  textEditedIdx?: Set<number>,
  renderedDurations?: number[]
): Subtitle[] {
  const out: Subtitle[] = [];
  for (const cue of srtCues) {
    const mapped = remapIntervalToKeepSegments(cue.start, cue.end, keepSegments, renderedDurations);
    if (mapped.length === 0) continue;

    const cueWords = wordsByCue?.get(cue.idx) ?? [];
    const cueFullyKept = mapped.length === 1 && mapped[0].end - mapped[0].start >= cue.end - cue.start - 0.02;
    const cueHasTextEdit = textEditedIdx?.has(cue.idx) ?? false;

    if (cueFullyKept || cueWords.length === 0 || cueHasTextEdit) {
      for (const seg of mapped) {
        if (seg.end - seg.start < 0.05) continue;
        const prev = out[out.length - 1];
        if (prev && prev.text === cue.text && Math.abs(seg.start - prev.end) < 0.05) {
          prev.end = seg.end;
        } else {
          out.push({ text: cue.text, start: seg.start, end: seg.end });
        }
      }
    } else {
      const split = mapCueByWords(cue, cueWords, keepSegments, renderedDurations);
      out.push(...split);
    }
  }
  return out;
}
