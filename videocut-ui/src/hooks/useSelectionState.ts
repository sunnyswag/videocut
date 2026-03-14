import { useEffect, useRef } from 'react';
import type { Word, ProjectState } from '../types';

interface UseSelectionStateProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  currentProjectId: string | null;
  currentState: ProjectState | null;
  setProjectState: (projectId: string, updater: (state: ProjectState) => ProjectState) => void;
  onSeekToTime: (time: number) => void;
}

export function useSelectionState({
  videoRef,
  currentProjectId,
  currentState,
  setProjectState,
  onSeekToTime,
}: UseSelectionStateProps) {
  const selectingRef = useRef({ active: false, start: -1, mode: 'add' as 'add' | 'remove' });

  useEffect(() => {
    const onMouseUp = () => {
      selectingRef.current.active = false;
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  const toggleWord = (i: number) => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, (state) => {
      const nextSelected = new Set(state.selected);
      const nextAuto = new Set(state.autoSelected);
      if (nextSelected.has(i)) {
        nextSelected.delete(i);
        nextAuto.delete(i);
      } else {
        nextSelected.add(i);
      }
      return { ...state, selected: nextSelected, autoSelected: nextAuto };
    });
  };

  const handleWordMouseDown = (e: React.MouseEvent, i: number) => {
    if (!currentState || !e.shiftKey) return;
    selectingRef.current.active = true;
    selectingRef.current.start = i;
    selectingRef.current.mode = currentState.selected.has(i) ? 'remove' : 'add';
    e.preventDefault();
  };

  const handleWordMouseEnter = (i: number) => {
    const s = selectingRef.current;
    if (!s.active || !currentProjectId || !currentState) return;
    const min = Math.min(s.start, i);
    const max = Math.max(s.start, i);
    setProjectState(currentProjectId, (state) => {
      const nextSelected = new Set(state.selected);
      const nextAuto = new Set(state.autoSelected);
      for (let j = min; j <= max; j += 1) {
        if (s.mode === 'add') {
          nextSelected.add(j);
        } else {
          nextSelected.delete(j);
          nextAuto.delete(j);
        }
      }
      return { ...state, selected: nextSelected, autoSelected: nextAuto };
    });
  };

  const handleWordClick = (word: Word) => {
    const video = videoRef.current;
    if (!video || selectingRef.current.active) return;
    if (onSeekToTime) {
      onSeekToTime(word.start);
      return;
    }
    video.currentTime = word.start;
  };

  const handleResetToDefault = () => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, (state) => ({
      ...state,
      autoSelected: new Set(state.initialAutoSelected),
      selected: new Set(state.initialAutoSelected),
    }));
  };

  return {
    toggleWord,
    handleWordMouseDown,
    handleWordMouseEnter,
    handleWordClick,
    handleResetToDefault,
  };
}
