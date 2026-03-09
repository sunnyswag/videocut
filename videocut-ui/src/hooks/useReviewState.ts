import { useRef } from 'react';
import { useProjectDataState } from './useProjectDataState';
import { useVideoPlayerState } from './useVideoPlayerState';
import { useSelectionState } from './useSelectionState';
import { useCutActions } from './useCutActions';

export function useReviewState() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wordRefs = useRef<(HTMLDivElement | null)[]>([]);
  const projectState = useProjectDataState();
  const videoState = useVideoPlayerState({
    videoRef,
    wordRefs,
    currentProjectId: projectState.currentProjectId,
    currentState: projectState.currentState,
    stateByProject: projectState.stateByProject,
  });
  const selectionState = useSelectionState({
    videoRef,
    currentProjectId: projectState.currentProjectId,
    currentState: projectState.currentState,
    setProjectState: projectState.setProjectState,
    onSeekToTime: videoState.seekToTime,
  });
  const cutState = useCutActions({
    currentProjectId: projectState.currentProjectId,
    currentState: projectState.currentState,
    duration: videoState.duration,
    burnSubtitle: projectState.burnSubtitle,
  });

  return {
    videoRef,
    wordRefs,
    projects: projectState.projects,
    currentProjectId: projectState.currentProjectId,
    setCurrentProjectId: projectState.setCurrentProjectId,
    words: projectState.words,
    selected: projectState.selected,
    autoSelected: projectState.autoSelected,
    currentTime: videoState.currentTime,
    duration: videoState.duration,
    currentWordIndex: videoState.currentWordIndex,
    loading: cutState.loading,
    burnSubtitle: projectState.burnSubtitle,
    errorText: projectState.errorText,
    selectedDuration: projectState.selectedDuration,
    progressPercent: cutState.progressPercent,
    progressText: cutState.progressText,
    handleVideoTimeUpdate: videoState.handleVideoTimeUpdate,
    handlePlayPause: videoState.handlePlayPause,
    handleCopyDeleteList: cutState.handleCopyDeleteList,
    handleExecuteCut: cutState.handleExecuteCut,
    setBurnSubtitle: projectState.setBurnSubtitle,
    handleClearAll: selectionState.handleClearAll,
    handleWordClick: selectionState.handleWordClick,
    toggleWord: selectionState.toggleWord,
    handleWordMouseDown: selectionState.handleWordMouseDown,
    handleWordMouseEnter: selectionState.handleWordMouseEnter,
  };
}
