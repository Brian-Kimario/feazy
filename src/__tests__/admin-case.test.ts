import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildCaseTimeline } from '@/lib/admin/case-timeline';
import type { CaseWorkspace } from '@/lib/services/admin-case';

const root = path.resolve(__dirname, '../..');

const base: CaseWorkspace = {
  generatedAt: '2026-11-01T12:00:00Z',
  bookingId: 'b',
  jobId: 'j',
  problemSummary: null,
  urgency: 'standard',
  pricingModel: 'fixed',
  amount: null,
  customer: null,
  professional: null,
  quotes: [{ status: 'sent', total: 900, reason: 'x', createdAt: '2026-11-01T09:00:00Z', expiresAt: null }],
  exceptions: [{ kind: 'no_show', status: 'open', reportedAt: '2026-11-01T10:00:00Z', resolvedAt: null, resolutionNote: null }],
  adminActions: [{ id: 'a1', label: 'Cancelled a job', outcome: 'failed', at: '2026-11-01T11:00:00Z', reason: 'duplicate' }],
  detail: {
    current: null,
    booking: { reference: 'FX-1', serviceName: 'Plumbing', city: null, status: 'pending', scheduledStart: '2026-11-02T09:00:00Z', scheduledEnd: null, createdAt: '2026-11-01T08:00:00Z', unmatchedSince: null },
    job: null,
    events: [{ at: '2026-11-01T08:30:00Z', kind: 'job_created', fromState: null, toState: 'assigned', actor: 'System' }],
    decisions: [],
    attempts: [{ at: '2026-11-01T08:10:00Z', outcome: 'expired', reasonCode: 'no_response', reason: null }],
    payments: [],
    verification: null,
  },
};

describe('buildCaseTimeline', () => {
  it('merges every source newest first', () => {
    const t = buildCaseTimeline(base);
    expect(t.map((e) => e.source)).toEqual(['admin', 'report', 'quote', 'job', 'offer', 'booking']);
  });
  it('marks failed admin actions and unresolved reports as problems', () => {
    const t = buildCaseTimeline(base);
    expect(t.find((e) => e.source === 'admin')).toMatchObject({ tone: 'problem', text: 'Cancelled a job (failed): duplicate' });
    expect(t.find((e) => e.source === 'report')?.tone).toBe('problem');
  });
  it('adds a resolution entry once a report is resolved', () => {
    const t = buildCaseTimeline({ ...base, exceptions: [{ kind: 'no_show', status: 'resolved', reportedAt: '2026-11-01T10:00:00Z', resolvedAt: '2026-11-01T10:30:00Z', resolutionNote: 'refunded' }] });
    expect(t.filter((e) => e.source === 'report').map((e) => e.text)).toEqual(['Report resolved: refunded', 'Customer report: no show']);
  });
});

describe('case workspace is read-only', () => {
  const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
  it('the service and page never write', () => {
    for (const f of ['src/lib/services/admin-case.ts', 'src/app/admin/jobs/[id]/page.tsx']) {
      expect(read(f), f).not.toMatch(/\.(insert|update|upsert|delete)\(|\.rpc\(|'use server'/);
    }
  });
  it('uses tokens, shows failure as an error, and is never cached', () => {
    const page = read('src/app/admin/jobs/[id]/page.tsx');
    expect(page).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect(page).toMatch(/role="alert"/);
    expect(page).toMatch(/notFound\(\)/);
    expect(page).toMatch(/dynamic = 'force-dynamic'/);
  });
});
