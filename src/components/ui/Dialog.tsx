'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  /** Dialogs are mounted while open: render `<Dialog>` conditionally and unmount it to close. */
  title: ReactNode;
  onClose: () => void;
  /** False while an action is running: Escape, the backdrop and the close button do nothing. */
  dismissible?: boolean;
  /** Short explanation read after the title by screen readers. */
  description?: ReactNode;
  /** `center` is a modal card; `left` is a navigation drawer. */
  placement?: 'center' | 'left';
  /** Label for the close button; the default suits most dialogs. */
  closeLabel?: string;
  /** Hide the visible title (the dialog is still labelled). */
  hideTitle?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Shared dialog behaviour for the admin console: role=dialog and aria-modal, labelled by its title,
 * focus moves in on open and returns to the opener on close, Tab is trapped, Escape and the
 * backdrop close it, and the page behind does not scroll.
 */
export function Dialog({
  title,
  onClose,
  dismissible = true,
  description,
  placement = 'center',
  closeLabel = 'Close dialog',
  hideTitle = false,
  children,
  className,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (panel) {
      // Prefer the content (a form field, the first link) over the close button in the header.
      const first = bodyRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (dismissible) onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) {
      e.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const left = placement === 'left';

  return createPortal(
    <div
      className={['fixed inset-0 z-[1050] flex', left ? 'justify-start' : 'items-center justify-center p-4'].join(' ')}
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
        data-testid="dialog-backdrop"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={[
          'relative flex flex-col bg-paper text-ink shadow-xl focus:outline-none',
          left ? 'h-full w-[85vw] max-w-xs' : 'max-h-[90vh] w-full max-w-md rounded-2xl',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 id={titleId} className={hideTitle ? 'sr-only' : 'font-bold text-ink'}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label={closeLabel}
            className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {description && (
          <p id={descId} className="px-5 pt-1 text-xs text-ink-3">
            {description}
          </p>
        )}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
