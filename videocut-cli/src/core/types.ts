export interface Word {
  text: string;
  start_time?: number;
  end_time?: number;
  opt?: 'keep' | 'del' | 'edit' | 'blank';
}

export interface Utterance {
  text: string;
  start_time: number;
  end_time: number;
  opt?: 'keep' | 'del' | 'blank';
  words?: Word[];
  attribute?: {
    event?: string;
    extra?: Record<string, unknown>;
  };
}

export interface PathSet {
  parent: number;
  children?: number[];
}

export interface DeleteItem {
  pathSet: PathSet;
  reason?: string;
}

export interface TextChangeItem {
  pathSet: PathSet;
  newText: string;
  oldText: string;
}

export interface CombineItem {
  pathSet: PathSet;
  newText: string;
  oldText: string;
  reason?: string;
}

export interface Edits {
  deletes?: DeleteItem[];
  textChanges?: TextChangeItem[];
  combines?: CombineItem[];
}

export interface DeleteSegment {
  start: number;
  end: number;
}

export interface Subtitle {
  text: string;
  start: number;
  end: number;
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
  outputPath: string;
  keepSegments: DeleteSegment[];
  mergedDelete: DeleteSegment[];
  audioOffset: number;
  originalDuration: number;
  newDuration: number;
}

export interface TranscribeResult {
  utterances: Utterance[];
}
