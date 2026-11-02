/**
 * Customer directory and account reads for the admin console. Not a server-action module: the admin
 * role is checked before the service-role client exists. A failed read is an error, never an empty list.
 */

import { z } from 'zod';
import { createTypedAdminClient } from '@/lib/admin/client';
import { requireAdmin } from '@/lib/admin/guard';
import { adminFailure, type AdminResult } from '@/lib/admin/result';
import { CUSTOMER_PAGE_SIZE, customerDirectoryInput } from '@/lib/admin/customer-directory';

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  joinedAt: string;
  properties: number;
  bookings: number;
}

export interface CustomerDirectory {
  rows: CustomerRow[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listCustomers(raw: unknown): Promise<AdminResult<CustomerDirectory>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);
  const input = customerDirectoryInput.parse(raw ?? {});

  const a = await createTypedAdminClient();
  let q = a
    .from('profiles')
    .select('id, full_name, email, phone, created_at', { count: 'exact' })
    .eq('role', 'customer');
  if (input.q) {
    const t = input.q.replace(/[%_]/g, '');
    q = q.or(`full_name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%`);
  }
  const from = (input.page - 1) * CUSTOMER_PAGE_SIZE;
  const res = await q.order('created_at', { ascending: false }).range(from, from + CUSTOMER_PAGE_SIZE - 1);
  if (res.error) {
    console.error('listCustomers:', res.error.message);
    return adminFailure('FAILED', 'Could not load customers.');
  }
  const profiles = res.data ?? [];
  const ids = profiles.map((p) => p.id);
  const props = new Map<string, number>();
  const books = new Map<string, number>();
  if (ids.length) {
    const [p, b] = await Promise.all([
      a.from('properties').select('owner_customer_id').in('owner_customer_id', ids),
      a.from('bookings').select('customer_id').in('customer_id', ids),
    ]);
    if (p.error || b.error) {
      console.error('listCustomers counts:', p.error?.message ?? b.error?.message);
      return adminFailure('FAILED', 'Could not load customers.');
    }
    for (const r of p.data ?? []) props.set(r.owner_customer_id, (props.get(r.owner_customer_id) ?? 0) + 1);
    for (const r of b.data ?? []) books.set(r.customer_id, (books.get(r.customer_id) ?? 0) + 1);
  }
  const total = res.count ?? 0;
  return {
    ok: true,
    data: {
      rows: profiles.map((p) => ({
        id: p.id,
        name: p.full_name ?? 'Unnamed customer',
        email: p.email,
        phone: p.phone,
        joinedAt: p.created_at,
        properties: props.get(p.id) ?? 0,
        bookings: books.get(p.id) ?? 0,
      })),
      total,
      page: input.page,
      pageCount: Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE)),
    },
  };
}

const one = <T extends z.ZodType>(s: T) => z.union([s, z.array(s)]).nullable();
const first = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const bookingShape = z.object({
  id: z.string(),
  booking_reference: z.string(),
  booking_status: z.string(),
  scheduled_start: z.string(),
  quoted_or_base_amount: z.number().nullable(),
  service: one(z.object({ name: z.string() })),
  jobs: one(z.object({ id: z.string(), current_state: z.string() })),
});

export interface CustomerAccount {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  joinedAt: string;
  properties: { id: string; name: string; type: string }[];
  bookings: {
    bookingId: string;
    reference: string;
    service: string;
    bookingStatus: string;
    jobId: string | null;
    jobState: string | null;
    scheduledStart: string;
    amount: number | null;
  }[];
  bookingCount: number;
  exceptions: { id: string; jobId: string; kind: string; status: string; reportedAt: string }[];
  payments: { id: string; bookingId: string | null; amount: number; currency: string; status: string; reference: string | null; at: string }[];
  adminActivity: { id: string; at: string; action: string }[];
}

export async function getCustomerAccount(userId: string): Promise<AdminResult<CustomerAccount | null>> {
  const guard = await requireAdmin();
  if ('error' in guard) return adminFailure('FORBIDDEN', guard.error);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: true, data: null };

  const a = await createTypedAdminClient();
  const prof = await a
    .from('profiles')
    .select('id, full_name, email, phone, created_at, role')
    .eq('id', userId)
    .maybeSingle();
  if (prof.error) {
    console.error('getCustomerAccount profile:', prof.error.message);
    return adminFailure('FAILED', 'Could not load this customer.');
  }
  if (!prof.data || prof.data.role !== 'customer') return { ok: true, data: null };

  const [props, books, audit, pay] = await Promise.all([
    a.from('properties').select('id, name, property_type').eq('owner_customer_id', userId).order('created_at', { ascending: false }).limit(50),
    a
      .from('bookings')
      .select(
        'id, booking_reference, booking_status, scheduled_start, quoted_or_base_amount, service:services(name), jobs:jobs!jobs_booking_id_fkey(id, current_state)',
        { count: 'exact' },
      )
      .eq('customer_id', userId)
      .order('scheduled_start', { ascending: false })
      .limit(25),
    a.from('audit_logs').select('id, action, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    a.from('payments').select('id, booking_id, amount, currency, status, provider_reference, created_at').eq('customer_id', userId).order('created_at', { ascending: false }).limit(20),
  ]);
  if (props.error || books.error || audit.error || pay.error) {
    console.error('getCustomerAccount:', props.error?.message ?? books.error?.message ?? audit.error?.message ?? pay.error?.message);
    return adminFailure('FAILED', 'Could not load this customer.');
  }
  const parsed = z.array(bookingShape).safeParse(books.data ?? []);
  if (!parsed.success) {
    console.error('getCustomerAccount shape:', parsed.error.issues[0]?.message);
    return adminFailure('FAILED', 'Could not load this customer.');
  }
  const bookings = parsed.data.map((b) => {
    const job = first(b.jobs);
    return {
      bookingId: b.id,
      reference: b.booking_reference,
      service: first(b.service)?.name ?? '—',
      bookingStatus: b.booking_status,
      jobId: job?.id ?? null,
      jobState: job?.current_state ?? null,
      scheduledStart: b.scheduled_start,
      amount: b.quoted_or_base_amount,
    };
  });

  const jobIds = bookings.map((b) => b.jobId).filter((v): v is string => !!v);
  let exceptions: CustomerAccount['exceptions'] = [];
  if (jobIds.length) {
    const ex = await a.from('job_exceptions').select('id, job_id, kind, status, reported_at').in('job_id', jobIds).order('reported_at', { ascending: false }).limit(20);
    if (ex.error) {
      console.error('getCustomerAccount exceptions:', ex.error.message);
      return adminFailure('FAILED', 'Could not load this customer.');
    }
    exceptions = (ex.data ?? []).map((e) => ({ id: e.id, jobId: e.job_id, kind: e.kind, status: e.status, reportedAt: e.reported_at }));
  }

  return {
    ok: true,
    data: {
      id: prof.data.id,
      name: prof.data.full_name ?? 'Unnamed customer',
      email: prof.data.email,
      phone: prof.data.phone,
      joinedAt: prof.data.created_at,
      properties: (props.data ?? []).map((p) => ({ id: p.id, name: p.name, type: p.property_type })),
      bookings,
      bookingCount: books.count ?? bookings.length,
      exceptions,
      payments: (pay.data ?? []).map((r) => ({ id: r.id, bookingId: r.booking_id, amount: Number(r.amount), currency: r.currency, status: r.status, reference: r.provider_reference, at: r.created_at })),
      adminActivity: (audit.data ?? []).map((r) => ({ id: r.id, at: r.created_at, action: r.action })),
    },
  };
}
