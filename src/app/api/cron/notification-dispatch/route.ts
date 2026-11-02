import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { dispatchPending } from '@/lib/notifications/dispatch';

export const dynamic = 'force-dynamic';

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Sends queued customer notifications. Does nothing but report unless
 * NOTIFICATION_DISPATCH_ENABLED=true, so deploying it never sends a message by itself.
 * Call with `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const summary = await dispatchPending({ live: process.env.NOTIFICATION_DISPATCH_ENABLED === 'true' });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error('notification-dispatch:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 });
  }
}
