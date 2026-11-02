'use client';

import type { ReactNode } from 'react';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  title: ReactNode;
  /** What will happen, including consequences. */
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Destructive actions use the danger style. */
  tone?: 'default' | 'danger';
  error?: string | null;
}

/** Render conditionally; unmount to close. While `busy` the dialog cannot be dismissed. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, busy = false, tone = 'default', error }: ConfirmDialogProps) {
  return (
    <Dialog title={title} onClose={onCancel} dismissible={!busy}>
      <div className="space-y-3 text-sm text-ink-2">{children}</div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-ink disabled:opacity-50">
          Cancel
        </button>
        <button
          type="button"
          data-autofocus
          onClick={onConfirm}
          disabled={busy}
          className={`min-h-11 rounded-lg px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 ${tone === 'danger' ? 'bg-danger' : 'bg-primary'}`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
