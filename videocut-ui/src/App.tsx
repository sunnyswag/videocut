import { useReviewState } from './hooks/useReviewState';
import { useTheme } from './hooks/useTheme';
import { useLocale } from './i18n';
import { LoadingOverlay } from './components/LoadingOverlay';
import { ExportDialog } from './components/ExportDialog';
import { BatchExportPanel } from './components/BatchExportPanel';
import { ControlsBar } from './components/ControlsBar';
import { WordTimeline } from './components/WordTimeline';
import { SubtitleOverlay } from './components/SubtitleOverlay';
import { SubtitleStylePanel } from './components/SubtitleStylePanel';
import { ThemeToggle } from './components/ThemeToggle';
import { LocaleToggle } from './components/LocaleToggle';
import './style.css';

function App() {
  const state = useReviewState();
  useTheme();
  const { t } = useLocale();

  return (
    <div className="app">
      <LoadingOverlay
        loading={state.loading}
        progressPercent={state.progressPercent}
        progressPercentLabel={state.progressPercentLabel}
        progressText={state.progressText}
      />
      <ExportDialog dialog={state.exportDialog} onConfirm={state.handleDialogConfirm} onCancel={state.handleDialogCancel} />

      <header className="header">
        <div className="header-left">
          <h1>VideoCut</h1>
          <span className="header-badge">{t.review}</span>
        </div>
        <div className="header-right">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>

      {state.projects.length > 1 && (
        <BatchExportPanel
          projects={state.projects}
          currentProjectId={state.currentProjectId}
          orderedProjectIds={state.orderedProjectIds}
          includedProjectIds={state.includedProjectIds}
          stateByProject={state.stateByProject}
          onSelectProject={state.setCurrentProjectId}
          onToggleInclude={state.toggleIncludeProject}
          onReorderProject={state.reorderProject}
          onExecuteMergeCut={state.handleExecuteMergeCut}
        />
      )}

      <div className="video-section">
        {state.projects.map((project) => (
          <video
            key={project.id}
            ref={(element) => state.registerVideoElement(project.id, element)}
            className={`video-player ${project.id === state.currentProjectId ? 'active' : ''}`.trim()}
            preload="auto"
            playsInline
            onTimeUpdate={() => state.handleVideoTimeUpdate(project.id)}
          />
        ))}
        {state.burnSubtitle && (
          <SubtitleOverlay
            currentTime={state.currentTime}
            words={state.words}
            selected={state.selected}
            stylePreset={state.subtitleStyle}
          />
        )}
      </div>

      <ControlsBar
        currentTime={state.currentTime}
        duration={state.duration}
        isPlaying={state.isPlaying}
        videoRef={state.videoRef}
        onPlayPause={state.handlePlayPause}
      />

      <SubtitleStylePanel
        burnSubtitle={state.burnSubtitle}
        stylePreset={state.subtitleStyle}
        styleJson={state.subtitleStyleJson}
        styleError={state.subtitleStyleError}
        onBurnSubtitleChange={state.setBurnSubtitle}
        onApplyPreset={state.applySubtitleStyle}
        onStyleJsonChange={state.setSubtitleStyleJson}
      />

      <div className="timeline-card">
        <div className="timeline-toolbar">
          <div className="timeline-toolbar-left">
            <span className="stats-inline timeline-stats">
              <strong>{state.selected.size}</strong> {t.segments} · {state.selectedDuration.toFixed(1)}s
            </span>
            <button className="btn-ghost" onClick={state.handleResetToDefault}>{t.resetDefault}</button>
          </div>
          <div className="timeline-help">
            <button className="help-toggle" type="button">
              {t.instructions}
            </button>
            <div className="help-content help-popover">
              <span><b>{t.helpClick}</b> {t.helpJumpPlay}</span>
              <span className="help-sep">·</span>
              <span><b>{t.helpDblClick}</b> {t.helpSelectToggle}</span>
              <span className="help-sep">·</span>
              <span><b>{t.helpShiftDrag}</b> {t.helpBatch}</span>
              <span className="help-sep">·</span>
              <span><b>{t.helpSpace}</b> {t.playPause}</span>
              <span className="help-sep">·</span>
              <span><b>{t.helpArrows}</b> {t.helpJump}</span>
              <span className="help-sep">·</span>
              <span className="color-warning">●</span> {t.aiPreselect}
              <span className="help-sep">·</span>
              <span className="color-danger">●</span> {t.confirmedDelete}
            </div>
          </div>
        </div>
        <WordTimeline
          words={state.words}
          selected={state.selected}
          autoSelected={state.autoSelected}
          currentWordIndex={state.currentWordIndex}
          wordRefs={state.wordRefs}
          onWordClick={state.handleWordClick}
          onToggleWord={state.toggleWord}
          onWordMouseDown={state.handleWordMouseDown}
          onWordMouseEnter={state.handleWordMouseEnter}
        />
      </div>
    </div>
  );
}

export default App;
