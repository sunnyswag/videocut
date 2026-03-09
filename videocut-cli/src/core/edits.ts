import type { Utterance, Edits, DeleteSegment, PathSet } from './types.js';

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function processEditItems(
  opted: Utterance[],
  items: Array<{ pathSet: PathSet }> | undefined,
  onNode: (node: any, parent: any, editItem: any, index: number, childIdx: number | undefined) => void
): void {
  if (!Array.isArray(items)) return;
  
  for (const editItem of items) {
    const pathSet = editItem?.pathSet;
    if (!pathSet || !Number.isInteger(pathSet.parent)) continue;
    
    const parent = opted[pathSet.parent];
    if (!parent) continue;

    if (Array.isArray(pathSet.children) && pathSet.children.length > 0 && Array.isArray(parent.words)) {
      const sorted = [...pathSet.children].filter(Number.isInteger).sort((a, b) => a - b);
      sorted.forEach((childIdx, idx) => {
        const child = parent.words![childIdx];
        if (!child) return;
        onNode(child, parent, editItem, idx, childIdx);
      });
    } else {
      onNode(parent, parent, editItem, 0, undefined);
    }
  }
}

function rebuildText(items: (Utterance | Word)[]): void {
  if (!Array.isArray(items)) return;
  for (const node of items) {
    if (Array.isArray((node as any).words) && (node as any).words.length > 0) {
      rebuildText((node as any).words);
      (node as any).text = (node as any).words
        .filter((w: any) => w.opt !== 'del')
        .map((w: any) => (w.text || '').trim())
        .join('');
    }
  }
}

export function applyEditsToOpted(inputOpted: Utterance[], edits: Edits = {}): Utterance[] {
  const opted = inputOpted;

  processEditItems(opted, edits.deletes, (node) => {
    node.opt = 'del';
  });

  processEditItems(opted, edits.textChanges, (node, _parent, editItem) => {
    node.text = String((editItem as any).newText);
    node.opt = 'edit';
  });

  processEditItems(opted, edits.combines, (() => {
    let first: any = null;
    return (node, _parent, editItem, i) => {
      if (i === 0) {
        first = node;
        node.text = String((editItem as any).newText);
        node.opt = 'edit';
      } else {
        if (typeof node.start_time === 'number' &&
            (typeof first.start_time !== 'number' || node.start_time < first.start_time)) {
          first.start_time = node.start_time;
        }
        if (typeof node.end_time === 'number' &&
            (typeof first.end_time !== 'number' || node.end_time > first.end_time)) {
          first.end_time = node.end_time;
        }
        node.opt = 'del';
      }
    };
  })());

  rebuildText(opted as any);
  return opted;
}

export function mergeSegments(segments: DeleteSegment[]): DeleteSegment[] {
  const sorted = segments
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  
  const merged: DeleteSegment[] = [];
  for (const seg of sorted) {
    if (merged.length === 0 || seg.start > merged[merged.length - 1].end) {
      merged.push({ ...seg });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
    }
  }
  return merged;
}

export function buildDeleteSegmentsFromDeletes(
  opted: Utterance[],
  deletes: Array<{ pathSet: PathSet; start?: number; end?: number }>
): DeleteSegment[] {
  if (!Array.isArray(deletes) || deletes.length === 0) return [];

  const segments: DeleteSegment[] = [];
  
  for (const item of deletes) {
    if (Number.isFinite(item?.start) && Number.isFinite(item?.end)) {
      segments.push({ start: Number(item.start), end: Number(item.end) });
      continue;
    }
  }

  processEditItems(opted, deletes as any, (node, parent, editItem, _i, childIdx) => {
    const hasChildren = Array.isArray((editItem as any).pathSet?.children) && (editItem as any).pathSet.children.length > 0;
    const sourceNode = hasChildren && typeof childIdx === 'number' ? (parent as any).words[childIdx] : node;
    if (!sourceNode) return;
    const start = (sourceNode.start_time || (parent as any).start_time || 0) / 1000;
    const end = (sourceNode.end_time || (parent as any).end_time || 0) / 1000;
    segments.push({ start, end });
  });

  return mergeSegments(segments);
}

interface Word {
  text: string;
  start_time?: number;
  end_time?: number;
  opt?: string;
}
