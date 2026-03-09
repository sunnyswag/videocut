import { execSync } from 'child_process';
import type { Utterance, DeleteSegment, Subtitle } from './types.js';

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

function remapIntervalToKeepSegments(
  start: number,
  end: number,
  keepSegments: DeleteSegment[]
): DeleteSegment[] {
  const out: DeleteSegment[] = [];
  let cumulative = 0;
  
  for (const seg of keepSegments) {
    const overlapStart = Math.max(start, seg.start);
    const overlapEnd = Math.min(end, seg.end);
    if (overlapEnd > overlapStart) {
      out.push({
        start: cumulative + (overlapStart - seg.start),
        end: cumulative + (overlapEnd - seg.start),
      });
    }
    cumulative += seg.end - seg.start;
  }
  
  return out;
}

export function buildSubtitlesFromEditedOpted(
  editedOpted: Utterance[],
  audioOffset: number,
  keepSegments: DeleteSegment[]
): Subtitle[] {
  const sourceSubs: Subtitle[] = [];
  
  for (const node of editedOpted) {
    if (Array.isArray(node.words) && node.words.length > 0) {
      const keptWords: Subtitle[] = [];
      for (const w of node.words) {
        if ((w.opt || node.opt || 'keep') === 'del') continue;
        const text = (w.text || '').trim();
        if (!text) continue;
        keptWords.push({
          text,
          start: (typeof w.start_time === 'number' ? w.start_time : node.start_time || 0) / 1000 - audioOffset,
          end: (typeof w.end_time === 'number' ? w.end_time : node.end_time || 0) / 1000 - audioOffset,
        });
      }
      if (keptWords.length > 0) {
        sourceSubs.push({
          text: keptWords.map((w) => w.text).join(''),
          start: keptWords[0].start,
          end: keptWords[keptWords.length - 1].end,
        });
      }
      continue;
    }

    if ((node.opt || 'keep') === 'del') continue;
    const text = (node.text || '').trim();
    if (!text) continue;
    sourceSubs.push({
      text,
      start: (node.start_time || 0) / 1000 - audioOffset,
      end: (node.end_time || 0) / 1000 - audioOffset,
    });
  }

  const remapped: Subtitle[] = [];
  for (const sub of sourceSubs) {
    for (const seg of remapIntervalToKeepSegments(sub.start, sub.end, keepSegments)) {
      if (seg.end - seg.start < 0.05) continue;
      remapped.push({ text: sub.text, start: seg.start, end: seg.end });
    }
  }
  
  return remapped;
}

export function burnSubtitles(videoPath: string, srtPath: string, outputPath: string): void {
  const escapedSrtPath = srtPath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
  const filter = `subtitles='${escapedSrtPath}':force_style='FontSize=22,FontName=PingFang SC,Bold=1,PrimaryColour=&H0000deff,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30'`;
  const cmd = `ffmpeg -y -i "file:${videoPath}" -vf "${filter}" -c:a copy "file:${outputPath}"`;
  execSync(cmd, { stdio: 'pipe' });
}
