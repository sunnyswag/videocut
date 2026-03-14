import type { SubtitleAlignment, SubtitleStylePreset } from './types.js';

const ALLOWED_ALIGNMENTS: SubtitleAlignment[] = [
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'top-left',
  'top-center',
  'top-right',
];

const SAFE_FONT_RE = /^[\w\s\-.,()]+$/;
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const DEFAULT_SUBTITLE_STYLE: SubtitleStylePreset = {
  fontSize: 22,
  fontWeight: 700,
  textColor: '#FFFFFF',
  outlineColor: '#606060',
  outlineWidth: 1,
  letterSpacing: 0.8,
  bottomOffset: 22,
  alignment: 'bottom-center',
  maxWidthPercent: 86,
  shadow: 0,
  source: 'default',
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clampNumber(value, min, max) : fallback;
}

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) return fallback;
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase();
  }
  return value.toUpperCase();
}

function normalizeAlignment(value: unknown, fallback: SubtitleAlignment): SubtitleAlignment {
  return typeof value === 'string' && ALLOWED_ALIGNMENTS.includes(value as SubtitleAlignment)
    ? (value as SubtitleAlignment)
    : fallback;
}

function normalizeFontFamilyHint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || !SAFE_FONT_RE.test(trimmed)) return undefined;
  return trimmed;
}

export function normalizeSubtitleStylePreset(input: unknown): SubtitleStylePreset {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_SUBTITLE_STYLE };
  }

  const raw = input as Record<string, unknown>;
  const base = DEFAULT_SUBTITLE_STYLE;
  return {
    fontSize: readFiniteNumber(raw.fontSize, base.fontSize, 12, 72),
    fontWeight: readFiniteNumber(raw.fontWeight, base.fontWeight, 400, 900),
    textColor: normalizeColor(raw.textColor, base.textColor),
    outlineColor: normalizeColor(raw.outlineColor, base.outlineColor),
    outlineWidth: readFiniteNumber(raw.outlineWidth, base.outlineWidth, 0, 8),
    letterSpacing: readFiniteNumber(raw.letterSpacing, base.letterSpacing, -2, 8),
    bottomOffset: readFiniteNumber(raw.bottomOffset, base.bottomOffset, 0, 120),
    alignment: normalizeAlignment(raw.alignment, base.alignment),
    maxWidthPercent: readFiniteNumber(raw.maxWidthPercent, base.maxWidthPercent, 40, 100),
    shadow: readFiniteNumber(raw.shadow, base.shadow, 0, 8),
    fontFamilyHint: normalizeFontFamilyHint(raw.fontFamilyHint),
    source: typeof raw.source === 'string' ? raw.source : base.source,
    rawPrompt: typeof raw.rawPrompt === 'string' ? raw.rawPrompt : undefined,
  };
}

export function escapeAssText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/'/g, "\\'");
}

export function assColorFromHex(hex: string): string {
  const normalized = normalizeColor(hex, '#FFFFFF').slice(1);
  const rr = normalized.slice(0, 2);
  const gg = normalized.slice(2, 4);
  const bb = normalized.slice(4, 6);
  return `&H00${bb}${gg}${rr}`;
}

export function assAlignmentFromPreset(alignment: SubtitleAlignment): number {
  switch (alignment) {
    case 'bottom-left':
      return 1;
    case 'bottom-right':
      return 3;
    case 'top-left':
      return 7;
    case 'top-center':
      return 8;
    case 'top-right':
      return 9;
    case 'bottom-center':
    default:
      return 2;
  }
}
