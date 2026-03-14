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
