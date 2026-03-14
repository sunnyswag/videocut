import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { SubtitleAlignment, SubtitleStylePreset, Word } from '../types';

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

interface SubtitleOverlayProps {
  currentTime: number;
  words: Word[];
  selected: Set<number>;
  stylePreset: SubtitleStylePreset;
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
const TRAILING_PUNCT_RE = /[([{/"'`-]$/;
const LEADING_PUNCT_RE = /^[,.:;!?%)}\]/"'`]/;

function needsSpace(previous: string, next: string): boolean {
  const prevChar = previous.slice(-1);
  const nextChar = next.charAt(0);
  if (!prevChar || !nextChar) return false;
  if (/\s$/.test(previous) || /^\s/.test(next)) return false;
  if (CJK_RE.test(prevChar) || CJK_RE.test(nextChar)) return false;
  if (TRAILING_PUNCT_RE.test(prevChar) || LEADING_PUNCT_RE.test(nextChar)) return false;
  return /[A-Za-z0-9]/.test(prevChar) && /[A-Za-z0-9]/.test(nextChar);
}

function joinSubtitleText(parts: string[]): string {
  return parts.reduce((acc, part) => {
    const token = part.trim();
    if (!token) return acc;
    if (!acc) return token;
    return `${acc}${needsSpace(acc, token) ? ' ' : ''}${token}`;
  }, '');
}

function buildCues(words: Word[], selected: Set<number>): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let currentWords: string[] = [];
  let cueStart = 0;
  let cueEnd = 0;
  let lastWord: Word | null = null;

  const flush = () => {
    const text = joinSubtitleText(currentWords);
    if (text) {
      cues.push({ start: cueStart, end: cueEnd, text });
    }
    currentWords = [];
    cueStart = 0;
    cueEnd = 0;
    lastWord = null;
  };

  words.forEach((word, index) => {
    const text = (word.text || '').trim();
    const deleted = selected.has(index) || word.opt === 'del';
    const isBlank = !text;
    if (deleted || isBlank) {
      flush();
      return;
    }

    const shouldContinue =
      lastWord &&
      word.parentIndex === lastWord.parentIndex &&
      word.start - lastWord.end <= 0.45 &&
      word.start >= lastWord.start;

    if (!shouldContinue) {
      flush();
      cueStart = word.start;
    }

    currentWords.push(text);
    cueEnd = word.end;
    lastWord = word;
  });

  flush();
  return cues;
}

function getOverlayAlignmentClass(alignment: SubtitleAlignment): string {
  switch (alignment) {
    case 'bottom-left':
      return 'subtitle-overlay align-bottom-left';
    case 'bottom-right':
      return 'subtitle-overlay align-bottom-right';
    case 'top-left':
      return 'subtitle-overlay align-top-left';
    case 'top-center':
      return 'subtitle-overlay align-top-center';
    case 'top-right':
      return 'subtitle-overlay align-top-right';
    case 'bottom-center':
    default:
      return 'subtitle-overlay align-bottom-center';
  }
}

export function SubtitleOverlay({ currentTime, words, selected, stylePreset }: SubtitleOverlayProps) {
  const cues = useMemo(() => buildCues(words, selected), [words, selected]);
  const activeCue = useMemo(
    () => cues.find((cue) => currentTime >= cue.start && currentTime <= cue.end) || null,
    [cues, currentTime]
  );
  const containsCjk = Boolean(activeCue?.text && CJK_RE.test(activeCue.text));

  const style = useMemo<CSSProperties>(() => {
    const stroke = Math.max(0, stylePreset.outlineWidth);
    const shadowStrength = Math.max(0, stylePreset.shadow);
    const effectiveLetterSpacing = containsCjk ? 0 : stylePreset.letterSpacing;
    const textShadow = shadowStrength > 0 ? `0 ${shadowStrength}px ${shadowStrength * 3}px rgba(0, 0, 0, 0.45)` : undefined;

    return {
      color: stylePreset.textColor,
      fontSize: `${stylePreset.fontSize}px`,
      fontWeight: stylePreset.fontWeight,
      letterSpacing: `${effectiveLetterSpacing}px`,
      maxWidth: `${stylePreset.maxWidthPercent}%`,
      fontFamily: stylePreset.fontFamilyHint || undefined,
      textShadow,
      WebkitTextStroke: stroke > 0 ? `${Math.max(0.5, Math.min(2, stroke))}px ${stylePreset.outlineColor}` : undefined,
      paintOrder: 'stroke fill',
      marginBottom: stylePreset.alignment.startsWith('bottom') ? `${stylePreset.bottomOffset}px` : undefined,
      marginTop: stylePreset.alignment.startsWith('top') ? `${stylePreset.bottomOffset}px` : undefined,
    };
  }, [containsCjk, stylePreset]);

  if (!activeCue?.text) return null;

  return (
    <div className={getOverlayAlignmentClass(stylePreset.alignment)} aria-hidden="true">
      <div className="subtitle-overlay-text" style={style}>
        {activeCue.text}
      </div>
    </div>
  );
}
