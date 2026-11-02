// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const recover = vi.fn();
vi.mock('@/lib/services/admin-assignment', () => ({ adminRecoverSuspendedProfessional: (...a: unknown[]) => recover(...a) }));

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { RetryRecoveryButton } from '@/components/admin/RetryRecoveryButton';

let host: HTMLElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); recover.mockReset(); refresh.mockReset(); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const tick = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const text = () => document.body.textContent ?? '';
const esc = () => act(() => { document.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
const btn = (label: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

describe('ConfirmDialog', () => {
  const render = (p: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
    const onConfirm = vi.fn(); const onCancel = vi.fn();
    act(() => root.render(<ConfirmDialog title="Suspend Asha" confirmLabel="Suspend" onConfirm={onConfirm} onCancel={onCancel} {...p}>Offers will be released.</ConfirmDialog>));
    return { onConfirm, onCancel };
  };
  it('states the consequence, is a labelled modal dialog, and confirms only on click', () => {
    const { onConfirm, onCancel } = render({ tone: 'danger' });
    const d = document.querySelector('[role=dialog]')!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(text()).toContain('Offers will be released.');
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => btn('Suspend').click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(btn('Suspend').className).toContain('bg-danger');
  });
  it('cancel and Escape close it', () => {
    const { onCancel } = render();
    act(() => btn('Cancel').click());
    esc();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
  it('while busy it blocks both buttons and cannot be dismissed', () => {
    const { onCancel, onConfirm } = render({ busy: true });
    expect(btn('Working').disabled).toBe(true);
    expect(btn('Cancel').disabled).toBe(true);
    esc();
    act(() => btn('Working').click());
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it('announces an error as an alert', () => {
    render({ error: 'Stale state' });
    expect(document.querySelector('[role=alert]')?.textContent).toBe('Stale state');
  });
});

describe('RetryRecoveryButton', () => {
  const mount = () => act(() => root.render(<ToastProvider><RetryRecoveryButton professionalId="p1" /></ToastProvider>));

  it('repeats batches until the server reports done, then refreshes and toasts success', async () => {
    recover.mockResolvedValueOnce({ ok: true, data: { done: false } }).mockResolvedValueOnce({ ok: true, data: { done: true } });
    mount();
    await act(async () => { btn('Retry recovery').click(); });
    await tick(); await tick();
    expect(recover).toHaveBeenCalledTimes(2);
    expect(recover).toHaveBeenCalledWith({ professionalId: 'p1', limit: 25 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Recovery finished');
    expect(document.querySelectorAll('[role=status]').length).toBeGreaterThan(0);
  });
  it('shows the server error and does not refresh on failure', async () => {
    recover.mockResolvedValue({ ok: false, code: 'FORBIDDEN', error: 'Not allowed' });
    mount();
    await act(async () => { btn('Retry recovery').click(); });
    await tick();
    expect(recover).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Not allowed');
    expect(refresh).not.toHaveBeenCalled();
  });
  it('is bounded: stops after 20 batches and tells the admin to run it again', async () => {
    recover.mockResolvedValue({ ok: true, data: { done: false } });
    mount();
    await act(async () => { btn('Retry recovery').click(); });
    for (let i = 0; i < 25; i++) await tick();
    expect(recover).toHaveBeenCalledTimes(20);
    expect(text()).toContain('still running');
  });
  it('cannot be double-clicked while running', async () => {
    let release!: (v: unknown) => void;
    recover.mockReturnValueOnce(new Promise((r) => { release = r; }));
    mount();
    await act(async () => { btn('Retry recovery').click(); });
    expect(btn('Running recovery').disabled).toBe(true);
    await act(async () => { btn('Running recovery').click(); });
    expect(recover).toHaveBeenCalledTimes(1);
    await act(async () => { release({ ok: true, data: { done: true } }); });
    await tick();
  });
  it('an unexpected throw reports that the outcome is unknown', async () => {
    recover.mockRejectedValue(new Error('network'));
    mount();
    await act(async () => { btn('Retry recovery').click(); });
    await tick();
    expect(text()).toContain('result is unknown');
  });
});
