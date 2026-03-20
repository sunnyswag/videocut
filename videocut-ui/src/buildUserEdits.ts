import type { PathSet, PendingTextChange, UserDeleteEdit, UserEditsPayload, UserTextChangeEdit, Word } from './types';

interface PathAccumulator {
  parentOnly: boolean;
  children: Set<number>;
}

function buildPathSetMap(words: Word[], indices: number[]): Map<number, PathAccumulator> {
  const byParent = new Map<number, PathAccumulator>();
  for (const index of indices) {
    const word = words[index];
    if (!word || !Number.isInteger(word.parentIndex)) continue;
    const parent = word.parentIndex;
    const current = byParent.get(parent) || { parentOnly: false, children: new Set<number>() };
    if (Number.isInteger(word.childIndex)) {
      current.children.add(word.childIndex as number);
    } else {
      current.parentOnly = true;
      current.children.clear();
    }
    byParent.set(parent, current);
  }
  return byParent;
}

function mapToDeleteEdits(byParent: Map<number, PathAccumulator>): UserDeleteEdit[] {
  const result: UserDeleteEdit[] = [];
  for (const [parent, value] of byParent.entries()) {
    const pathSet: PathSet = value.parentOnly
      ? { parent }
      : { parent, children: Array.from(value.children).sort((a, b) => a - b) };
    result.push({ pathSet });
  }
  return result.sort((a, b) => a.pathSet.parent - b.pathSet.parent);
}

function normalizeTextChanges(pending: PendingTextChange[]): UserTextChangeEdit[] {
  const latestByPath = new Map<string, PendingTextChange>();
  for (const item of pending) {
    if (!Number.isInteger(item.parentIndex)) continue;
    const childKey = Number.isInteger(item.childIndex) ? String(item.childIndex) : 'parent';
    const key = `${item.parentIndex}:${childKey}`;
    latestByPath.set(key, item);
  }

  return Array.from(latestByPath.values())
    .map((item) => {
      const pathSet: PathSet = Number.isInteger(item.childIndex)
        ? { parent: item.parentIndex, children: [item.childIndex as number] }
        : { parent: item.parentIndex };
      return {
        pathSet,
        oldText: item.oldText,
        newText: item.newText,
      };
    })
    .sort((a, b) => {
      if (a.pathSet.parent !== b.pathSet.parent) return a.pathSet.parent - b.pathSet.parent;
      const childA = a.pathSet.children?.[0] ?? -1;
      const childB = b.pathSet.children?.[0] ?? -1;
      return childA - childB;
    });
}

export function buildUserEdits(
  words: Word[],
  selected: Set<number>,
  initialAutoSelected: Set<number>,
  pendingTextChanges: PendingTextChange[]
): UserEditsPayload {
  const deleteIndexes = Array.from(selected).filter((index) => !initialAutoSelected.has(index));
  const restoreIndexes = Array.from(initialAutoSelected).filter((index) => !selected.has(index));
  const deletes = mapToDeleteEdits(buildPathSetMap(words, deleteIndexes));
  const restores = mapToDeleteEdits(buildPathSetMap(words, restoreIndexes));
  const textChanges = normalizeTextChanges(pendingTextChanges).filter((item) => item.newText !== item.oldText);
  return { deletes, restores, textChanges };
}
