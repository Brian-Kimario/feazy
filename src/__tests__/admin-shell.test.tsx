// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { Dialog } from '@/components/ui/Dialog';
import { ADMIN_NAV, ADMIN_NAV_ITEMS } from '@/components/admin/admin-nav';
import { activeNavHref } from '@/components/shell/nav';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const root = path.resolve(__dirname, '../..');

function Harness({ dismissible = true, onCloseSpy }: { dismissible?: boolean; onCloseSpy?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button id="opener" onClick={() => setOpen(true)}>
        open
      </button>
      {open && (
        <Dialog
          title="Cancel JOB-1"
          description="Explains the action"
          dismissible={dismissible}
          onClose={() => {
            onCloseSpy?.();
            setOpen(false);
          }}
        >
          <input id="first" aria-label="first" />
          <button id="last">last</button>
        </Dialog>
      )}
    </div>
  );
}

describe('Dialog', () => {
  let container: HTMLDivElement;
  let rootEl: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    rootEl = createRoot(container);
  });
  afterEach(() => {
    act(() => rootEl.unmount());
    container.remove();
    document.body.style.overflow = '';
  });

  const open = () => {
    const opener = container.querySelector<HTMLButtonElement>('#opener')!;
    opener.focus();
    act(() => opener.click());
    return opener;
  };
  const key = (key: string, shiftKey = false) =>
    act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
    });

  it('is a labelled, described modal dialog', () => {
    act(() => rootEl.render(<Harness />));
    open();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent).toBe('Cancel JOB-1');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent).toBe('Explains the action');
  });

  it('moves focus in, locks scroll, and restores both on close', () => {
    act(() => rootEl.render(<Harness />));
    const opener = open();
    expect(document.activeElement).toBe(document.getElementById('first'));
    expect(document.body.style.overflow).toBe('hidden');
    key('Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('Escape and the backdrop close it', () => {
    const spy = vi.fn();
    act(() => rootEl.render(<Harness onCloseSpy={spy} />));
    open();
    act(() => (document.querySelector('[data-testid="dialog-backdrop"]') as HTMLElement).click());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('does nothing on Escape, backdrop or close while an action is running', () => {
    const spy = vi.fn();
    act(() => rootEl.render(<Harness dismissible={false} onCloseSpy={spy} />));
    open();
    key('Escape');
    act(() => (document.querySelector('[data-testid="dialog-backdrop"]') as HTMLElement).click());
    expect(spy).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('traps Tab and Shift+Tab inside the panel', () => {
    act(() => rootEl.render(<Harness />));
    open();
    const last = document.getElementById('last')!;
    const closeBtn = document.querySelector<HTMLElement>('[aria-label="Close dialog"]')!;
    act(() => last.focus());
    key('Tab');
    expect(document.activeElement).toBe(closeBtn);
    key('Tab', true);
    expect(document.activeElement).toBe(last);
  });
});

describe('admin navigation data', () => {
  it('only links routes that have a page', () => {
    for (const item of ADMIN_NAV_ITEMS) {
      const file = path.join(root, 'src/app', item.href, 'page.tsx');
      expect(fs.existsSync(file), `${item.href} has no page.tsx`).toBe(true);
    }
  });

  it('has unique hrefs and keeps the planned section names for what exists', () => {
    const hrefs = ADMIN_NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(ADMIN_NAV.map((s) => s.label)).toEqual(['Overview', 'Operations', 'Jobs & Bookings', 'People', 'Activity & Audit']);
  });

  it('highlights exactly one item, and Overview only on /admin', () => {
    expect(activeNavHref('/admin', ADMIN_NAV_ITEMS)).toBe('/admin');
    expect(activeNavHref('/admin/jobs/abc', ADMIN_NAV_ITEMS)).toBe('/admin/jobs');
    expect(activeNavHref('/admin/operations/unmatched', ADMIN_NAV_ITEMS)).toBe('/admin/operations');
    expect(activeNavHref('/admin/professionals', ADMIN_NAV_ITEMS)).toBe('/admin/professionals');
  });

  it('the layout keeps its auth and role guard and renders the shell', () => {
    const layout = fs.readFileSync(path.join(root, 'src/app/admin/layout.tsx'), 'utf8');
    expect(layout).toMatch(/redirect\('\/auth\/login'\)/);
    expect(layout).toMatch(/profile\.role !== 'admin'/);
    expect(layout).toMatch(/<AdminShell/);
    const shell = fs.readFileSync(path.join(root, 'src/components/admin/AdminShell.tsx'), 'utf8');
    // The skip link lives in the root layout; the shell must provide its target.
    expect(fs.readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8')).toMatch(/href="#main-content"/);
    expect(shell).toMatch(/id="main-content"[^>]*tabIndex=\{-1\}/);
  });
});
