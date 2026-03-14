import React from 'react';
import { useMemo, useRef, useState } from 'react';
import { executeCut, executeMergeCut } from '../api';
import { useLocale, type Translations } from '../i18n';
import type { Word, ProjectState } from '../types';
import type { ExportDialogState, ExportDialogTone } from '../components/ExportDialog';

type ExportMode = 'cut' | 'merge';

interface LoadingState {
  show: boolean;
  elapsed: number;
  estimate: number;
}

const CLOSED_DIALOG: ExportDialogState = {
  open: false,
  tone: 'info',
  title: '',
  message: '',
  showCancel: false,
};

interface EstimateInput {
  mode: ExportMode;
  burnSubtitle: boolean;
  workUnits: number;
  projectCount: number;
  segmentCount: number;
}

interface BenchmarkEntry {
  samples: number;
  avgRate: number;
}

type BenchmarkStore = Record<string, BenchmarkEntry>;

const BENCHMARK_STORAGE_KEY = 'videocut-export-benchmarks';

function formatDuration(seconds: string | number, t: Translations): string {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
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

function sumSegmentDuration(segments: Array<{ start: number; end: number }>): number {
  return segments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);
}

function getApproxProjectDuration(words: Word[]): number {
  return words.reduce((max, word) => Math.max(max, word.end || 0), 0);
}

function getBenchmarkKey(mode: ExportMode, burnSubtitle: boolean): string {
  return `${mode}:${burnSubtitle ? 'subtitle' : 'plain'}`;
}

function loadBenchmarks(): BenchmarkStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BENCHMARK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveBenchmarks(store: BenchmarkStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(store));
}

function getDefaultRate(mode: ExportMode, burnSubtitle: boolean): number {
  if (mode === 'merge') {
    return burnSubtitle ? 0.84 : 0.56;
  }
  return burnSubtitle ? 0.7 : 0.38;
}

function estimateExportSeconds(input: EstimateInput): number {
  const benchmarks = loadBenchmarks();
  const exactKey = getBenchmarkKey(input.mode, input.burnSubtitle);
  const genericKey = getBenchmarkKey(input.mode, false);
  const rate =
    benchmarks[exactKey]?.avgRate ||
    benchmarks[genericKey]?.avgRate ||
    getDefaultRate(input.mode, input.burnSubtitle);

  const normalizedWorkUnits = Math.max(1, input.workUnits);
  const overhead =
    input.mode === 'merge'
      ? 4 + input.projectCount * 1.5 + input.segmentCount * 0.08
      : 3 + input.segmentCount * 0.08;

  const minSeconds = input.mode === 'merge' ? 10 : 6;
  return Math.max(minSeconds, Math.ceil(overhead + normalizedWorkUnits * rate));
}

function recordExportBenchmark(mode: ExportMode, burnSubtitle: boolean, workUnits: number, elapsedSeconds: number) {
  if (workUnits <= 0 || elapsedSeconds <= 0) return;
  const normalizedRate = Math.min(10, Math.max(0.05, elapsedSeconds / workUnits));
  const store = loadBenchmarks();
  const key = getBenchmarkKey(mode, burnSubtitle);
  const prev = store[key];
  const nextSamples = Math.min(12, (prev?.samples || 0) + 1);
  const nextRate = prev ? prev.avgRate * 0.45 + normalizedRate * 0.55 : normalizedRate;
  store[key] = { samples: nextSamples, avgRate: nextRate };
  saveBenchmarks(store);
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
  stateByProject: Record<string, ProjectState>;
  orderedProjectIds: string[];
  includedProjectIds: Set<string>;
  duration: number;
  burnSubtitle: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function useCutActions({
  currentProjectId,
  currentState,
  stateByProject,
  orderedProjectIds,
  includedProjectIds,
  duration,
  burnSubtitle,
  videoRef,
}: UseCutActionsProps) {
  const { t } = useLocale();
  const [loading, setLoading] = useState<LoadingState>({ show: false, elapsed: 0, estimate: 0 });
  const [dialog, setDialog] = useState<ExportDialogState>(CLOSED_DIALOG);
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const progressPercent = useMemo(
    () => (loading.estimate > 0 ? Math.min(95, (loading.elapsed / loading.estimate) * 100) : 0),
    [loading]
  );
  const progressPercentLabel = useMemo(() => `${Math.round(progressPercent)}%`, [progressPercent]);
  const progressText = useMemo(
    () =>
      loading.elapsed >= loading.estimate
        ? t.almostDone
        : `${t.estimateRemain}: ${formatDuration(Math.max(0, loading.estimate - loading.elapsed), t)}`,
    [loading, t]
  );

  const closeDialog = () => {
    setDialog(CLOSED_DIALOG);
  };

  const showMessageDialog = (tone: ExportDialogTone, title: string, message: string) => {
    setDialog({
      open: true,
      tone,
      title,
      message,
      confirmLabel: t.dialogClose,
      showCancel: false,
    });
  };

  const requestConfirmDialog = (title: string, message: string) =>
    new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setDialog({
        open: true,
        tone: 'confirm',
        title,
        message,
        confirmLabel: t.dialogConfirm,
        cancelLabel: t.dialogCancel,
        showCancel: true,
      });
    });

  const handleDialogConfirm = () => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    closeDialog();
    if (resolver) {
      resolver(true);
    }
  };

  const handleDialogCancel = () => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    closeDialog();
    if (resolver) {
      resolver(false);
    }
  };

  const handleCopyDeleteList = async () => {
    if (!currentState) return;
    const sortedSelected = Array.from(currentState.selected).sort((a: number, b: number) => a - b);
    const segments = sortedSelected.map((i: number) => ({
      start: currentState.words[i].start,
      end: currentState.words[i].end,
    }));
    const merged = mergeAdjacentSegments(segments);
    await navigator.clipboard.writeText(JSON.stringify(merged, null, 2));
    showMessageDialog('info', t.instructions, `${merged.length} ${t.copiedSegments}`);
  };

  const handleExecuteCut = async () => {
    if (!currentProjectId || !currentState) return;
    const payload = buildEditsPayload(currentState.words, currentState.selected, burnSubtitle);
    if (!payload.deletes.length) {
      showMessageDialog('info', t.confirmCutTitle, t.selectFirst);
      return;
    }

    const originalDuration = Math.max(duration || 0, getApproxProjectDuration(currentState.words));
    const deletedDuration = sumSegmentDuration(payload.deletes);
    const keptDuration = Math.max(1, originalDuration - deletedDuration);
    const estimated = estimateExportSeconds({
      mode: 'cut',
      burnSubtitle,
      workUnits: originalDuration + (burnSubtitle ? keptDuration : 0),
      projectCount: 1,
      segmentCount: payload.deletes.length,
    });
    const estText = formatDuration(estimated, t);
    const confirmed = await requestConfirmDialog(
      t.confirmCutTitle,
      `📹 ${t.currentProject}: ${currentProjectId}\n⏱️ ${t.estimatedTime}: ${estText}\n\n${t.clickToStart}`
    );
    if (!confirmed)
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
      const elapsedSeconds = (Date.now() - start) / 1000;
      const totalTime = elapsedSeconds.toFixed(1);
      if (data.success) {
        recordExportBenchmark(
          'cut',
          burnSubtitle,
          originalDuration + (burnSubtitle ? keptDuration : 0),
          elapsedSeconds
        );
        const subtitleMsg = data.subtitleOutput ? `\n${t.subtitleOutputLabel}: ${data.subtitleOutput}` : '';
        showMessageDialog(
          'success',
          t.cutDone,
          `✅ ${t.cutDone} (${totalTime}s)\n\n📁 ${t.output}: ${data.output}${subtitleMsg}\n\n${t.originalDuration}: ${formatDuration(data.originalDuration || 0, t)}\n${t.newDuration}: ${formatDuration(data.newDuration || 0, t)}\n${t.deleted}: ${formatDuration(data.deletedDuration || 0, t)} (${data.savedPercent}%)`
        );
      } else {
        showMessageDialog('error', t.cutFailed, `❌ ${t.cutFailed}: ${data.error}`);
      }
    } catch (err: any) {
      clearInterval(timer);
      setLoading({ show: false, elapsed: 0, estimate: 0 });
      showMessageDialog('error', t.requestFailed, `❌ ${t.requestFailed}: ${err.message}\n\n${t.ensureServer}`);
    }
  };

  const handleExecuteMergeCut = async () => {
    const projectIds = orderedProjectIds.filter((projectId) => includedProjectIds.has(projectId));
    if (!projectIds.length) {
      showMessageDialog('info', t.confirmMergeTitle, t.selectFirst);
      return;
    }

    const readyProjects = projectIds.filter((projectId) => stateByProject[projectId]);
    if (!readyProjects.length) {
      showMessageDialog('error', t.loadFailed, t.loadFailed);
      return;
    }

    const deleteMap = readyProjects.reduce<Record<string, Array<{ start: number; end: number }>>>((acc, projectId) => {
      const projectState = stateByProject[projectId];
      acc[projectId] = buildEditsPayload(projectState.words, projectState.selected, false).deletes;
      return acc;
    }, {});

    const totals = readyProjects.reduce(
      (acc, projectId) => {
        const projectState = stateByProject[projectId];
        const deletes = deleteMap[projectId] || [];
        const originalDuration = getApproxProjectDuration(projectState.words);
        const deletedDuration = sumSegmentDuration(deletes);
        const keptDuration = Math.max(1, originalDuration - deletedDuration);
        acc.original += originalDuration;
        acc.kept += keptDuration;
        acc.segmentCount += deletes.length;
        return acc;
      },
      { original: 0, kept: 0, segmentCount: 0 }
    );

    const estimated = estimateExportSeconds({
      mode: 'merge',
      burnSubtitle,
      workUnits: totals.original + (burnSubtitle ? totals.kept : 0),
      projectCount: readyProjects.length,
      segmentCount: totals.segmentCount,
    });
    const estText = formatDuration(estimated, t);
    const confirmed = await requestConfirmDialog(
      t.confirmMergeTitle,
      `${t.mergeProjectCount}: ${readyProjects.length}\n⏱️ ${t.estimatedTime}: ${estText}`
    );
    if (!confirmed) {
      return;
    }

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
      const data = await executeMergeCut(readyProjects, deleteMap, burnSubtitle);
      clearInterval(timer);
      setLoading({ show: false, elapsed: 0, estimate: 0 });
      const elapsedSeconds = (Date.now() - start) / 1000;
      const totalTime = elapsedSeconds.toFixed(1);
      if (data.success) {
        recordExportBenchmark(
          'merge',
          burnSubtitle,
          totals.original + (burnSubtitle ? totals.kept : 0),
          elapsedSeconds
        );
        const subtitleMsg = data.subtitleOutput ? `\n${t.subtitleOutputLabel}: ${data.subtitleOutput}` : '';
        showMessageDialog(
          'success',
          t.mergeDone,
          `✅ ${t.mergeDone} (${totalTime}s)\n\n📁 ${t.output}: ${data.output}${subtitleMsg}\n\n${t.mergeProjectCount}: ${data.projectCount || readyProjects.length}\n${t.originalDuration}: ${formatDuration(data.originalDuration || 0, t)}\n${t.newDuration}: ${formatDuration(data.newDuration || 0, t)}\n${t.deleted}: ${formatDuration(data.deletedDuration || 0, t)} (${data.savedPercent}%)`
        );
      } else {
        showMessageDialog('error', t.mergeFailed, `❌ ${t.mergeFailed}: ${data.error}`);
      }
    } catch (err: any) {
      clearInterval(timer);
      setLoading({ show: false, elapsed: 0, estimate: 0 });
      showMessageDialog('error', t.mergeFailed, `❌ ${t.mergeFailed}: ${err.message}\n\n${t.ensureServer}`);
    }
  };

  return {
    loading: loading.show,
    exportDialog: dialog,
    progressPercent,
    progressPercentLabel,
    progressText,
    handleDialogConfirm,
    handleDialogCancel,
    handleCopyDeleteList,
    handleExecuteCut,
    handleExecuteMergeCut,
  };
}
