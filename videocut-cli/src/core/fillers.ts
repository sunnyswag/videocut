// HESITATION: pure interjection sounds — almost always filler when they appear
// mid-cue. Safe for suggest-edits to auto-emit as type:"words" deletes.
export const HESITATION_FILLERS: readonly string[] = ['嗯', '呃', '啊', '哦', 'um', 'uh'];

// SEMANTIC: real Chinese words that frequently function as filler in spontaneous
// speech but ALSO appear as meaningful content (determiners, conjunctions). LLM
// must judge case-by-case; suggest-edits only counts and reports.
export const SEMANTIC_FILLERS: readonly string[] = [
  '一个',
  '一些',
  '就是',
  '然后',
  '那个',
  '比如说',
  '其实',
  '对吧',
];

export const FILLER_WORDS: readonly string[] = [...HESITATION_FILLERS, ...SEMANTIC_FILLERS];

const FILLER_SET = new Set(FILLER_WORDS);
const HESITATION_SET = new Set(HESITATION_FILLERS);

export function isHesitationFiller(token: string): boolean {
  return HESITATION_SET.has(token.trim());
}

export function isFillerToken(token: string): boolean {
  return FILLER_SET.has(token);
}

export function isCueFillerOnly(text: string, maxTokens = 3): boolean {
  const stripped = text.replace(/[，,。.！!？?\s]+/g, ' ').trim();
  if (stripped.length === 0) return true;
  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.length > maxTokens) return false;
  return tokens.every((t) => isFillerToken(t) || t.length <= 1);
}
