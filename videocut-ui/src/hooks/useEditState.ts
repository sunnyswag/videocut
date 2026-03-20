import type { ProjectState } from '../types';

interface UseEditStateProps {
  currentProjectId: string | null;
  currentState: ProjectState | null;
  setProjectState: (projectId: string, updater: (state: ProjectState) => ProjectState) => void;
}

function isEditableWord(state: ProjectState, index: number): boolean {
  const word = state.words[index];
  if (!word) return false;
  if (!word.text) return false;
  if (word.opt === 'blank') return false;
  return true;
}

export function useEditState({ currentProjectId, currentState, setProjectState }: UseEditStateProps) {
  const startEdit = (index: number) => {
    if (!currentProjectId || !currentState || !isEditableWord(currentState, index)) return;
    setProjectState(currentProjectId, (state) => ({ ...state, editingIndex: index }));
  };

  const cancelEdit = () => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, (state) => ({ ...state, editingIndex: null }));
  };

  const commitEdit = (index: number, nextTextRaw: string) => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, (state) => {
      const currentWord = state.words[index];
      if (!currentWord) {
        return { ...state, editingIndex: null };
      }
      const normalizedText = nextTextRaw.trim();
      if (!normalizedText || normalizedText === currentWord.text) {
        return { ...state, editingIndex: null };
      }

      const words = [...state.words];
      words[index] = { ...currentWord, text: normalizedText };

      const pending = [...state.pendingTextChanges];
      const matchIndex = pending.findIndex(
        (item) => item.parentIndex === currentWord.parentIndex && item.childIndex === currentWord.childIndex
      );
      if (matchIndex >= 0) {
        pending[matchIndex] = { ...pending[matchIndex], newText: normalizedText };
      } else {
        pending.push({
          parentIndex: currentWord.parentIndex,
          childIndex: currentWord.childIndex,
          oldText: currentWord.text,
          newText: normalizedText,
        });
      }

      return {
        ...state,
        words,
        pendingTextChanges: pending,
        editingIndex: null,
      };
    });
  };

  const clearPendingTextChanges = () => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, (state) => ({
      ...state,
      pendingTextChanges: [],
      editingIndex: null,
    }));
  };

  return {
    editingIndex: currentState?.editingIndex ?? null,
    startEdit,
    cancelEdit,
    commitEdit,
    clearPendingTextChanges,
  };
}
