import React from 'react';
import { useLocale } from '../i18n';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6.5v11l9-5.5-9-5.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="6.5" width="3.5" height="11" rx="1" fill="currentColor" />
      <rect x="13.5" y="6.5" width="3.5" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

interface ControlsBarProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
}

export function ControlsBar({
  videoRef,
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
}: ControlsBarProps) {
  const { t } = useLocale();

  return (
    <div className="toolbar">
      <div className="toolbar-group toolbar-main">
        <button className="btn-icon" onClick={onPlayPause} title={t.playPause}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <select
          className="speed-select"
          defaultValue="1"
          onChange={(e) => {
            if (videoRef.current) videoRef.current.playbackRate = parseFloat(e.target.value);
          }}
        >
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1">1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
        <span className="time-display">
          {formatTime(currentTime)}<span className="time-sep">/</span>{formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
