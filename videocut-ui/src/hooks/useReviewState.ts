import { useCallback, useRef } from 'react';
import { useLocale } from '../i18n';
import { useProjectDataState } from './useProjectDataState';
import { useVideoPlayerState } from './useVideoPlayerState';
import { useSelectionState } from './useSelectionState';
import { useEditState } from './useEditState';
import { useCutActions } from './useCutActions';

export function useReviewState() {
  const { t } = useLocale();
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
  const editState = useEditState({
    currentProjectId: projectState.currentProjectId,
    currentState: projectState.currentState,
    setProjectState: projectState.setProjectState,
  });
  const cutState = useCutActions({
    currentProjectId: projectState.currentProjectId,
    currentState: projectState.currentState,
    stateByProject: projectState.stateByProject,
    orderedProjectIds: projectState.orderedProjectIds,
    includedProjectIds: projectState.includedProjectIds,
    duration: videoState.duration,
    burnSubtitle: projectState.burnSubtitle,
    subtitleStyle: projectState.subtitleStyle,
    projectWords: projectState.words,
    projectSelected: projectState.selected,
    projectInitialAutoSelected: projectState.currentState?.initialAutoSelected || new Set<number>(),
    pendingTextChanges: projectState.currentState?.pendingTextChanges || [],
    clearPendingTextChanges: editState.clearPendingTextChanges,
    videoRef,
  });

  const handleResetToDefault = useCallback(async () => {
    const confirmed = await cutState.requestConfirmDialog(t.resetDefault, t.resetDefaultConfirmMessage);
    if (!confirmed) return;
    selectionState.resetToDefault();
  }, [cutState, selectionState, t]);

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
    editingIndex: editState.editingIndex,
    currentTime: videoState.currentTime,
    duration: videoState.duration,
    currentWordIndex: videoState.currentWordIndex,
    isPlaying: videoState.isPlaying,
    videoReady: videoState.videoReady,
    registerVideoElement: videoState.registerVideoElement,
    loading: cutState.loading,
    exportDialog: cutState.exportDialog,
    progressPercentLabel: cutState.progressPercentLabel,
    burnSubtitle: projectState.burnSubtitle,
    subtitleStyle: projectState.subtitleStyle,
    subtitleStyleJson: projectState.subtitleStyleJson,
    subtitleStyleError: projectState.subtitleStyleError,
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
    applySubtitleStyle: projectState.applySubtitleStyle,
    setSubtitleStyleJson: projectState.setSubtitleStyleJson,
    handleResetToDefault,
    handleWordClick: selectionState.handleWordClick,
    toggleWord: selectionState.toggleWord,
    handleWordMouseDown: selectionState.handleWordMouseDown,
    handleWordMouseEnter: selectionState.handleWordMouseEnter,
    startEdit: editState.startEdit,
    commitEdit: editState.commitEdit,
    cancelEdit: editState.cancelEdit,
    handleSaveReview: cutState.handleSaveReview,
  };
}
