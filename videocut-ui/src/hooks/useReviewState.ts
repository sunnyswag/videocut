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
    projectIds: projectState.projects.map((project) => project.id),
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
    stateByProject: projectState.stateByProject,
    orderedProjectIds: projectState.orderedProjectIds,
    includedProjectIds: projectState.includedProjectIds,
    duration: videoState.duration,
    burnSubtitle: projectState.burnSubtitle,
    videoRef,
  });

  return {
    videoRef,
    wordRefs,
    projects: projectState.projects,
    currentProjectId: projectState.currentProjectId,
    setCurrentProjectId: projectState.setCurrentProjectId,
    orderedProjectIds: projectState.orderedProjectIds,
    includedProjectIds: projectState.includedProjectIds,
    toggleIncludeProject: projectState.toggleIncludeProject,
    moveProject: projectState.moveProject,
    reorderProject: projectState.reorderProject,
    stateByProject: projectState.stateByProject,
    words: projectState.words,
    selected: projectState.selected,
    autoSelected: projectState.autoSelected,
    currentTime: videoState.currentTime,
    duration: videoState.duration,
    currentWordIndex: videoState.currentWordIndex,
    isPlaying: videoState.isPlaying,
    registerVideoElement: videoState.registerVideoElement,
    loading: cutState.loading,
    exportDialog: cutState.exportDialog,
    progressPercentLabel: cutState.progressPercentLabel,
    burnSubtitle: projectState.burnSubtitle,
    errorText: projectState.errorText,
    selectedDuration: projectState.selectedDuration,
    progressPercent: cutState.progressPercent,
    progressText: cutState.progressText,
    handleDialogConfirm: cutState.handleDialogConfirm,
    handleDialogCancel: cutState.handleDialogCancel,
    handleVideoTimeUpdate: videoState.handleVideoTimeUpdate,
    handlePlayPause: videoState.handlePlayPause,
    handleCopyDeleteList: cutState.handleCopyDeleteList,
    handleExecuteCut: cutState.handleExecuteCut,
    handleExecuteMergeCut: cutState.handleExecuteMergeCut,
    setBurnSubtitle: projectState.setBurnSubtitle,
    handleResetToDefault: selectionState.handleResetToDefault,
    handleWordClick: selectionState.handleWordClick,
    toggleWord: selectionState.toggleWord,
    handleWordMouseDown: selectionState.handleWordMouseDown,
    handleWordMouseEnter: selectionState.handleWordMouseEnter,
  };
}
