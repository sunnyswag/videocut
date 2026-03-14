export interface Word {
  start: number;
  end: number;
  text: string;
  opt: string;
  parentIndex: number;
  childIndex?: number;
}

export type SubtitleAlignment =
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'top-left'
  | 'top-center'
  | 'top-right';

export interface SubtitleStylePreset {
  fontSize: number;
  fontWeight: number;
  textColor: string;
  outlineColor: string;
  outlineWidth: number;
  letterSpacing: number;
  bottomOffset: number;
  alignment: SubtitleAlignment;
  maxWidthPercent: number;
  shadow: number;
  fontFamilyHint?: string;
  source?: string;
  rawPrompt?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  hasEdited: boolean;
}

export interface CutResult {
  success: boolean;
  output?: string;
  subtitleOutput?: string;
  originalDuration?: string;
  newDuration?: string;
  deletedDuration?: string;
  savedPercent?: string;
  projectCount?: number;
  error?: string;
}

export interface ProjectState {
  words: Word[];
  initialAutoSelected: Set<number>;
  autoSelected: Set<number>;
  selected: Set<number>;
}
