/**
 * Read-only payment visibility for the admin console. Not a server-action module: the admin role is
 * checked before the service-role client exists. No refund, payout or payment action lives here;
 * refund execution and payouts are deferred by the owner.
 */

import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';
import { PAYMENT_PAGE_SIZE, paymentDirectoryInput } from '@/lib/admin/finance-directory';

export interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentType: string;
  provider: string;
  providerReference: string;
  createdAt: string | null;
  paidAt: string | null;
  bookingId: string | null;
  customerId: string;
  customerName: string | null;
}

export interface PaymentsPage {
  rows: PaymentRow[];
  total: number;
  page: number;
  pageCount: number;
  /** Count per status across all payments; null when that count could not be read. */
  statusCounts: Record<string, number | null>;
}

const STATUS_KEYS = ['pending', 'paid', 'failed', 'refunded'] as const;

export async function listPayments(raw: unknown): Promise<AdminResult<PaymentsPage>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);
  const input = paymentDirectoryInput.parse(raw ?? {});

  const a = await createTypedAdminClient();
  let q = a
    .from('payments')
    .select('id, amount, currency, status, payment_type, provider, provider_reference, created_at, paid_at, booking_id, customer_id', { count: 'exact' });
  if (input.status !== 'all') q = q.eq('status', input.status);
  if (input.from) q = q.gte('created_at', `${input.from}T00:00:00+05:30`);
  if (input.to) q = q.lt('created_at', new Date(new Date(`${input.to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString());
  const from = (input.page - 1) * PAYMENT_PAGE_SIZE;

  const [res, ...counts] = await Promise.all([
    q.order('created_at', { ascending: false }).range(from, from + PAYMENT_PAGE_SIZE - 1),
    ...STATUS_KEYS.map((s) => a.from('payments').select('id', { count: 'exact', head: true }).eq('status', s)),
  ]);
  if (res.error) {
    console.error('listPayments:', res.error.message);
    return adminFailure('FAILED', 'Could not load payments.');
  }
  const data = res.data ?? [];
  const ids = [...new Set(data.map((r) => r.customer_id))];
  const names = new Map<string, string>();
  if (ids.length) {
    const p = await a.from('profiles').select('id, full_name, email').in('id', ids);
    if (!p.error) for (const r of p.data ?? []) names.set(r.id, r.full_name || r.email || r.id);
  }
  const statusCounts: Record<string, number | null> = {};
  STATUS_KEYS.forEach((s, i) => { statusCounts[s] = counts[i].error ? null : (counts[i].count ?? null); });

  const total = res.count ?? 0;
  return {
    ok: true,
    data: {
      rows: data.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        currency: r.currency,
        status: r.status,
        paymentType: r.payment_type,
        provider: r.provider,
        providerReference: r.provider_reference,
        createdAt: r.created_at,
        paidAt: r.paid_at,
        bookingId: r.booking_id,
        customerId: r.customer_id,
        customerName: names.get(r.customer_id) ?? null,
      })),
      total,
      page: input.page,
      pageCount: Math.max(1, Math.ceil(total / PAYMENT_PAGE_SIZE)),
      statusCounts,
    },
  };
}
