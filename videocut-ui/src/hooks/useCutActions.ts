import React from 'react';
import { useMemo, useState } from 'react';
import { executeCut } from '../api';
import { useLocale, type Translations } from '../i18n';
import type { Word, ProjectState } from '../types';

function formatDuration(seconds: string | number, t: Translations): string {
  const s = Number(seconds) || 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}${t.formatMin}${sec}${t.formatSec}` : `${sec}${t.formatSec}`;
}

function mergeAdjacentSegments(segments: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (!segments.length) return [];
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end + 0.1) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

function buildEditsPayload(words: Word[], selected: Set<number>, burnSubtitle: boolean) {
  const sortedSelected = Array.from(selected).sort((a, b) => a - b);
  const segments = sortedSelected.map((i) => ({ start: words[i].start, end: words[i].end }));
  const deletes = mergeAdjacentSegments(segments);
  return { deletes, burnSubtitle };
}

interface UseCutActionsProps {
  currentProjectId: string | null;
  currentState: ProjectState | null;
  duration: number;
  burnSubtitle: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function useCutActions({ currentProjectId, currentState, duration, burnSubtitle, videoRef }: UseCutActionsProps) {
  const { t } = useLocale();
  const [loading, setLoading] = useState({ show: false, elapsed: 0, estimate: 0 });

  const progressPercent = useMemo(
    () => (loading.estimate > 0 ? Math.min(95, (loading.elapsed / loading.estimate) * 100) : 0),
    [loading]
  );
  const progressText = useMemo(
    () =>
      loading.elapsed >= loading.estimate
        ? t.almostDone
        : `${t.estimateRemain}: ${Math.max(0, loading.estimate - loading.elapsed)} ${t.formatSec}`,
    [loading, t]
  );

  const handleCopyDeleteList = async () => {
    if (!currentState) return;
    const sortedSelected = Array.from(currentState.selected).sort((a: number, b: number) => a - b);
    const segments = sortedSelected.map((i: number) => ({
      start: currentState.words[i].start,
      end: currentState.words[i].end,
    }));
    const merged = mergeAdjacentSegments(segments);
    await navigator.clipboard.writeText(JSON.stringify(merged, null, 2));
    alert(`${merged.length} ${t.copiedSegments}`);
  };

  const handleExecuteCut = async () => {
    if (!currentProjectId || !currentState) return;
    const payload = buildEditsPayload(currentState.words, currentState.selected, burnSubtitle);
    if (!payload.deletes.length) {
      alert(t.selectFirst);
      return;
    }

    const estimated = Math.max(5, Math.ceil((duration || 0) / 4));
    const estText = formatDuration(estimated, t);
    if (!confirm(`${t.confirmCutTitle}\n\n📹 ${t.currentProject}: ${currentProjectId}\n⏱️ ${t.estimatedTime}: ${estText}\n\n${t.clickToStart}`))
      return;

    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }

    const start = Date.now();
    setLoading({ show: true, elapsed: 0, estimate: estimated });
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setLoading((prev) => ({ ...prev, elapsed }));
    }, 500);

    try {
      const data = await executeCut(currentProjectId, payload.deletes, burnSubtitle);
      clearInterval(timer);
      setLoading({ show: false, elapsed: 0, estimate: 0 });
      const totalTime = ((Date.now() - start) / 1000).toFixed(1);
      if (data.success) {
        const subtitleMsg = data.subtitleOutput ? `\n${t.subtitleOutputLabel}: ${data.subtitleOutput}` : '';
        alert(
          `✅ ${t.cutDone} (${totalTime}s)\n\n📁 ${t.output}: ${data.output}${subtitleMsg}\n\n${t.originalDuration}: ${formatDuration(data.originalDuration || 0, t)}\n${t.newDuration}: ${formatDuration(data.newDuration || 0, t)}\n${t.deleted}: ${formatDuration(data.deletedDuration || 0, t)} (${data.savedPercent}%)`
        );
      } else {
        alert(`❌ ${t.cutFailed}: ${data.error}`);
      }
    } catch (err: any) {
      clearInterval(timer);
      setLoading({ show: false, elapsed: 0, estimate: 0 });
      alert(`❌ ${t.requestFailed}: ${err.message}\n\n${t.ensureServer}`);
    }
  };

  return {
    loading: loading.show,
    progressPercent,
    progressText,
    handleCopyDeleteList,
    handleExecuteCut,
  };
}
