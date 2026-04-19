import fs from 'fs';
import path from 'path';
import { parseSrt } from '../core/srt.js';
import {
  HESITATION_FILLERS,
  SEMANTIC_FILLERS,
  isCueFillerOnly,
  isHesitationFiller,
} from '../core/fillers.js';
import type {
  DeleteEntry,
  Signals,
  SrtCue,
  WhisperTranscript,
  WhisperWord,
} from '../core/types.js';

export interface SuggestEditsOptions {
  output?: string;
  srt?: string;
  signals?: string;
  words?: string;
  gapMin?: string;
  midCueMin?: string;
  edgePad?: string;
  stdout?: boolean;
}

interface SuggestInputs {
  cues: SrtCue[];
  signals: Signals | null;
  duration: number;
  wordsByCue: Map<number, WhisperWord[]>;
}

function resolveInputs(baseDir: string, options: SuggestEditsOptions): SuggestInputs {
  const workDir = fs.existsSync(path.join(baseDir, 'work'))
    ? path.join(baseDir, 'work')
    : baseDir;
  const srtPath = options.srt ? path.resolve(options.srt) : path.join(workDir, 'transcript.srt');
  const signalsPath = options.signals
    ? path.resolve(options.signals)
    : path.join(workDir, 'signals.json');
  const wordsPath = options.words
    ? path.resolve(options.words)
    : path.join(workDir, 'transcript.words.json');

  if (!fs.existsSync(srtPath)) {
    throw new Error(`找不到 transcript.srt: ${srtPath}`);
  }
  const cues = parseSrt(fs.readFileSync(srtPath, 'utf8'));
  if (cues.length === 0) throw new Error('transcript.srt 解析后 cue 数为 0');

  let signals: Signals | null = null;
  if (fs.existsSync(signalsPath)) {
    try {
      signals = JSON.parse(fs.readFileSync(signalsPath, 'utf8')) as Signals;
    } catch {
      signals = null;
    }
  }

  const wordsByCue = new Map<number, WhisperWord[]>();
  if (fs.existsSync(wordsPath)) {
    try {
      const doc = JSON.parse(fs.readFileSync(wordsPath, 'utf8')) as WhisperTranscript;
      for (const utt of doc.utterances || []) {
        const list: WhisperWord[] = [];
        for (const w of utt.words || []) {
          if (Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start) list.push(w);
        }
        if (list.length > 0 && Number.isFinite(utt.id)) wordsByCue.set(utt.id, list);
      }
    } catch {
      // ignore — words JSON optional
    }
  }

  const duration = signals?.duration ?? cues[cues.length - 1].end;
  return { cues, signals, duration, wordsByCue };
}

function suggestGapDeletes(cues: SrtCue[], duration: number, gapMin: number, edgePad: number): DeleteEntry[] {
  const out: DeleteEntry[] = [];
  const first = cues[0];
  if (first.start >= gapMin) {
    out.push({
      type: 'range',
      start: 0.1,
      end: Math.max(0.15, first.start - edgePad),
      reason: `opening silence ${first.start.toFixed(2)}s`,
    });
  }
  for (let i = 0; i < cues.length - 1; i += 1) {
    const a = cues[i];
    const b = cues[i + 1];
    const gap = b.start - a.end;
    if (gap >= gapMin) {
      out.push({
        type: 'range',
        start: +(a.end + edgePad).toFixed(3),
        end: +(b.start - edgePad).toFixed(3),
        reason: `gap ${gap.toFixed(2)}s cue ${a.idx}-${b.idx}`,
      });
    }
  }
  const last = cues[cues.length - 1];
  if (duration - last.end >= gapMin) {
    out.push({
      type: 'range',
      start: +(last.end + edgePad).toFixed(3),
      end: +(duration - 0.05).toFixed(3),
      reason: `tail silence ${(duration - last.end).toFixed(2)}s`,
    });
  }
  return out;
}

function suggestMidCueDeletes(cues: SrtCue[], signals: Signals | null, midCueMin: number): DeleteEntry[] {
  if (!signals?.silences) return [];
  const out: DeleteEntry[] = [];
  for (const s of signals.silences) {
    const dur = s.end - s.start;
    if (dur < midCueMin) continue;
    const cue = cues.find((c) => c.start <= s.start + 0.05 && c.end >= s.end - 0.05);
    if (!cue) continue;
    out.push({
      type: 'range',
      start: +s.start.toFixed(3),
      end: +s.end.toFixed(3),
      reason: `mid-cue pause ${dur.toFixed(2)}s in cue ${cue.idx}`,
    });
  }
  return out;
}

function suggestFillerCueDeletes(cues: SrtCue[]): DeleteEntry[] {
  return cues
    .filter((c) => isCueFillerOnly(c.text))
    .map((c) => ({
      type: 'cue' as const,
      cueIdx: c.idx,
      reason: `filler_only: "${c.text}" (${(c.end - c.start).toFixed(2)}s)`,
    }));
}

interface HesitationHit {
  cueIdx: number;
  pattern: string;
  occurrence: number;
}

function stripPunct(token: string): string {
  // Strip unicode punctuation + whitespace; keep letters / CJK / digits.
  return token.replace(/[\p{P}\s]+/gu, '');
}

function suggestMidCueHesitations(
  cues: SrtCue[],
  wordsByCue: Map<number, WhisperWord[]>,
  fillerOnlyCueIdx: Set<number>
): { entries: DeleteEntry[]; byPattern: Record<string, number> } {
  const hits: HesitationHit[] = [];
  const byPattern: Record<string, number> = {};
  for (const cue of cues) {
    if (fillerOnlyCueIdx.has(cue.idx)) continue;
    const words = wordsByCue.get(cue.idx);
    if (!words || words.length === 0) continue;
    const counterPerPattern: Record<string, number> = {};
    for (const w of words) {
      const clean = stripPunct((w.text || '').trim());
      if (!clean) continue;
      // Only match the whole (de-punctuated) token. Avoids false hits like "啊"
      // inside "调酷啊" (sentence-final particle attached to content).
      if (!isHesitationFiller(clean)) continue;
      const f = clean;
      counterPerPattern[f] = (counterPerPattern[f] || 0) + 1;
      hits.push({ cueIdx: cue.idx, pattern: f, occurrence: counterPerPattern[f] });
      byPattern[f] = (byPattern[f] || 0) + 1;
    }
  }
  const entries: DeleteEntry[] = hits.map((h) => ({
    type: 'words' as const,
    cueIdx: h.cueIdx,
    pattern: h.pattern,
    ...(h.occurrence > 1 ? { occurrence: h.occurrence } : {}),
    reason: `mid-cue hesitation "${h.pattern}"${h.occurrence > 1 ? ` #${h.occurrence}` : ''}`,
  }));
  return { entries, byPattern };
}

function countSemanticFillers(
  cues: SrtCue[],
  wordsByCue: Map<number, WhisperWord[]>,
  fillerOnlyCueIdx: Set<number>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cue of cues) {
    if (fillerOnlyCueIdx.has(cue.idx)) continue;
    const words = wordsByCue.get(cue.idx);
    if (!words) continue;
    for (const w of words) {
      const token = (w.text || '').trim();
      if (!token) continue;
      for (const f of SEMANTIC_FILLERS) {
        if (token.includes(f)) {
          counts[f] = (counts[f] || 0) + 1;
          break;
        }
      }
    }
  }
  return counts;
}

export async function suggestEdits(baseDir: string, options: SuggestEditsOptions): Promise<void> {
  const gapMin = Number(options.gapMin ?? 1.8);
  const midCueMin = Number(options.midCueMin ?? 1.3);
  const edgePad = Number(options.edgePad ?? 0.15);

  const { cues, signals, duration, wordsByCue } = resolveInputs(path.resolve(baseDir), options);

  const gap = suggestGapDeletes(cues, duration, gapMin, edgePad);
  const midCue = suggestMidCueDeletes(cues, signals, midCueMin);
  const filler = suggestFillerCueDeletes(cues);
  const fillerOnlyIdx = new Set(cues.filter((c) => isCueFillerOnly(c.text)).map((c) => c.idx));
  const { entries: hesitationEntries, byPattern: hesitationByPattern } = suggestMidCueHesitations(
    cues,
    wordsByCue,
    fillerOnlyIdx
  );
  const semanticCounts = countSemanticFillers(cues, wordsByCue, fillerOnlyIdx);

  const all: DeleteEntry[] = [...gap, ...midCue, ...filler, ...hesitationEntries];

  const hesitationSummary = Object.entries(hesitationByPattern)
    .map(([p, n]) => `${p}×${n}`)
    .join(' ') || '无';
  const semanticSummary = Object.entries(semanticCounts)
    .map(([p, n]) => `${p}×${n}`)
    .join(' ') || '无';

  const payload = {
    schema_version: 2 as const,
    deletes: all,
    textEdits: [],
    notes: [
      `suggest-edits 机械扫描结果：`,
      `  gap>=${gapMin.toFixed(2)}s 间隔 = ${gap.length} 条`,
      `  mid-cue>=${midCueMin.toFixed(2)}s 停顿 = ${midCue.length} 条`,
      `  filler-only cues = ${filler.length} 条`,
      `  mid-cue hesitation (嗯/呃/啊/哦/um/uh) = ${hesitationEntries.length} 条 [${hesitationSummary}]`,
      ``,
      `未自动切（需 LLM 判断——中文里有实义用法）：`,
      `  semantic filler mid-cue counts: [${semanticSummary}]`,
      ``,
      `LLM 务必再过一遍：合并 stutter/false-start 为 cue 范围、删除未完成片段、按上下文决定是否删 semantic filler、产出 textEdits。`,
    ].join('\n'),
  };

  const workDir = fs.existsSync(path.join(path.resolve(baseDir), 'work'))
    ? path.join(path.resolve(baseDir), 'work')
    : path.resolve(baseDir);
  const outPath = options.output
    ? path.resolve(options.output)
    : path.join(workDir, 'edits.candidates.json');

  const json = JSON.stringify(payload, null, 2);

  if (options.stdout) {
    process.stdout.write(json + '\n');
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json, 'utf8');
    console.log(`✅ 候选 edits 已写入: ${outPath}`);
    console.log(
      `   gap=${gap.length}  mid-cue=${midCue.length}  filler-only=${filler.length}  hesitation=${hesitationEntries.length}  合计 ${all.length}`
    );
    console.log(`📝 下一步：LLM 读 transcript.srt + candidates，合并 stutter / 加 textEdits，写 edits.json`);
  }
}
