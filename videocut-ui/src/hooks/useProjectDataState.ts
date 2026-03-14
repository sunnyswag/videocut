import { useEffect, useMemo, useState } from 'react';
import { fetchProjectData, fetchProjects } from '../api';
import type { Project, ProjectState } from '../types';

export function useProjectDataState() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [stateByProject, setStateByProject] = useState<Record<string, ProjectState>>({});
  const [errorText, setErrorText] = useState('');

  const currentState = currentProjectId ? stateByProject[currentProjectId] : null;
  const words = currentState?.words || [];
  const selected = currentState?.selected || new Set<number>();
  const autoSelected = currentState?.autoSelected || new Set<number>();
  const burnSubtitle = Boolean(currentState?.burnSubtitle);

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
        burnSubtitle: true,
      },
    }));
  };

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchProjects();
        setProjects(list);
        if (!list.length) return;
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

  const setBurnSubtitle = (value: boolean) => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, (state) => ({ ...state, burnSubtitle: Boolean(value) }));
  };

  return {
    projects,
    currentProjectId,
    setCurrentProjectId,
    stateByProject,
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
