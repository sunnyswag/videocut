import type { Project, Word, CutResult } from './types';

const API_BASE = '/api';

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
  return res.json();
}

export async function fetchProjectData(projectId: string): Promise<{ words: Word[]; autoSelected: number[] }> {
  const res = await fetch(`${API_BASE}/data/${encodeURIComponent(projectId)}`);
  if (!res.ok) throw new Error(`Failed to fetch project data: ${res.status}`);
  return res.json();
}

export function getVideoUrl(projectId: string): string {
  return `${API_BASE}/video/${encodeURIComponent(projectId)}`;
}

export async function executeCut(
  projectId: string,
  deletes: Array<{ start: number; end: number }>,
  burnSubtitle: boolean = false
): Promise<CutResult> {
  const res = await fetch(`${API_BASE}/cut/${encodeURIComponent(projectId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deletes, burnSubtitle }),
  });
  return res.json();
}
