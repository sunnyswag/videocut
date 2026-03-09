import type { Project } from '../types';

interface ProjectTabsProps {
  projects: Project[];
  currentProjectId: string | null;
  errorText: string;
  onSelect: (id: string) => void;
}

export function ProjectTabs({ projects, currentProjectId, errorText, onSelect }: ProjectTabsProps) {
  return (
    <div className="tabs">
      {projects.length === 0 && !errorText && <div className="empty-state">暂无项目，请先运行剪口播流程生成数据。</div>}
      {errorText && <div className="empty-state">加载失败: {errorText}</div>}
      {projects.map((p) => (
        <button key={p.id} className={`tab ${p.id === currentProjectId ? 'active' : ''}`} onClick={() => onSelect(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}
