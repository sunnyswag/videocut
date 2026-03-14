import React from 'react';
import { useLocale } from '../i18n';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface ControlsBarProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onExecuteCut: () => void;
  onResetToDefault: () => void;
  burnSubtitle: boolean;
  onBurnSubtitleChange: (value: boolean) => void;
  selectedCount: number;
  selectedDuration: number;
}

export function ControlsBar({
  videoRef,
  currentTime,
  duration,
  onPlayPause,
  onExecuteCut,
  onResetToDefault,
  burnSubtitle,
  onBurnSubtitleChange,
  selectedCount,
  selectedDuration,
}: ControlsBarProps) {
  const { t } = useLocale();

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="btn-icon" onClick={onPlayPause} title={t.playPause}>▶︎</button>
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

      <div className="toolbar-center">
        {selectedCount > 0 && (
          <span className="stats-inline">
            <strong>{selectedCount}</strong> {t.segments} · {selectedDuration.toFixed(1)}s
          </span>
        )}
      </div>

      <div className="toolbar-group">
        <label className="burn-label">
          <input
            type="checkbox"
            checked={burnSubtitle}
            onChange={(e) => onBurnSubtitleChange(e.target.checked)}
          />
          {t.burnSubtitle}
        </label>
        <button className="btn-ghost" onClick={onResetToDefault}>{t.resetDefault}</button>
        <button className="btn-execute" onClick={onExecuteCut}>{t.executeCut}</button>
      </div>

      <details className="help">
        <summary>{t.instructions}</summary>
        <div className="help-content">
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
      </details>
    </div>
  );
}
