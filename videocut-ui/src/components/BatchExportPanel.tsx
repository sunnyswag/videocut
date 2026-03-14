import type { Project, ProjectState } from '../types';
import { useLocale } from '../i18n';
import { useState } from 'react';

interface BatchExportPanelProps {
  projects: Project[];
  currentProjectId: string | null;
  orderedProjectIds: string[];
  includedProjectIds: Set<string>;
  stateByProject: Record<string, ProjectState>;
  onSelectProject: (projectId: string) => void;
  onToggleInclude: (projectId: string) => void;
  onReorderProject: (sourceProjectId: string, targetProjectId: string) => void;
  onExecuteMergeCut: () => void;
}

export function BatchExportPanel({
  projects,
  currentProjectId,
  orderedProjectIds,
  includedProjectIds,
  stateByProject,
  onSelectProject,
  onToggleInclude,
  onReorderProject,
  onExecuteMergeCut,
}: BatchExportPanelProps) {
  const { t } = useLocale();
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const orderedProjects = orderedProjectIds
    .map((projectId) => projectMap.get(projectId))
    .filter((project): project is Project => Boolean(project));
  const includedCount = orderedProjects.filter((project) => includedProjectIds.has(project.id)).length;

  return (
    <section className="batch-panel">
      <div className="batch-panel-header">
        <div className="batch-project-list">
          {orderedProjects.map((project) => {
            const projectState = stateByProject[project.id];
            const selectedCount = projectState?.selected.size || 0;
            const isIncluded = includedProjectIds.has(project.id);
            const isCurrent = project.id === currentProjectId;

            return (
              <div
                key={project.id}
                className={`batch-project-row ${isIncluded ? '' : 'disabled'} ${isCurrent ? 'active' : ''}`.trim()}
                draggable
                onDragStart={() => setDraggingProjectId(project.id)}
                onDragEnd={() => setDraggingProjectId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggingProjectId && draggingProjectId !== project.id) {
                    onReorderProject(draggingProjectId, project.id);
                  }
                  setDraggingProjectId(null);
                }}
                onClick={() => onSelectProject(project.id)}
              >
                <label
                  className="batch-project-include"
                  onClick={(e) => e.stopPropagation()}
                  title={t.mergeProjectCount}
                >
                  <input type="checkbox" checked={isIncluded} onChange={() => onToggleInclude(project.id)} />
                </label>

                <div className="batch-project-main">
                  <div className="batch-project-title">
                    <strong>{project.name}</strong>
                  </div>
                  <div className="batch-project-subtitle">
                    {selectedCount} {t.segments}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="batch-panel-actions">
          <button className="btn-execute" onClick={onExecuteMergeCut} disabled={includedCount === 0}>
            {t.mergeExecute}
          </button>
        </div>
      </div>
    </section>
  );
}
