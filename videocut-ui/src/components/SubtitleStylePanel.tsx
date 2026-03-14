import { useMemo, useState } from 'react';
import { useLocale } from '../i18n';
import { SUBTITLE_STYLE_PRESETS, SUBTITLE_STYLE_PROMPT_TEMPLATE } from '../subtitleStyle';
import type { SubtitleStylePreset } from '../types';

interface SubtitleStylePanelProps {
  burnSubtitle: boolean;
  stylePreset: SubtitleStylePreset;
  styleJson: string;
  styleError: string;
  onBurnSubtitleChange: (value: boolean) => void;
  onApplyPreset: (style: SubtitleStylePreset) => void;
  onStyleJsonChange: (raw: string) => void;
}

export function SubtitleStylePanel({
  burnSubtitle,
  stylePreset,
  styleJson,
  styleError,
  onBurnSubtitleChange,
  onApplyPreset,
  onStyleJsonChange,
}: SubtitleStylePanelProps) {
  const { t } = useLocale();
  const [copyFeedback, setCopyFeedback] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('videocut-subtitle-style-collapsed') !== 'false';
  });

  const statusText = useMemo(() => {
    if (styleError) return `${t.subtitleJsonInvalid}: ${styleError}`;
    return t.subtitleJsonValid;
  }, [styleError, t]);

  const activePresetId = useMemo(() => {
    const current = JSON.stringify(stylePreset);
    return SUBTITLE_STYLE_PRESETS.find((preset) => JSON.stringify(preset.style) === current)?.id || null;
  }, [stylePreset]);

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(SUBTITLE_STYLE_PROMPT_TEMPLATE);
    setCopyFeedback(t.subtitlePromptCopied);
    window.setTimeout(() => setCopyFeedback(''), 1500);
  };

  const handleToggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('videocut-subtitle-style-collapsed', String(next));
      }
      return next;
    });
  };

  return (
    <section className="subtitle-style-card">
      <button type="button" className="subtitle-style-header subtitle-style-toggle" onClick={handleToggleCollapsed}>
        <div>
          <h2>{t.subtitleStyleTitle}</h2>
        </div>
        <div className="subtitle-style-header-right">
          <label
            className="subtitle-style-switch"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              className="subtitle-style-switch-input"
              checked={burnSubtitle}
              onChange={(event) => onBurnSubtitleChange(event.target.checked)}
            />
            <span className="subtitle-style-switch-track" aria-hidden="true">
              <span className="subtitle-style-switch-thumb" />
            </span>
            <span className="subtitle-style-switch-text">{t.burnSubtitle}</span>
          </label>
        </div>
      </button>

      {!collapsed && (
        <>
          <div className="subtitle-style-section">
            <div className="subtitle-style-label">{t.subtitlePresetLabel}</div>
            <div className="subtitle-preset-list">
              {SUBTITLE_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`subtitle-preset-chip ${activePresetId === preset.id ? 'active' : ''}`.trim()}
                  onClick={() => onApplyPreset({ ...preset.style })}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="subtitle-style-section">
            <label className="subtitle-style-label" htmlFor="subtitle-style-json">
              {t.subtitleJsonLabel}
            </label>
            <p className="subtitle-style-helper">{t.subtitleJsonHint}</p>
            <textarea
              id="subtitle-style-json"
              className={`subtitle-json-input ${styleError ? 'has-error' : ''}`.trim()}
              value={styleJson}
              spellCheck={false}
              onChange={(event) => onStyleJsonChange(event.target.value)}
            />
            <div className={`subtitle-style-status ${styleError ? 'error' : 'ok'}`.trim()}>{statusText}</div>
          </div>

          <div className="subtitle-style-section">
            <div className="subtitle-style-label-row">
              <div>
                <div className="subtitle-style-label">{t.subtitlePromptLabel}</div>
                <p className="subtitle-style-helper">{t.subtitlePromptHint}</p>
              </div>
              <button type="button" className="btn-ghost" onClick={handleCopyPrompt}>
                {copyFeedback || t.subtitleCopyPrompt}
              </button>
            </div>
            <div className="subtitle-style-upcoming">{t.subtitleUpcoming}</div>
          </div>
        </>
      )}
    </section>
  );
}
