import { useReviewState } from './hooks/useReviewState';
import { useTheme } from './hooks/useTheme';
import { LoadingOverlay } from './components/LoadingOverlay';
import { ProjectTabs } from './components/ProjectTabs';
import { ControlsBar } from './components/ControlsBar';
import { WordTimeline } from './components/WordTimeline';
import { ThemeToggle } from './components/ThemeToggle';
import './style.css';

function App() {
  const state = useReviewState();
  useTheme();

  return (
    <div>
      <LoadingOverlay loading={state.loading} progressPercent={state.progressPercent} progressText={state.progressText} />
      <div className="header">
        <h1>审核稿</h1>
        <ThemeToggle />
      </div>
      <ProjectTabs projects={state.projects} currentProjectId={state.currentProjectId} errorText={state.errorText} onSelect={state.setCurrentProjectId} />
      <ControlsBar
        videoRef={state.videoRef}
        currentTime={state.currentTime}
        duration={state.duration}
        onTimeUpdate={state.handleVideoTimeUpdate}
        onPlayPause={state.handlePlayPause}
        onCopyDeleteList={state.handleCopyDeleteList}
        onExecuteCut={state.handleExecuteCut}
        onClearAll={state.handleClearAll}
        burnSubtitle={state.burnSubtitle}
        onBurnSubtitleChange={state.setBurnSubtitle}
      />
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
        selectedDuration={state.selectedDuration}
      />
    </div>
  );
}

export default App;
