// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { describeAdminAction } from '@/lib/admin/activity';
import { AssignmentQueueBanner, isQueueFailing } from '@/components/admin/AssignmentQueueBanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '../..');

describe('describeAdminAction', () => {
  it('describes closing rows and ignores everything else', () => {
    expect(describeAdminAction('admin.job.cancel.succeeded')).toEqual({ label: 'Cancelled a job', outcome: 'succeeded' });
    expect(describeAdminAction('admin.job.cancel.failed')?.outcome).toBe('failed');
    expect(describeAdminAction('admin.job.cancel.requested')).toBeNull();
    expect(describeAdminAction('auth.login')).toBeNull();
  });
  it('falls back to a readable label for unknown actions', () => {
    expect(describeAdminAction('admin.some_new.thing.succeeded')?.label).toBe('some new thing');
  });
});

describe('AssignmentQueueBanner', () => {
  const ok = { scheduled: true, lastRunAt: '2026-11-01T10:00:00Z', lastStatus: 'succeeded', failures24h: 0 };
  it('treats unknown, unscheduled and failing states as problems', () => {
    expect(isQueueFailing(null)).toBe(true);
    expect(isQueueFailing({ ...ok, scheduled: false })).toBe(true);
    expect(isQueueFailing({ ...ok, failures24h: 2 })).toBe(true);
    expect(isQueueFailing(ok)).toBe(false);
  });
  it('announces a problem as an alert and a healthy queue as plain text', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const r = createRoot(el);
    act(() => r.render(<AssignmentQueueBanner queue={null} />));
    expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/Could not read/);
    act(() => r.render(<AssignmentQueueBanner queue={ok} />));
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).toMatch(/0 failed runs/);
    act(() => r.unmount());
    el.remove();
  });
});

describe('Command Center page source', () => {
  const src = fs.readFileSync(path.join(root, 'src/app/admin/page.tsx'), 'utf8');
  it('uses tokens, not hex literals', () => {
    expect(src).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
  it('is never cached and shows failures as errors', () => {
    expect(src).toMatch(/dynamic = 'force-dynamic'/);
    expect((src.match(/role="alert"/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(src).toMatch(/Not zero/);
  });
  it('only links to routes that exist', () => {
    const hrefs = [...src.matchAll(/href="(\/admin[^"?]*)/g)].map((m) => m[1]);
    for (const h of new Set(hrefs)) expect(fs.existsSync(path.join(root, 'src/app', h, 'page.tsx')), h).toBe(true);
  });
});
