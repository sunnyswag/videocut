import { useLocale } from '../i18n';

export type ExportDialogTone = 'confirm' | 'success' | 'error' | 'info';

export interface ExportDialogState {
  open: boolean;
  tone: ExportDialogTone;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
}

interface ExportDialogProps {
  dialog: ExportDialogState;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ExportDialog({ dialog, onConfirm, onCancel }: ExportDialogProps) {
  const { t } = useLocale();

  if (!dialog.open) return null;

  const confirmLabel = dialog.confirmLabel || t.dialogConfirm;
  const cancelLabel = dialog.cancelLabel || t.dialogCancel;
  const toneClass = `export-dialog-card tone-${dialog.tone}`;

  return (
    <div className="export-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className={toneClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="export-dialog-header">
          <div className="export-dialog-eyebrow">VideoCut</div>
          <h2 id="export-dialog-title">{dialog.title}</h2>
        </div>
        <div className="export-dialog-body">{dialog.message}</div>
        <div className="export-dialog-actions">
          {dialog.showCancel && (
            <button type="button" className="dialog-btn dialog-btn-secondary" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button type="button" className="dialog-btn dialog-btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
