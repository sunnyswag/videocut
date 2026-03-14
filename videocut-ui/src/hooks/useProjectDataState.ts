import { useEffect, useMemo, useState } from 'react';
import { fetchProjectData, fetchProjects } from '../api';
import type { Project, ProjectState } from '../types';

export function useProjectDataState() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [stateByProject, setStateByProject] = useState<Record<string, ProjectState>>({});
  const [orderedProjectIds, setOrderedProjectIds] = useState<string[]>([]);
  const [includedProjectIds, setIncludedProjectIds] = useState<Set<string>>(new Set());
  const [burnSubtitle, setBurnSubtitle] = useState(true);
  const [errorText, setErrorText] = useState('');

  const currentState = currentProjectId ? stateByProject[currentProjectId] : null;
  const words = currentState?.words || [];
  const selected = currentState?.selected || new Set<number>();
  const autoSelected = currentState?.autoSelected || new Set<number>();

  const selectedDuration = useMemo(() => {
    let total = 0;
    selected.forEach((i) => {
      total += (words[i]?.end || 0) - (words[i]?.start || 0);
    });
    return total;
  }, [selected, words]);

  const setProjectState = (projectId: string, updater: (state: ProjectState) => ProjectState) => {
    setStateByProject((prev) => {
      const prevState = prev[projectId];
      if (!prevState) return prev;
      const nextState = updater(prevState);
      return { ...prev, [projectId]: nextState };
    });
  };

  const loadOneProject = async (projectId: string) => {
    const data = await fetchProjectData(projectId);
    const projectWords = data.words || [];
    const projectAutoSelected = new Set<number>(Array.isArray(data.autoSelected) ? data.autoSelected : []);
    const projectSelected = new Set<number>(projectAutoSelected);
    setStateByProject((prev) => ({
      ...prev,
      [projectId]: {
        words: projectWords,
        initialAutoSelected: new Set(projectAutoSelected),
        autoSelected: projectAutoSelected,
        selected: projectSelected,
      },
    }));
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchProjects();
        setProjects(list);
        if (!list.length) return;
        setOrderedProjectIds(list.map((p) => p.id));
        setIncludedProjectIds(new Set(list.map((p) => p.id)));
        setCurrentProjectId(list[0].id);
        const results = await Promise.allSettled(list.map((p) => loadOneProject(p.id)));
        const failedCount = results.filter((r) => r.status === 'rejected').length;
        if (failedCount > 0) {
          setErrorText(`部分项目加载失败（${failedCount}/${list.length}）`);
        }
      } catch (err: any) {
        setErrorText(err.message || String(err));
      }
    })();
  }, []);

  const toggleIncludeProject = (projectId: string) => {
    setIncludedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const moveProject = (projectId: string, direction: 'up' | 'down') => {
    setOrderedProjectIds((prev) => {
      const index = prev.indexOf(projectId);
      if (index < 0) return prev;
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const reorderProject = (sourceProjectId: string, targetProjectId: string) => {
    if (sourceProjectId === targetProjectId) return;
    setOrderedProjectIds((prev) => {
      const sourceIndex = prev.indexOf(sourceProjectId);
      const targetIndex = prev.indexOf(targetProjectId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const next = [...prev];
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  };

  return {
    projects,
    currentProjectId,
    setCurrentProjectId,
    stateByProject,
    orderedProjectIds,
    includedProjectIds,
    toggleIncludeProject,
    moveProject,
    reorderProject,
    setProjectState,
    currentState,
    words,
    selected,
    autoSelected,
    burnSubtitle,
    setBurnSubtitle,
    selectedDuration,
    errorText,
  };
}
