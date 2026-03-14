import type { Project } from '../types';
import { useLocale } from '../i18n';

interface ProjectTabsProps {
  projects: Project[];
  currentProjectId: string | null;
  errorText: string;
  onSelect: (id: string) => void;
}

export function ProjectTabs({ projects, currentProjectId, errorText, onSelect }: ProjectTabsProps) {
  const { t } = useLocale();

  return (
    <div className="tabs">
      {projects.length === 0 && !errorText && <div className="empty-state">{t.noProjects}</div>}
      {errorText && <div className="empty-state">{t.loadFailed} {errorText}</div>}
      {projects.map((p) => (
        <button key={p.id} className={`tab ${p.id === currentProjectId ? 'active' : ''}`} onClick={() => onSelect(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}
