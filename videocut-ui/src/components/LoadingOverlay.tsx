interface LoadingOverlayProps {
  loading: boolean;
  progressPercent: number;
  progressText: string;
}

export function LoadingOverlay({ loading, progressPercent, progressText }: LoadingOverlayProps) {
  return (
    <div className={`loading-overlay ${loading ? 'show' : ''}`}>
      <div className="loading-spinner"></div>
      <div className="loading-text">🎬 正在剪辑中...</div>
      <div className="loading-progress-container">
        <div className="loading-progress-bar" style={{ width: `${progressPercent}%` }}></div>
      </div>
      <div className="loading-time">处理中...</div>
      <div className="loading-estimate">{loading ? progressText : '预估剩余: 计算中...'}</div>
    </div>
  );
}
