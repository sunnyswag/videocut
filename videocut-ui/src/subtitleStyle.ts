import type { SubtitleAlignment, SubtitleStylePreset } from './types';

const STORAGE_KEY = 'videocut-subtitle-style';

const ALLOWED_ALIGNMENTS: SubtitleAlignment[] = [
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'top-left',
  'top-center',
  'top-right',
];

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

export const SUBTITLE_STYLE_PRESETS: Array<{ id: string; label: string; style: SubtitleStylePreset }> = [
  {
    id: 'classic',
    label: 'Classic',
    style: DEFAULT_SUBTITLE_STYLE,
  },
  {
    id: 'bold',
    label: 'Bold',
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontSize: 24,
      fontWeight: 800,
      outlineWidth: 2,
      bottomOffset: 28,
      maxWidthPercent: 82,
      shadow: 1,
      source: 'preset:bold',
    },
  },
  {
    id: 'soft',
    label: 'Soft',
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontSize: 20,
      fontWeight: 600,
      textColor: '#FFF8E8',
      outlineColor: '#3C3C46',
      outlineWidth: 1.2,
      letterSpacing: 0.4,
      bottomOffset: 18,
      maxWidthPercent: 88,
      source: 'preset:soft',
    },
  },
];

export const SUBTITLE_STYLE_JSON_EXAMPLE = JSON.stringify(
  {
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
  },
  null,
  2
);

export const SUBTITLE_STYLE_PROMPT_TEMPLATE = [
  'Return only JSON for this subtitle style schema.',
  'Do not include markdown fences or explanations.',
  'Use these fields only: fontSize, fontWeight, textColor, outlineColor, outlineWidth, letterSpacing, bottomOffset, alignment, maxWidthPercent, shadow, fontFamilyHint.',
  'Constraints:',
  '- fontSize: 12-72',
  '- fontWeight: 400-900',
  '- colors: #RRGGBB',
  '- outlineWidth: 0-8',
  '- letterSpacing: -2 to 8',
  '- bottomOffset: 0-120',
  '- alignment: bottom-left | bottom-center | bottom-right | top-left | top-center | top-right',
  '- maxWidthPercent: 40-100',
  '- shadow: 0-8',
  '',
  'Example:',
  SUBTITLE_STYLE_JSON_EXAMPLE,
].join('\n');

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function parseColor(value: unknown, field: string): string {
  if (typeof value !== 'string' || !HEX_COLOR_RE.test(value)) {
    throw new Error(`${field} must be a hex color like #FFFFFF`);
  }
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase();
  }
  return value.toUpperCase();
}

function parseAlignment(value: unknown): SubtitleAlignment {
  if (typeof value !== 'string' || !ALLOWED_ALIGNMENTS.includes(value as SubtitleAlignment)) {
    throw new Error(`alignment must be one of: ${ALLOWED_ALIGNMENTS.join(', ')}`);
  }
  return value as SubtitleAlignment;
}

function parseOptionalString(value: unknown, field: string): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  return value.trim() || undefined;
}

function normalizeStyleObject(input: Record<string, unknown>): SubtitleStylePreset {
  const base = DEFAULT_SUBTITLE_STYLE;
  return {
    fontSize: clampNumber(
      input.fontSize == null ? base.fontSize : asFiniteNumber(input.fontSize, 'fontSize'),
      12,
      72
    ),
    fontWeight: clampNumber(
      input.fontWeight == null ? base.fontWeight : asFiniteNumber(input.fontWeight, 'fontWeight'),
      400,
      900
    ),
    textColor: input.textColor == null ? base.textColor : parseColor(input.textColor, 'textColor'),
    outlineColor: input.outlineColor == null ? base.outlineColor : parseColor(input.outlineColor, 'outlineColor'),
    outlineWidth: clampNumber(
      input.outlineWidth == null ? base.outlineWidth : asFiniteNumber(input.outlineWidth, 'outlineWidth'),
      0,
      8
    ),
    letterSpacing: clampNumber(
      input.letterSpacing == null ? base.letterSpacing : asFiniteNumber(input.letterSpacing, 'letterSpacing'),
      -2,
      8
    ),
    bottomOffset: clampNumber(
      input.bottomOffset == null ? base.bottomOffset : asFiniteNumber(input.bottomOffset, 'bottomOffset'),
      0,
      120
    ),
    alignment: input.alignment == null ? base.alignment : parseAlignment(input.alignment),
    maxWidthPercent: clampNumber(
      input.maxWidthPercent == null ? base.maxWidthPercent : asFiniteNumber(input.maxWidthPercent, 'maxWidthPercent'),
      40,
      100
    ),
    shadow: clampNumber(input.shadow == null ? base.shadow : asFiniteNumber(input.shadow, 'shadow'), 0, 8),
    fontFamilyHint: parseOptionalString(input.fontFamilyHint, 'fontFamilyHint'),
    source: parseOptionalString(input.source, 'source') ?? base.source,
    rawPrompt: parseOptionalString(input.rawPrompt, 'rawPrompt'),
  };
}

export function normalizeSubtitleStyle(input: unknown): SubtitleStylePreset {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_SUBTITLE_STYLE };
  }
  try {
    return normalizeStyleObject(input as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_SUBTITLE_STYLE };
  }
}

export function parseSubtitleStyleJson(raw: string): { value?: SubtitleStylePreset; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: 'Style JSON is empty' };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Style JSON must be an object' };
    }
    return { value: normalizeStyleObject(parsed as Record<string, unknown>) };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}

export function serializeSubtitleStyle(style: SubtitleStylePreset): string {
  return JSON.stringify(style, null, 2);
}

export function loadStoredSubtitleStyle(): SubtitleStylePreset {
  if (typeof window === 'undefined') return { ...DEFAULT_SUBTITLE_STYLE };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SUBTITLE_STYLE };
  const parsed = parseSubtitleStyleJson(raw);
  return parsed.value ? parsed.value : { ...DEFAULT_SUBTITLE_STYLE };
}

export function storeSubtitleStyle(style: SubtitleStylePreset) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, serializeSubtitleStyle(style));
}
