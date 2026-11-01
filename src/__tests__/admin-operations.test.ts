import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const db = vi.hoisted(() => ({
  admin: true,
  tables: {} as Record<string, { data: unknown; error: { message: string } | null }>,
}));

vi.mock('@/lib/admin/guard', () => ({
  getAdminActor: async () =>
    db.admin
      ? { ok: true, data: { userId: 'a' } }
      : { ok: false, code: 'FORBIDDEN', error: 'Admin access required' },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      const result = db.tables[table] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'eq', 'neq', 'not', 'is', 'order', 'limit', 'lt', 'gte']) builder[m] = () => builder;
      builder.maybeSingle = async () => result;
      builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
      return builder;
    },
  }),
}));

import {
  bookingJobMismatch,
  classifyBooking,
  classifyVerification,
  classifySuspendedActiveJob,
  classifyAssignmentDrift,
  formatDuration,
  sortCases,
  type OpsBookingRow,
  type OpsJobRow,
} from '@/lib/admin/operations';
import { DEFAULT_OPERATIONS_THRESHOLDS as T, resolveOperationsThresholds } from '@/lib/admin/operations-config';
import { getOperationsCaseDetail, getOperationsQueue } from '@/lib/services/admin-operations';
import { isAdminFailure } from '@/lib/admin/result';

const NOW = new Date('2026-10-30T12:00:00Z');
const at = (minutesFromNow: number) => new Date(NOW.getTime() + minutesFromNow * 60_000).toISOString();

function job(over: Partial<OpsJobRow> = {}): OpsJobRow {
  return {
    id: 'job',
    state: 'accepted',
    professionalId: 'pro',
    professionalName: 'Pro A',
    offerExpiresAt: null,
    updatedAt: at(-60),
    lastEventAt: null,
    lastMessageAt: null,
    ...over,
  };
}
function booking(over: Partial<OpsBookingRow> = {}): OpsBookingRow {
  return {
    id: 'bk',
    reference: 'BK-1',
    status: 'pending',
    scheduledStart: at(120),
    scheduledEnd: at(180),
    unmatchedSince: null,
    createdAt: at(-600),
    serviceName: 'Plumbing',
    city: 'Pune',
    job: job(),
    ...over,
  };
}
const classify = (b: OpsBookingRow) => classifyBooking(b, NOW, T);

describe('bookingJobMismatch', () => {
  it.each([
    ['pending', 'accepted'],
    ['confirmed', 'in_progress'],
    ['pending', 'completed'],
    ['cancelled', 'cancelled'],
    ['cancelled', 'closed'],
    ['completed', 'completed'],
    ['completed', 'closed'],
    ['pending', null],
  ])('treats %s + %s as consistent', (b, j) => expect(bookingJobMismatch(b, j)).toBeNull());

  it.each([
    ['cancelled', 'assigned'],
    ['cancelled', 'in_progress'],
    ['completed', 'accepted'],
    ['completed', null],
    ['weird', 'accepted'],
    ['pending', 'weird'],
  ])('flags %s + %s', (b, j) => expect(bookingJobMismatch(b, j)).toMatch(/\w/));
});

describe('classifyBooking', () => {
  it('flags the orphan-job shape (cancelled booking, live unassigned job) as a mismatch', () => {
    const c = classify(booking({ status: 'cancelled', job: job({ state: 'assigned', professionalId: null, professionalName: null }) }));
    expect(c?.type).toBe('state_mismatch');
    expect(c?.severity).toBe('high');
  });

  it('flags a pending booking without a job whose start has passed as stale_pending', () => {
    const c = classify(booking({ job: null, scheduledStart: at(-60) }));
    expect(c?.type).toBe('stale_pending');
    expect(c?.title).toMatch(/needs a decision/);
  });

  it('uses the softer wording before the stop threshold', () => {
    const c = classify(booking({ job: null, scheduledStart: at(-10) }));
    expect(c?.type).toBe('stale_pending');
    expect(c?.title).toMatch(/Reached its start time/);
  });

  it('flags unmatched with unmatched_since, high when the start is within an hour', () => {
    expect(classify(booking({ job: null, unmatchedSince: at(-5), scheduledStart: at(30) }))?.severity).toBe('high');
    expect(classify(booking({ job: null, unmatchedSince: at(-5), scheduledStart: at(300) }))?.severity).toBe('medium');
  });

  it('gives a new booking a grace period before flagging it', () => {
    expect(classify(booking({ job: null, createdAt: at(-2) }))).toBeNull();
    expect(classify(booking({ job: null, createdAt: at(-30) }))?.type).toBe('unmatched');
  });

  it('flags an expired offer only after the grace period', () => {
    const j = (m: number) => job({ state: 'assigned', offerExpiresAt: at(m) });
    expect(classify(booking({ job: j(-1) }))).toBeNull();
    expect(classify(booking({ job: j(5) }))).toBeNull();
    expect(classify(booking({ job: j(-5) }))?.type).toBe('overdue_offer');
  });

  it('calls a late accepted job a possible no-show, not a confirmed one', () => {
    expect(classify(booking({ scheduledStart: at(-20), job: job({ state: 'accepted' }) }))).toBeNull();
    const c = classify(booking({ scheduledStart: at(-45), job: job({ state: 'on_the_way' }) }));
    expect(c?.type).toBe('possible_no_show');
    expect(c?.reason).toMatch(/not a confirmed no-show/);
  });

  it('does not flag an arrived job as a no-show', () => {
    expect(classify(booking({ scheduledStart: at(-300), job: job({ state: 'arrived' }) }))).toBeNull();
  });

  it('flags in-progress and quote-pending jobs only after 24h without activity past the end', () => {
    const idle = (state: string, hours: number) =>
      booking({
        scheduledStart: at(-60 * (hours + 3)),
        scheduledEnd: at(-60 * (hours + 2)),
        job: job({ state, updatedAt: at(-60 * hours) }),
      });
    expect(classify(idle('in_progress', 10))).toBeNull();
    expect(classify(idle('in_progress', 30))?.type).toBe('stuck_in_progress');
    expect(classify(idle('quote_pending', 30))?.type).toBe('stale_quote');
  });

  it('counts a recent message or event as activity, and a future scheduled end as not idle', () => {
    const base = { scheduledStart: at(-60 * 40), scheduledEnd: at(-60 * 38) };
    expect(classify(booking({ ...base, job: job({ state: 'in_progress', updatedAt: at(-60 * 30), lastMessageAt: at(-60) }) }))).toBeNull();
    expect(classify(booking({ ...base, job: job({ state: 'in_progress', updatedAt: at(-60 * 30), lastEventAt: at(-120) }) }))).toBeNull();
    expect(classify(booking({ scheduledStart: at(-60 * 40), scheduledEnd: at(60 * 24), job: job({ state: 'in_progress', updatedAt: at(-60 * 30) }) }))).toBeNull();
  });

  it('does not flag healthy bookings', () => {
    expect(classify(booking())).toBeNull();
    expect(classify(booking({ status: 'cancelled', job: job({ state: 'cancelled' }) }))).toBeNull();
  });

  it('respects overridden thresholds', () => {
    const b = booking({ scheduledStart: at(-20), job: job({ state: 'accepted' }) });
    expect(classifyBooking(b, NOW, { ...T, noShowMinutes: 10 })?.type).toBe('possible_no_show');
  });
});

describe('classifyVerification and sortCases', () => {
  it('ranks documents_submitted above under_review', () => {
    expect(classifyVerification({ userId: 'u', displayName: 'X', status: 'documents_submitted', createdAt: at(-1) }).severity).toBe('high');
    expect(classifyVerification({ userId: 'u', displayName: 'X', status: 'under_review', createdAt: at(-1) }).severity).toBe('medium');
  });

  it('sorts by severity, then oldest first', () => {
    const mk = (id: string, severity: 'high' | 'medium', since: string) => ({ ...classifyVerification({ userId: id, displayName: id, status: 'under_review', createdAt: since }), severity });
    const sorted = sortCases([mk('c', 'medium', at(-10)), mk('b', 'high', at(-5)), mk('a', 'high', at(-50))]);
    expect(sorted.map((c) => c.subjectId)).toEqual(['a', 'b', 'c']);
  });

  it('formats durations', () => {
    expect(formatDuration(5 * 60_000)).toBe('5 min');
    expect(formatDuration(190 * 60_000)).toBe('3 h 10 min');
    expect(formatDuration(52 * 3_600_000)).toBe('2 d 4 h');
  });
});

describe('resolveOperationsThresholds', () => {
  it('uses defaults, treats empty values as unset, and applies overrides', () => {
    expect(resolveOperationsThresholds({})).toEqual(T);
    expect(resolveOperationsThresholds({ OPS_NO_SHOW_MINUTES: '' })).toEqual(T);
    expect(resolveOperationsThresholds({ OPS_NO_SHOW_MINUTES: '45' }).noShowMinutes).toBe(45);
  });
  it.each(['abc', '0', '-5', 'Infinity'])('rejects malformed value %s', (v) => {
    expect(() => resolveOperationsThresholds({ OPS_STALE_ACTIVITY_HOURS: v })).toThrow();
  });
});

describe('getOperationsQueue', () => {
  beforeEach(() => {
    db.admin = true;
    db.tables = {};
  });

  it('refuses a non-admin before reading anything', async () => {
    db.admin = false;
    const r = await getOperationsQueue(NOW);
    expect(isAdminFailure(r) && r.code).toBe('FORBIDDEN');
  });

  it('returns an empty queue only when every query succeeded', async () => {
    const r = await getOperationsQueue(NOW);
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.cases).toEqual([]);
  });

  it.each(['jobs', 'bookings', 'professional_profiles'])('fails loudly when the %s query errors', async (table) => {
    db.tables[table] = { data: null, error: { message: 'boom' } };
    const r = await getOperationsQueue(NOW);
    expect(isAdminFailure(r) && r.code).toBe('FAILED');
    expect(r.ok).toBe(false);
  });

  it('fails when a row has an unexpected shape instead of dropping it', async () => {
    db.tables.jobs = { data: [{ id: 1 }], error: null };
    expect((await getOperationsQueue(NOW)).ok).toBe(false);
  });

  it('classifies loaded rows', async () => {
    db.tables.bookings = {
      data: [
        {
          id: 'c779c0d4-ed43-43f5-b4f3-d86e298bf6e9',
          booking_reference: 'BK-STALE',
          booking_status: 'pending',
          scheduled_start: at(-60 * 24),
          scheduled_end: null,
          unmatched_since: null,
          created_at: at(-60 * 48),
          service: { name: 'Plumbing' },
          property: { address: { city: 'Pune' } },
        },
      ],
      error: null,
    };
    db.tables.professional_profiles = {
      data: [{ user_id: 'u', display_name: 'Pro', verification_status: 'documents_submitted', created_at: at(-100) }],
      error: null,
    };
    const r = await getOperationsQueue(NOW);
    expect(r.ok && r.data.cases.map((c) => c.type).sort()).toEqual(['stale_pending', 'verification']);
  });
});

describe('getOperationsCaseDetail', () => {
  beforeEach(() => {
    db.admin = true;
    db.tables = {};
  });

  it.each([{ type: 'nope', id: 'x' }, { type: 'unmatched', id: 'not-a-uuid' }, null, undefined])('rejects invalid input %j', async (input) => {
    const r = await getOperationsCaseDetail(input);
    expect(isAdminFailure(r) && r.code).toBe('INVALID_INPUT');
  });

  it('refuses a non-admin', async () => {
    db.admin = false;
    const r = await getOperationsCaseDetail({ type: 'unmatched', id: '22222222-2222-4222-8222-222222222222' });
    expect(isAdminFailure(r) && r.code).toBe('FORBIDDEN');
  });

  it('reports a query failure rather than an empty case', async () => {
    db.tables.bookings = { data: null, error: { message: 'boom' } };
    const r = await getOperationsCaseDetail({ type: 'unmatched', id: '22222222-2222-4222-8222-222222222222' });
    expect(isAdminFailure(r) && r.code).toBe('FAILED');
  });
});

describe('unsafe admin actions are gone (static)', () => {
  const root = path.resolve(__dirname, '../..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : [],
    );
  const sources = walk('src').filter((f) => !f.includes('__tests__'));

  it.each(['reassignJob', 'resolveQuoteDispute', 'fetchNeedsAttention', 'getAttentionQueue'])('%s is not defined or referenced anywhere', (name) => {
    for (const f of sources) expect(read(f), f).not.toMatch(new RegExp(`\\b${name}\\b`));
  });

  it('the admin actions module exports no reassignment or dispute endpoint', () => {
    const src = read('src/app/admin/actions.ts');
    expect(src).not.toMatch(/export async function (reassign|resolve)/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/current_state/);
  });

  it('no component offers Reassign or Resolve dispute', () => {
    for (const f of sources.filter((s) => s.startsWith('src/components/admin') || s.startsWith('src/app/admin'))) {
      expect(read(f), f).not.toMatch(/>\s*Reassign|Reassign\b.*<\/button>|Resolve dispute/i);
    }
  });

  it.each(['src/lib/services/admin-operations.ts', 'src/lib/admin/operations.ts', 'src/components/admin/OperationsQueue.tsx', 'src/app/admin/operations/page.tsx'])(
    '%s has no any, ts-ignore or direct state writes',
    (f) => {
      const src = read(f);
      expect(src).not.toMatch(/\bas any\b|: any\b|@ts-ignore|@ts-expect-error/);
      expect(src).not.toMatch(/\.(update|insert|delete|upsert)\(|\.rpc\(/);
    },
  );
});

describe('A4 attention cases', () => {
  it('a suspended professional holding a running job is high priority and links to the booking', () => {
    const c = classifySuspendedActiveJob({
      jobId: 'j1', bookingId: 'b1', reference: 'BK-1', state: 'in_progress', professionalName: 'Asha',
      scheduledStart: null, serviceName: 'Plumbing', city: null, updatedAt: '2026-11-01T00:00:00Z',
    });
    expect(c).toMatchObject({ type: 'suspended_active_job', severity: 'high', bookingId: 'b1', key: 'suspended_active_job:j1' });
    expect(c.reason).toMatch(/does not cancel/);
  });

  it('assignment drift keeps its kind and is keyed by booking', () => {
    const c = classifyAssignmentDrift({
      bookingId: 'b2', jobId: null, driftKind: 'job_cancelled_booking_not', bookingStatus: 'confirmed', jobState: 'cancelled',
      reference: 'BK-2', scheduledStart: null, updatedAt: '2026-11-01T00:00:00Z',
    });
    expect(c).toMatchObject({ type: 'assignment_drift', key: 'assignment_drift:b2' });
    expect(c.reason).toContain('job_cancelled_booking_not');
  });
});
