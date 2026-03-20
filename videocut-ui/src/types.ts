export interface Word {
  start: number;
  end: number;
  text: string;
  opt: string;
  parentIndex: number;
  childIndex?: number;
}

export interface PathSet {
  parent: number;
  children?: number[];
}

export interface UserDeleteEdit {
  pathSet: PathSet;
  reason?: string;
}

export interface UserTextChangeEdit {
  pathSet: PathSet;
  newText: string;
  oldText: string;
}

export interface UserEditsPayload {
  deletes: UserDeleteEdit[];
  restores: UserDeleteEdit[];
  textChanges: UserTextChangeEdit[];
}

export interface PendingTextChange {
  parentIndex: number;
  childIndex?: number;
  oldText: string;
  newText: string;
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
  editingIndex: number | null;
  pendingTextChanges: PendingTextChange[];
}
