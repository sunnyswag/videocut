import { useCallback, useEffect, useRef, useState } from 'react';
import { getVideoUrl } from '../api';
import type { Word } from '../types';

interface Range {
  start: number;
  end: number;
}

const PREVIEW_BLANK_MERGE_GAP_SEC = 0.4;

function isBlankWord(word: Word | undefined): boolean {
  return Boolean(word) && !(word?.text || '').trim();
}

function buildSelectedRanges(words: Word[], selectedSet: Set<number>): Range[] {
  const sortedSelected = Array.from(selectedSet).sort((a, b) => a - b);
  const ranges: Range[] = [];
  for (let k = 0; k < sortedSelected.length; k += 1) {
    const i = sortedSelected[k];
    const w = words[i];
    if (!w) continue;
    let start = w.start;
    let end = w.end;
    let j = k + 1;
    while (j < sortedSelected.length) {
      const previousSelectedIndex = sortedSelected[j - 1];
      const nextSelectedIndex = sortedSelected[j];
      const nextW = words[sortedSelected[j]];
      const gapDuration = nextW ? nextW.start - end : Number.POSITIVE_INFINITY;
      const intermediateWords = words.slice(previousSelectedIndex + 1, nextSelectedIndex);
      const shouldMergeAcrossShortBlank =
        nextW &&
        gapDuration <= PREVIEW_BLANK_MERGE_GAP_SEC &&
        intermediateWords.length > 0 &&
        intermediateWords.every((word) => isBlankWord(word));

      if (nextW && (gapDuration < 0.1 || shouldMergeAcrossShortBlank)) {
        end = nextW.end;
        j += 1;
      } else {
        break;
      }
    }
    ranges.push({ start, end });
    k = j - 1;
  }
  return ranges;
}

interface ProjectState {
  words: Word[];
  selected: Set<number>;
}

interface UseVideoPlayerStateProps {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  wordRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  projectIds: string[];
  currentProjectId: string | null;
  currentState: ProjectState | null;
  stateByProject: Record<string, ProjectState>;
}

export function useVideoPlayerState({
  videoRef,
  wordRefs,
  projectIds,
  currentProjectId,
  currentState,
  stateByProject,
}: UseVideoPlayerStateProps) {
  const skipRafRef = useRef<number | null>(null);
  const videoElementsRef = useRef<Record<string, HTMLVideoElement | null>>({});
  const timeByProjectRef = useRef<Record<string, number>>({});
  const lastProjectIdRef = useRef<string | null>(null);
  const selectedRangesRef = useRef<Range[]>([]);
  const wordsRef = useRef<Word[]>([]);
  const lastTimeUiUpdateRef = useRef(0);
  const currentWordIndexRef = useRef(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);

  const getVideoElement = useCallback(
    (projectId: string | null) => (projectId ? videoElementsRef.current[projectId] ?? null : null),
    [],
  );

  const registerVideoElement = useCallback(
    (projectId: string, element: HTMLVideoElement | null) => {
      videoElementsRef.current[projectId] = element;
      if (!element) return;
      if (!element.dataset.srcReady) {
        element.preload = 'auto';
        element.src = getVideoUrl(projectId);
        element.load();
        element.dataset.srcReady = 'true';
      }
      if (projectId === currentProjectId) {
        videoRef.current = element;
      }
    },
    [currentProjectId, videoRef],
  );

  useEffect(() => {
    projectIds.forEach((projectId) => {
      const video = videoElementsRef.current[projectId];
      if (!video || video.dataset.srcReady) return;
      video.preload = 'auto';
      video.src = getVideoUrl(projectId);
      video.load();
      video.dataset.srcReady = 'true';
    });
  }, [projectIds]);

  useEffect(() => {
    const previousProjectId = lastProjectIdRef.current;
    const previousVideo = getVideoElement(previousProjectId);
    if (previousProjectId && previousProjectId !== currentProjectId && previousVideo) {
      timeByProjectRef.current[previousProjectId] = previousVideo.currentTime || 0;
      previousVideo.pause();
    }
    const video = getVideoElement(currentProjectId);
    if (!currentProjectId || !video) return;

    videoRef.current = video;
    setIsPlaying(!video.paused && !video.ended);
    const restoreTime = timeByProjectRef.current[currentProjectId] || 0;
    const syncVideoState = () => {
      if (restoreTime > 0 && Math.abs(video.currentTime - restoreTime) > 0.05) {
        const maxSeekTime = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.01) : restoreTime;
        video.currentTime = Math.min(restoreTime, maxSeekTime);
      }
      syncCurrentByTime(video.currentTime || restoreTime, video.duration || 0, true);
    };

    if (video.readyState >= 1) {
      syncVideoState();
    } else {
      video.addEventListener('loadedmetadata', syncVideoState, { once: true });
    }

    lastProjectIdRef.current = currentProjectId;
  }, [currentProjectId, getVideoElement, videoRef]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (video.paused) video.play();
        else video.pause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - (e.shiftKey ? 5 : 1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        video.currentTime = video.currentTime + (e.shiftKey ? 5 : 1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [videoRef]);

  useEffect(() => {
    const node = wordRefs.current[currentWordIndex];
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentWordIndex, wordRefs]);

  useEffect(() => {
    const state = currentProjectId ? stateByProject[currentProjectId] : null;
    wordsRef.current = state?.words || [];
    selectedRangesRef.current = state ? buildSelectedRanges(state.words, state.selected) : [];
  }, [currentProjectId, stateByProject]);

  const syncCurrentByTime = (t: number, d: number, forceUi = false) => {
    const now = performance.now();
    if (forceUi || now - lastTimeUiUpdateRef.current >= 120) {
      setCurrentTime(t);
      setDuration(d || 0);
      lastTimeUiUpdateRef.current = now;
    }

    const idx = wordsRef.current.findIndex((w) => t >= w.start && t < w.end);
    if (idx !== currentWordIndexRef.current) {
      currentWordIndexRef.current = idx;
      setCurrentWordIndex(idx);
    }
  };

  useEffect(() => {
    const video = getVideoElement(currentProjectId);
    if (!video || !currentProjectId) return undefined;

    const tick = () => {
      if (!video || video.paused || !currentProjectId) {
        skipRafRef.current = null;
        return;
      }
      const t = video.currentTime;
      const ranges = selectedRangesRef.current;
      for (let i = 0; i < ranges.length; i += 1) {
        const range = ranges[i];
        if (t >= range.start && t < range.end) {
          video.currentTime = range.end;
          break;
        }
      }
      skipRafRef.current = requestAnimationFrame(tick);
    };

    const onPlay = () => {
      setIsPlaying(true);
      if (!skipRafRef.current) skipRafRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setIsPlaying(false);
      skipRafRef.current = null;
    };
    const onEnded = () => {
      setIsPlaying(false);
      skipRafRef.current = null;
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      skipRafRef.current = null;
    };
  }, [currentProjectId, getVideoElement]);

  const handleVideoTimeUpdate = (projectId?: string) => {
    const targetProjectId = projectId || currentProjectId;
    if (!targetProjectId || targetProjectId !== currentProjectId || !currentState) return;
    const video = getVideoElement(targetProjectId);
    if (!video) return;
    const t = video.currentTime || 0;
    const d = video.duration || 0;
    timeByProjectRef.current[targetProjectId] = t;
    syncCurrentByTime(t, d, false);
  };

  const seekToTime = (targetTime: number) => {
    const video = getVideoElement(currentProjectId);
    if (!video) return;
    videoRef.current = video;
    const t = Math.max(0, targetTime || 0);
    video.currentTime = t;
    if (currentProjectId) {
      timeByProjectRef.current[currentProjectId] = t;
    }
    syncCurrentByTime(t, video.duration || duration, true);
  };

  const handlePlayPause = () => {
    const video = getVideoElement(currentProjectId);
    if (!video) return;
    videoRef.current = video;
    if (video.paused) video.play();
    else video.pause();
  };

  return {
    currentTime,
    duration,
    currentWordIndex,
    isPlaying,
    registerVideoElement,
    handleVideoTimeUpdate,
    handlePlayPause,
    seekToTime,
  };
}
