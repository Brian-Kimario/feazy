import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: null as string | null,
  rpc: { data: null as unknown, error: null as { code?: string; message: string } | null },
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}));
const audit = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
const revalidated = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => void revalidated.paths.push(p) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: session.role ? { role: session.role } : null,
            error: session.role ? null : { message: 'none' },
          }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      session.calls.push({ fn, args });
      return session.rpc;
    },
  }),
}));
vi.mock('@/lib/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/audit')>('@/lib/audit');
  return {
    ...actual,
    logAuditEvent: async (entry: Record<string, unknown>) => {
      audit.rows.push(entry);
      return { success: true };
    },
  };
});

import { reviewVerificationDocument } from '@/lib/services/verification';
import { reviewVerificationDocumentInput } from '@/validators/admin';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const DOC = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  session.user = { id: ADMIN };
  session.role = 'admin';
  session.rpc = { data: { document_type: 'id', to_status: 'accepted' }, error: null };
  session.calls = [];
  audit.rows = [];
  revalidated.paths = [];
});

describe('reviewVerificationDocumentInput', () => {
  it('accepts an accept without a note', () => {
    expect(reviewVerificationDocumentInput.safeParse({ documentId: DOC, decision: 'accepted' }).success).toBe(true);
  });
  it('requires a note of at least 5 characters to reject', () => {
    expect(reviewVerificationDocumentInput.safeParse({ documentId: DOC, decision: 'rejected' }).success).toBe(false);
    expect(reviewVerificationDocumentInput.safeParse({ documentId: DOC, decision: 'rejected', note: ' abc ' }).success).toBe(false);
    expect(reviewVerificationDocumentInput.safeParse({ documentId: DOC, decision: 'rejected', note: 'blurry scan' }).success).toBe(true);
  });
  it('refuses unknown decisions, bad ids and long notes', () => {
    expect(reviewVerificationDocumentInput.safeParse({ documentId: DOC, decision: 'pending' }).success).toBe(false);
    expect(reviewVerificationDocumentInput.safeParse({ documentId: 'x', decision: 'accepted' }).success).toBe(false);
    expect(reviewVerificationDocumentInput.safeParse({ documentId: DOC, decision: 'accepted', note: 'a'.repeat(501) }).success).toBe(false);
  });
});

describe('reviewVerificationDocument', () => {
  it('calls the RPC, audits and revalidates on success', async () => {
    const r = await reviewVerificationDocument({ documentId: DOC, decision: 'accepted' });
    expect(r.ok).toBe(true);
    expect(session.calls).toHaveLength(1);
    expect(session.calls[0].fn).toBe('admin_review_verification_document');
    expect(session.calls[0].args).toMatchObject({ p_document_id: DOC, p_decision: 'accepted' });
    expect(revalidated.paths).toContain('/admin/professionals');
    expect(audit.rows.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses a non-admin before touching the database', async () => {
    session.role = 'customer';
    const r = await reviewVerificationDocument({ documentId: DOC, decision: 'accepted' });
    expect(r.ok).toBe(false);
    expect(session.calls).toHaveLength(0);
  });

  it('refuses invalid input without calling the RPC', async () => {
    const r = await reviewVerificationDocument({ documentId: DOC, decision: 'rejected', note: 'no' });
    expect(r.ok).toBe(false);
    expect(session.calls).toHaveLength(0);
  });

  it.each([
    ['55000', 'Stale request: document is already accepted'],
    ['23514', 'The document file does not exist in storage'],
    ['P0002', 'Document not found'],
  ])('passes the actionable %s message through and revalidates nothing', async (code, message) => {
    session.rpc = { data: null, error: { code, message } };
    const r = await reviewVerificationDocument({ documentId: DOC, decision: 'accepted' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(message);
    expect(revalidated.paths).toHaveLength(0);
  });

  it('hides unexpected database errors', async () => {
    session.rpc = { data: null, error: { code: 'XX000', message: 'secret internals' } };
    const r = await reviewVerificationDocument({ documentId: DOC, decision: 'accepted' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('The document could not be reviewed');
  });

  it('never reports success for a malformed result', async () => {
    session.rpc = { data: { to_status: 'pending' }, error: null };
    const r = await reviewVerificationDocument({ documentId: DOC, decision: 'accepted' });
    expect(r.ok).toBe(false);
  });
});

describe('queue wiring', () => {
  const ui = fs.readFileSync(path.join(process.cwd(), 'src/components/admin/VerificationQueue.tsx'), 'utf8');
  it('gates Approve on an accepted id document and Accept on inspection', () => {
    expect(ui).toContain('disabled={isPending || !idAccepted}');
    expect(ui).toContain('inspected.has(doc.id)');
    expect(ui).toContain('reviewVerificationDocument(');
  });
});
