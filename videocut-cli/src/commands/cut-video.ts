import fs from 'fs';
import path from 'path';
import { computeCutPlan, renderKeepSegments } from '../core/video.js';
import { parseSrt } from '../core/srt.js';
import { generateSrt, remapSrtToKeepSegments } from '../core/subtitle.js';
import type { DeleteEntry, DeleteSegment, SrtCue, TextEditEntry, WhisperTranscript, WhisperWord } from '../core/types.js';

export interface CutCommandOptions {
  output?: string;
  srt?: string;
  words?: string;
  srtOut?: string;
  noSrtOut?: boolean;
  snap?: boolean;
  project?: string;
}

interface ParsedEdits {
  entries: DeleteEntry[];
  textEdits: TextEditEntry[];
  notes?: string;
}

function parseEditsFile(filePath: string): ParsedEdits {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (Array.isArray(raw)) {
    const entries: DeleteEntry[] = raw.map((seg, i) => {
      const s = Number(seg.start);
      const e = Number(seg.end);
      if (!Number.isFinite(s) || !Number.isFinite(e)) {
        throw new Error(`legacy edits[${i}] 缺少 start/end`);
      }
      return { type: 'range', start: s, end: e, reason: seg.reason };
    });
    return { entries, textEdits: [] };
  }

  if (raw && typeof raw === 'object' && Array.isArray(raw.deletes)) {
    const textEdits: TextEditEntry[] = Array.isArray(raw.textEdits) ? raw.textEdits : [];
    return { entries: raw.deletes as DeleteEntry[], textEdits, notes: raw.notes };
  }

  throw new Error('edits.json 格式错误：应为数组或 { deletes: [...] }');
}

function applyTextEdits(
  cues: SrtCue[],
  textEdits: TextEditEntry[]
): { applied: number; invalid: string[] } {
  const cueByIdx = new Map<number, SrtCue>();
  for (const c of cues) cueByIdx.set(c.idx, c);
  const maxIdx = cues.length > 0 ? Math.max(...cues.map((c) => c.idx)) : 0;

  let applied = 0;
  const invalid: string[] = [];
  textEdits.forEach((edit, i) => {
    const cue = cueByIdx.get(edit.cueIdx);
    if (!cue) {
      invalid.push(`textEdits[${i}]: cueIdx=${edit.cueIdx} 超出 SRT 范围 (1..${maxIdx})`);
      return;
    }
    if (typeof edit.newText !== 'string' || edit.newText.length === 0) {
      invalid.push(`textEdits[${i}]: newText 必须是非空字符串`);
      return;
    }
    cue.text = edit.newText;
    applied += 1;
  });
  return { applied, invalid };
}

function resolveEditsToSegments(
  entries: DeleteEntry[],
  cues: SrtCue[],
  wordsByCue: Map<number, WhisperWord[]>
): { segments: DeleteSegment[]; invalid: string[] } {
  const cueByIdx = new Map<number, SrtCue>();
  for (const c of cues) cueByIdx.set(c.idx, c);
  const maxIdx = cues.length > 0 ? Math.max(...cues.map((c) => c.idx)) : 0;

  const segments: DeleteSegment[] = [];
  const invalid: string[] = [];

  entries.forEach((entry, i) => {
    if (entry.type === 'cue') {
      const startCue = cueByIdx.get(entry.cueIdx);
      if (!startCue) {
        invalid.push(`deletes[${i}]: cueIdx=${entry.cueIdx} 超出 SRT 范围 (1..${maxIdx})`);
        return;
      }
      let end = startCue.end;
      if (entry.cueIdxEnd !== undefined) {
        const endCue = cueByIdx.get(entry.cueIdxEnd);
        if (!endCue) {
          invalid.push(`deletes[${i}]: cueIdxEnd=${entry.cueIdxEnd} 超出 SRT 范围 (1..${maxIdx})`);
          return;
        }
        if (endCue.end < startCue.start) {
          invalid.push(`deletes[${i}]: cueIdxEnd (${entry.cueIdxEnd}) 早于 cueIdx (${entry.cueIdx})`);
          return;
        }
        end = endCue.end;
      }
      segments.push({ start: startCue.start, end });
      return;
    }
    if (entry.type === 'range') {
      const s = Number(entry.start);
      const e = Number(entry.end);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
        invalid.push(`deletes[${i}]: range 无效 start=${entry.start} end=${entry.end}`);
        return;
      }
      segments.push({ start: s, end: e });
      return;
    }
    if (entry.type === 'words') {
      const cue = cueByIdx.get(entry.cueIdx);
      if (!cue) {
        invalid.push(`deletes[${i}]: words.cueIdx=${entry.cueIdx} 超出 SRT 范围 (1..${maxIdx})`);
        return;
      }
      const words = wordsByCue.get(entry.cueIdx) ?? [];
      if (words.length === 0) {
        invalid.push(`deletes[${i}]: words.cueIdx=${entry.cueIdx} 没有 words 数据（检查 transcript.words.json）`);
        return;
      }
      const pattern = (entry.pattern || '').trim();
      if (!pattern) {
        invalid.push(`deletes[${i}]: words.pattern 必须是非空字符串`);
        return;
      }
      const occurrence = Math.max(1, Number(entry.occurrence ?? 1));
      const matches = words
        .map((w, idx) => ({ w, idx }))
        .filter(({ w }) => w.text.trim().includes(pattern));
      if (matches.length === 0) {
        invalid.push(`deletes[${i}]: words.pattern "${pattern}" 在 cue ${entry.cueIdx} 中找不到`);
        return;
      }
      if (occurrence > matches.length) {
        invalid.push(
          `deletes[${i}]: words.occurrence=${occurrence} 超过 cue ${entry.cueIdx} 中 "${pattern}" 的匹配数 (${matches.length})`
        );
        return;
      }
      const hit = matches[occurrence - 1];
      segments.push({ start: hit.w.start, end: hit.w.end });
      return;
    }
    invalid.push(`deletes[${i}]: 未知 type=${(entry as { type?: string }).type}`);
  });

  return { segments, invalid };
}

interface LoadedWords {
  flat: WhisperWord[];
  byCue: Map<number, WhisperWord[]>;
}

function loadWords(wordsPath: string | undefined): LoadedWords {
  const empty: LoadedWords = { flat: [], byCue: new Map() };
  if (!wordsPath || !fs.existsSync(wordsPath)) return empty;
  try {
    const doc = JSON.parse(fs.readFileSync(wordsPath, 'utf8')) as WhisperTranscript;
    const flat: WhisperWord[] = [];
    const byCue = new Map<number, WhisperWord[]>();
    for (const utt of doc.utterances || []) {
      const list: WhisperWord[] = [];
      for (const w of utt.words || []) {
        if (Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start) {
          flat.push(w);
          list.push(w);
        }
      }
      if (list.length > 0 && Number.isFinite(utt.id)) {
        byCue.set(utt.id, list);
      }
    }
    flat.sort((a, b) => a.start - b.start);
    return { flat, byCue };
  } catch {
    return empty;
  }
}

function snapToWordBoundary(
  segments: DeleteSegment[],
  words: WhisperWord[],
  windowSec = 0.15
): DeleteSegment[] {
  if (words.length === 0) return segments;

  const snapStart = (t: number): number => {
    let best = t;
    let bestDist = Infinity;
    for (const w of words) {
      if (w.end < t - windowSec) continue;
      if (w.end > t + windowSec) break;
      const d = Math.abs(w.end - t);
      if (d < bestDist) { bestDist = d; best = w.end; }
    }
    return best;
  };

  const snapEnd = (t: number): number => {
    let best = t;
    let bestDist = Infinity;
    for (const w of words) {
      if (w.start < t - windowSec) continue;
      if (w.start > t + windowSec) break;
      const d = Math.abs(w.start - t);
      if (d < bestDist) { bestDist = d; best = w.start; }
    }
    return best;
  };

  return segments.map((seg) => ({
    start: snapStart(seg.start),
    end: snapEnd(seg.end),
  }));
}

export async function cutVideo(
  videoPath: string,
  editsPath: string,
  options: CutCommandOptions
): Promise<void> {
  const videoFile = path.resolve(videoPath);
  const editsFile = path.resolve(editsPath);

  if (!fs.existsSync(videoFile)) {
    console.error(`❌ 找不到视频文件: ${videoFile}`);
    process.exit(1);
  }
  if (!fs.existsSync(editsFile)) {
    console.error(`❌ 找不到 edits 文件: ${editsFile}`);
    process.exit(1);
  }

  let parsed: ParsedEdits;
  try {
    parsed = parseEditsFile(editsFile);
  } catch (err) {
    console.error(`❌ 解析 edits 失败: ${(err as Error).message}`);
    process.exit(1);
  }

  if (parsed.entries.length === 0 && parsed.textEdits.length === 0) {
    console.error('❌ edits 为空（deletes 和 textEdits 都没有），无需剪辑');
    process.exit(1);
  }

  const editsDir = path.dirname(editsFile);
  // If edits.json lives in a `work/` dir with a sibling `final/`, default output goes into final/.
  // Otherwise fall back to placing edited.mp4 next to edits.json.
  const isWorkDir = path.basename(editsDir) === 'work';
  const siblingFinal = path.join(path.dirname(editsDir), 'final');
  const defaultOutput = isWorkDir
    ? path.join(siblingFinal, 'edited.mp4')
    : path.join(editsDir, 'edited.mp4');
  const outputFile = path.resolve(options.output || defaultOutput);

  const srtPath = path.resolve(options.srt || path.join(editsDir, 'transcript.srt'));
  const wordsPath = path.resolve(options.words || path.join(editsDir, 'transcript.words.json'));

  const hasRequiredSrt =
    parsed.entries.some((e) => e.type === 'cue') || parsed.textEdits.length > 0;
  let cues: SrtCue[] = [];
  if (hasRequiredSrt || !options.noSrtOut) {
    if (!fs.existsSync(srtPath)) {
      if (hasRequiredSrt) {
        console.error(`❌ edits 引用了 cueIdx / textEdits，但找不到 SRT: ${srtPath}`);
        process.exit(1);
      }
    } else {
      cues = parseSrt(fs.readFileSync(srtPath, 'utf8'));
    }
  }

  const textEditedIdx = new Set<number>();
  if (parsed.textEdits.length > 0) {
    const { applied, invalid: textInvalid } = applyTextEdits(cues, parsed.textEdits);
    if (textInvalid.length > 0) {
      console.error('❌ textEdits 含非法条目:');
      for (const msg of textInvalid) console.error(`   - ${msg}`);
      process.exit(1);
    }
    for (const edit of parsed.textEdits) textEditedIdx.add(edit.cueIdx);
    console.log(`✏️  文本修正: ${applied} 条 cue`);
  }

  const loaded = loadWords(wordsPath);
  const { segments: rawSegments, invalid } = resolveEditsToSegments(
    parsed.entries,
    cues,
    loaded.byCue
  );
  if (invalid.length > 0) {
    console.error('❌ edits.json 含非法条目:');
    for (const msg of invalid) console.error(`   - ${msg}`);
    process.exit(1);
  }

  let segments = rawSegments;
  if (options.snap !== false && loaded.flat.length > 0) {
    segments = snapToWordBoundary(segments, loaded.flat);
    console.log(`🎯 词边界吸附: ${loaded.flat.length} 个词，±150ms 窗口`);
  }

  console.log(`📹 输入视频: ${videoFile}`);
  console.log(`📹 输出视频: ${outputFile}`);
  console.log(`✂️  删除片段数: ${segments.length}`);

  const plan = computeCutPlan(videoFile, segments, options.project);
  if (plan.keepSegments.length === 0) {
    console.error('❌ 删除范围覆盖整个视频，无法输出');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.rmSync(outputFile, { force: true });
  const srtOutFile = path.resolve(
    options.srtOut || path.join(path.dirname(outputFile), `${path.basename(outputFile, path.extname(outputFile))}.srt`)
  );
  if (!options.noSrtOut) fs.rmSync(srtOutFile, { force: true });
  console.log(`⚙️  参数: buffer=${(plan.bufferSec * 1000).toFixed(0)}ms, crossfade=${(plan.crossfadeSec * 1000).toFixed(0)}ms`);
  console.log(`保留 ${plan.keepSegments.length} 段，删除 ${plan.mergedDelete.length} 段`);
  const renderedDurations = renderKeepSegments(videoFile, plan.keepSegments, outputFile, plan.crossfadeSec);

  if (!options.noSrtOut && cues.length > 0) {
    const remapped = remapSrtToKeepSegments(cues, plan.keepSegments, loaded.byCue, textEditedIdx, renderedDurations);
    fs.writeFileSync(srtOutFile, generateSrt(remapped), 'utf8');
    console.log(`📝 输出字幕: ${srtOutFile} (${remapped.length} 条)`);
  }

  console.log(`\n✅ 剪辑完成`);
  console.log(`   原时长: ${plan.duration.toFixed(2)}s`);
  const kept = plan.keepSegments.reduce((acc, s) => acc + (s.end - s.start), 0);
  console.log(`   新时长: ${kept.toFixed(2)}s`);
  console.log(`   删除:   ${(plan.duration - kept).toFixed(2)}s`);
  if (parsed.notes) console.log(`📝 notes: ${parsed.notes}`);
}
