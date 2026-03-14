import { useReviewState } from './hooks/useReviewState';
import { useTheme } from './hooks/useTheme';
import { useLocale } from './i18n';
import { LoadingOverlay } from './components/LoadingOverlay';
import { ProjectTabs } from './components/ProjectTabs';
import { ControlsBar } from './components/ControlsBar';
import { WordTimeline } from './components/WordTimeline';
import { ThemeToggle } from './components/ThemeToggle';
import { LocaleToggle } from './components/LocaleToggle';
import './style.css';

function App() {
  const state = useReviewState();
  useTheme();
  const { t } = useLocale();

  return (
    <div className="app">
      <LoadingOverlay loading={state.loading} progressPercent={state.progressPercent} progressText={state.progressText} />

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
        <ProjectTabs projects={state.projects} currentProjectId={state.currentProjectId} errorText={state.errorText} onSelect={state.setCurrentProjectId} />
      )}

      <div className="video-section">
        <video id="videoPlayer" ref={state.videoRef} preload="auto" onTimeUpdate={state.handleVideoTimeUpdate}></video>
      </div>

      <ControlsBar
        currentTime={state.currentTime}
        duration={state.duration}
        videoRef={state.videoRef}
        onPlayPause={state.handlePlayPause}
        onExecuteCut={state.handleExecuteCut}
        onResetToDefault={state.handleResetToDefault}
        burnSubtitle={state.burnSubtitle}
        onBurnSubtitleChange={state.setBurnSubtitle}
        selectedCount={state.selected.size}
        selectedDuration={state.selectedDuration}
      />

      <div className="timeline-card">
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
