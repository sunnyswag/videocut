export interface Word {
  start: number;
  end: number;
  text: string;
  opt: string;
  parentIndex: number;
  childIndex?: number;
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
  srtPath?: string;
  editsPath?: string;
  deletePath?: string;
  originalDuration?: string;
  newDuration?: string;
  deletedDuration?: string;
  savedPercent?: string;
  message?: string;
  error?: string;
}

export interface ProjectState {
  words: Word[];
  autoSelected: Set<number>;
  selected: Set<number>;
  burnSubtitle: boolean;
}
