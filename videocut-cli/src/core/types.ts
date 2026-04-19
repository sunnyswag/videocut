export interface DeleteSegment {
  start: number;
  end: number;
}

export interface Subtitle {
  text: string;
  start: number;
  end: number;
}

export interface SrtCue {
  idx: number;
  start: number;
  end: number;
  text: string;
}

export interface WhisperWord {
  text: string;
  start: number;
  end: number;
  probability?: number;
}

export interface WhisperUtterance {
  id: number;
  text: string;
  start: number;
  end: number;
  words: WhisperWord[];
}

export interface WhisperTranscript {
  language: string;
  duration: number;
  model: string;
  utterances: WhisperUtterance[];
}

export interface SilenceRange {
  start: number;
  end: number;
}

export interface Signals {
  duration: number;
  silences: SilenceRange[];
}

export type DeleteEntry =
  | {
      type: 'cue';
      cueIdx: number;
      cueIdxEnd?: number;
      reason?: string;
    }
  | {
      type: 'range';
      start: number;
      end: number;
      reason?: string;
    }
  | {
      type: 'words';
      cueIdx: number;
      pattern: string;
      occurrence?: number;
      reason?: string;
    };

export interface TextEditEntry {
  cueIdx: number;
  newText: string;
  reason?: string;
}

export interface EditsFile {
  schema_version: 1 | 2;
  deletes: DeleteEntry[];
  textEdits?: TextEditEntry[];
  notes?: string;
}
