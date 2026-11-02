import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const dispatchMock = vi.fn();
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchPending: (...a: unknown[]) => dispatchMock(...a) }));

import { dispatchPending, type DispatchDeps, type QueuedRow } from '@/lib/notifications/dispatch';
import { isTransientError, retryDelaySeconds } from '@/lib/notifications/classify';

// The route test needs the mocked dispatcher; the dispatcher tests need the real one.
const real = await vi.importActual<typeof import('@/lib/notifications/dispatch')>('@/lib/notifications/dispatch');
const dispatch = real.dispatchPending;
void dispatchPending;

describe('route guard', () => {
  const ENV = { ...process.env };
  beforeEach(() => { dispatchMock.mockReset(); dispatchMock.mockResolvedValue({ live: false }); });
  afterEach(() => { process.env = { ...ENV }; });
  const call = async (headers: Record<string, string> = {}) => {
    const { POST } = await import('@/app/api/cron/notification-dispatch/route');
    return POST(new NextRequest('http://localhost/api/cron/notification-dispatch', { method: 'POST', headers }));
  };

  it('fails closed when CRON_SECRET is not set, even with a matching-looking header', async () => {
    delete process.env.CRON_SECRET;
    expect((await call({ authorization: 'Bearer undefined' })).status).toBe(401);
    expect((await call({ authorization: 'Bearer ' })).status).toBe(401);
    expect(dispatchMock).not.toHaveBeenCalled();
  });
  it('rejects a missing or wrong secret', async () => {
    process.env.CRON_SECRET = 's3cret';
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: 'Bearer nope' })).status).toBe(401);
    expect((await call({ authorization: 's3cret' })).status).toBe(401);
    expect(dispatchMock).not.toHaveBeenCalled();
  });
  it('is dry-run unless the flag is exactly "true"', async () => {
    process.env.CRON_SECRET = 's3cret';
    for (const v of [undefined, 'false', '1', 'TRUE']) {
      if (v === undefined) delete process.env.NOTIFICATION_DISPATCH_ENABLED; else process.env.NOTIFICATION_DISPATCH_ENABLED = v;
      await call({ authorization: 'Bearer s3cret' });
      expect(dispatchMock).toHaveBeenLastCalledWith({ live: false });
    }
    process.env.NOTIFICATION_DISPATCH_ENABLED = 'true';
    await call({ authorization: 'Bearer s3cret' });
    expect(dispatchMock).toHaveBeenLastCalledWith({ live: true });
  });
  it('does not leak error details when dispatch throws', async () => {
    process.env.CRON_SECRET = 's3cret';
    dispatchMock.mockRejectedValue(new Error('db password xyz'));
    const r = await call({ authorization: 'Bearer s3cret' });
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('xyz');
  });
});

// In-memory queue that mimics claim_notifications / complete_notification.
interface Row extends QueuedRow { status: string; claimedBy?: string; error?: string; providerId?: string; channel?: string; retryAfter?: number }
function harness(rows: Row[], sendImpl: DispatchDeps['send'], opts: { now?: number } = {}) {
  const now = opts.now ?? Date.now();
  const calls = { claim: 0, send: 0, complete: 0, peek: 0 };
  const deps: DispatchDeps = {
    async peek() { calls.peek++; return rows.filter((r) => r.status === 'pending').map((r) => ({ created_at: r.created_at! })); },
    async claim(worker, o) {
      calls.claim++;
      const out: Row[] = [];
      for (const r of rows) {
        if (out.length >= o.limit) break;
        if (r.status !== 'pending') continue;
        if (now - new Date(r.created_at!).getTime() > o.maxAgeMinutes * 60_000) { r.status = 'expired'; continue; }
        r.status = 'processing'; r.claimedBy = worker; r.attempts += 1;
        out.push({ ...r });
      }
      return out;
    },
    async complete(a) {
      calls.complete++;
      const r = rows.find((x) => x.id === a.id)!;
      const owner = r.claimedBy === a.worker;
      if (!owner && !(a.outcome === 'sent' && r.status === 'failed')) return false;
      r.status = a.outcome === 'retry' ? 'pending' : a.outcome;
      r.error = a.error; r.providerId = a.providerId; r.channel = a.channel; r.retryAfter = a.retryAfterSeconds;
      return true;
    },
    async loadData() { return { customerName: '' } as never; },
    async send(p) { calls.send++; return sendImpl(p); },
  };
  return { deps, calls };
}
const row = (id: string, ageMin = 1, attempts = 0): Row => ({ id, customer_id: 'c', job_id: 'j', notification_type: 'job_accepted', attempts, status: 'pending', created_at: new Date(Date.now() - ageMin * 60_000).toISOString() });
const ok = async () => ({ success: true, channel: 'whatsapp', messageId: 'm1' }) as never;

describe('dispatchPending', () => {
  it('dry-run neither claims, sends nor completes, and reports stale rows', async () => {
    const rows = [row('a'), row('b', 600)];
    const h = harness(rows, ok);
    const s = await dispatch({ live: false }, h.deps);
    expect(s).toMatchObject({ live: false, considered: 2, due: 1, stale: 1, sent: 0 });
    expect(h.calls).toEqual({ claim: 0, send: 0, complete: 0, peek: 1 });
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
  });
  it('empty queue does nothing', async () => {
    const h = harness([], ok);
    expect(await dispatch({ live: true }, h.deps)).toMatchObject({ claimed: 0, sent: 0 });
    expect(h.calls.send).toBe(0);
  });
  it('never sends stale rows (the 61 historical ones)', async () => {
    const rows = Array.from({ length: 61 }, (_, i) => row(`old${i}`, 60 * 24 * 30));
    const h = harness(rows, ok);
    const s = await dispatch({ live: true }, h.deps);
    expect(s.claimed).toBe(0);
    expect(h.calls.send).toBe(0);
    expect(rows.every((r) => r.status === 'expired')).toBe(true);
  });
  it('sends a claimed row once and records provider id and channel', async () => {
    const rows = [row('a')];
    const h = harness(rows, ok);
    const s = await dispatch({ live: true }, h.deps);
    expect(s).toMatchObject({ claimed: 1, sent: 1, failed: 0, lostClaims: 0 });
    expect(rows[0]).toMatchObject({ status: 'sent', providerId: 'm1', channel: 'whatsapp' });
  });
  it('is idempotent: a second run does not resend', async () => {
    const rows = [row('a')];
    const h = harness(rows, ok);
    await dispatch({ live: true }, h.deps);
    await dispatch({ live: true }, h.deps);
    expect(h.calls.send).toBe(1);
  });
  it('concurrent runs get disjoint rows', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`r${i}`));
    const sent: string[] = [];
    const h = harness(rows, async (p) => { sent.push(p.jobId ?? ''); return ok(); });
    const [a, b] = await Promise.all([dispatch({ live: true, limit: 6 }, h.deps), dispatch({ live: true, limit: 6 }, h.deps)]);
    expect(a.claimed + b.claimed).toBe(10);
    expect(h.calls.send).toBe(10);
  });
  it('temporary failure goes back to the queue with backoff', async () => {
    const rows = [row('a')];
    const h = harness(rows, async () => ({ success: false, error: 'HTTP 503', retryable: true }) as never);
    const s = await dispatch({ live: true }, h.deps);
    expect(s).toMatchObject({ retried: 1, failed: 0 });
    expect(rows[0]).toMatchObject({ status: 'pending', retryAfter: 60 });
  });
  it('permanent failure is terminal', async () => {
    const rows = [row('a')];
    const h = harness(rows, async () => ({ success: false, error: 'no phone number on file', retryable: false }) as never);
    const s = await dispatch({ live: true }, h.deps);
    expect(s).toMatchObject({ retried: 0, failed: 1 });
    expect(rows[0].status).toBe('failed');
  });
  it('stops retrying at the attempt limit', async () => {
    const rows = [row('a', 1, 4)];
    const h = harness(rows, async () => ({ success: false, error: 'HTTP 503', retryable: true }) as never);
    const s = await dispatch({ live: true, maxAttempts: 5 }, h.deps);
    expect(s).toMatchObject({ retried: 0, failed: 1 });
    expect(rows[0].status).toBe('failed');
  });
  it('a thrown error after the call started is terminal, not resent', async () => {
    const rows = [row('a')];
    const h = harness(rows, async () => { throw new Error('socket hang up'); });
    await dispatch({ live: true }, h.deps);
    await dispatch({ live: true }, h.deps);
    expect(h.calls.send).toBe(1);
    expect(rows[0]).toMatchObject({ status: 'failed', error: 'socket hang up' });
  });
  it('crash after provider acceptance: the abandoned claim is not resent', async () => {
    const rows = [row('a')];
    const h = harness(rows, ok);
    // Worker claims, sends, then dies before complete(): row stays processing under a dead worker.
    await h.deps.claim('dead', { limit: 5, maxAgeMinutes: 360, leaseMinutes: 5, maxAttempts: 5 });
    await h.deps.send({} as never);
    expect(rows[0].status).toBe('processing');
    const s = await dispatch({ live: true }, h.deps);
    expect(s.claimed).toBe(0);
    expect(h.calls.send).toBe(1);
  });
  it('a late worker can correct an abandoned-failed row to sent, but nothing else', async () => {
    const rows = [row('a')];
    const h = harness(rows, ok);
    await h.deps.claim('slow', { limit: 5, maxAgeMinutes: 360, leaseMinutes: 5, maxAttempts: 5 });
    rows[0].status = 'failed'; rows[0].claimedBy = undefined; // lease expiry marked it failed
    expect(await h.deps.complete({ id: 'a', worker: 'slow', outcome: 'sent' })).toBe(true);
    expect(await h.deps.complete({ id: 'a', worker: 'other', outcome: 'retry' })).toBe(false);
  });
  it('counts a lost claim when complete is refused', async () => {
    const rows = [row('a')];
    const h = harness(rows, ok);
    h.deps.complete = async () => false;
    expect((await dispatch({ live: true }, h.deps)).lostClaims).toBe(1);
  });
});

describe('classification', () => {
  it('treats network and 5xx/429 as transient, 4xx and missing contact as permanent', () => {
    for (const e of ['HTTP 503', 'HTTP 429', 'request timed out', 'fetch failed', 'ECONNRESET']) expect(isTransientError(e)).toBe(true);
    for (const e of ['HTTP 400 bad request', 'no phone number on file', 'invalid template']) expect(isTransientError(e)).toBe(false);
  });
  it('backs off exponentially, capped at an hour', () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([60, 120, 240, 480]);
    expect(retryDelaySeconds(30)).toBe(3600);
  });
});

describe('static safety', () => {
  const dispatchSrc = read('src/lib/notifications/dispatch.ts');
  const route = read('src/app/api/cron/notification-dispatch/route.ts');
  it('route checks the secret before dispatching and gates live on the flag', () => {
    expect(route.indexOf('authorised(request)')).toBeLessThan(route.indexOf('await dispatchPending'));
    expect(route).toMatch(/NOTIFICATION_DISPATCH_ENABLED === 'true'/);
  });
  it('dry-run returns before claim/send and the dispatcher does not update rows directly', () => {
    const i = dispatchSrc.indexOf('if (!opts.live)');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(dispatchSrc.indexOf('deps.claim(worker'));
    expect(dispatchSrc).not.toMatch(/\.(update|insert|delete)\(/);
  });
  it('senders are not server actions and only server code imports them', () => {
    for (const f of ['send', 'channels/whatsapp', 'channels/sms', 'channels/email']) {
      expect(read(`src/lib/notifications/${f}.ts`)).not.toMatch(/^['"]use server['"]/m);
    }
    expect(dispatchSrc).not.toMatch(/^['"]use client['"]/m);
  });
});
