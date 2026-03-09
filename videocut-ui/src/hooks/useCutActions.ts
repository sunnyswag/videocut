import { useMemo, useState } from 'react';
import { executeCut } from '../api';
import type { Word, ProjectState } from '../types';

function formatDuration(seconds: string | number): string {
  const s = Number(seconds) || 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}分${sec}秒` : `${sec}秒`;
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
}

export function useCutActions({ currentProjectId, currentState, duration, burnSubtitle }: UseCutActionsProps) {
  const [loading, setLoading] = useState({ show: false, elapsed: 0, estimate: 0 });

  const progressPercent = useMemo(
    () => (loading.estimate > 0 ? Math.min(95, (loading.elapsed / loading.estimate) * 100) : 0),
    [loading]
  );
  const progressText = useMemo(
    () =>
      loading.elapsed >= loading.estimate
        ? '即将完成...'
        : `预估剩余: ${Math.max(0, loading.estimate - loading.elapsed)} 秒`,
    [loading]
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
    alert('已复制 ' + merged.length + ' 个删除片段到剪贴板');
  };

  const handleExecuteCut = async () => {
    if (!currentProjectId || !currentState) return;
    const payload = buildEditsPayload(currentState.words, currentState.selected, burnSubtitle);
    if (!payload.deletes.length) {
      alert('请先选择要删除的内容');
      return;
    }

    const estimated = Math.max(5, Math.ceil((duration || 0) / 4));
    const estMin = Math.floor(estimated / 60);
    const estSec = estimated % 60;
    const estText = estMin > 0 ? `${estMin}分${estSec}秒` : `${estSec}秒`;
    if (!confirm(`确认执行剪辑？\n\n📹 当前项目: ${currentProjectId}\n⏱️ 预计耗时: ${estText}\n\n点击确定开始`))
      return;

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
        const subtitleMsg = data.subtitleOutput ? `\n字幕输出: ${data.subtitleOutput}` : '';
        alert(
          `✅ 剪辑完成！(耗时 ${totalTime}s)\n\n📁 输出: ${data.output}${subtitleMsg}\n\n原时长: ${formatDuration(data.originalDuration || 0)}\n新时长: ${formatDuration(data.newDuration || 0)}\n删减: ${formatDuration(data.deletedDuration || 0)} (${data.savedPercent}%)`
        );
      } else {
        alert('❌ 剪辑失败: ' + data.error);
      }
    } catch (err: any) {
      clearInterval(timer);
      setLoading({ show: false, elapsed: 0, estimate: 0 });
      alert('❌ 请求失败: ' + err.message + '\n\n请确保使用 videocut review-server 启动服务');
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
