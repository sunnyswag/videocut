import type { Project, Word, CutResult, SubtitleStylePreset, UserEditsPayload } from './types';

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

export async function fetchVideoStatus(projectId: string): Promise<{ ready: boolean; generating: boolean; needsProxy: boolean }> {
  const res = await fetch(`${API_BASE}/video-status/${encodeURIComponent(projectId)}`);
  if (!res.ok) return { ready: true, generating: false, needsProxy: false };
  return res.json();
}

export async function executeCut(
  projectId: string,
  deletes: Array<{ start: number; end: number }>,
  burnSubtitle: boolean = false,
  subtitleStyle?: SubtitleStylePreset,
  userEdits?: UserEditsPayload
): Promise<CutResult> {
  const res = await fetch(`${API_BASE}/cut/${encodeURIComponent(projectId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deletes, burnSubtitle, subtitleStyle, userEdits }),
  });
  return res.json();
}

export async function saveReview(projectId: string, userEdits: UserEditsPayload): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/save-review/${encodeURIComponent(projectId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userEdits),
  });
  return res.json();
}

export async function executeMergeCut(
  projectIds: string[],
  deleteMap: Record<string, Array<{ start: number; end: number }>>,
  burnSubtitle: boolean = false,
  subtitleStyle?: SubtitleStylePreset
): Promise<CutResult> {
  const res = await fetch(`${API_BASE}/merge-cut`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectIds, deleteMap, burnSubtitle, subtitleStyle }),
  });
  return res.json();
}
