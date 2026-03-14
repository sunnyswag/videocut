import { useLocale } from '../i18n';

interface LoadingOverlayProps {
  loading: boolean;
  progressPercent: number;
  progressPercentLabel: string;
  progressText: string;
}

export function LoadingOverlay({ loading, progressPercent, progressPercentLabel, progressText }: LoadingOverlayProps) {
  const { t } = useLocale();

  return (
    <div className={`loading-overlay ${loading ? 'show' : ''}`}>
      <div className="loading-spinner"></div>
      <div className="loading-text">{t.cutting}</div>
      <div className="loading-progress-container">
        <div className="loading-progress-bar" style={{ width: `${progressPercent}%` }}></div>
      </div>
      <div className="loading-time">{loading ? `${t.processing} · ${progressPercentLabel}` : t.processing}</div>
      <div className="loading-estimate">{loading ? progressText : t.estimateCalc}</div>
    </div>
  );
}
