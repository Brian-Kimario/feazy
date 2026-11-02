import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  approveProfessionalInput,
  rejectProfessionalInput,
  suspendProfessionalInput,
  reactivateProfessionalInput,
} from '@/validators/admin';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const ID = '12307078-87f0-4cd2-90b4-e88426a1011b';

describe('verification input schemas', () => {
  it('requires the status the admin saw', () => {
    expect(approveProfessionalInput.safeParse({ professionalId: ID }).success).toBe(false);
    expect(approveProfessionalInput.safeParse({ professionalId: ID, expectedStatus: 'verified' }).success).toBe(false);
    expect(approveProfessionalInput.safeParse({ professionalId: ID, expectedStatus: 'documents_submitted' }).success).toBe(true);
  });
  it('requires a meaningful reason to reject, suspend and reactivate', () => {
    expect(rejectProfessionalInput.safeParse({ professionalId: ID, expectedStatus: 'pending', reason: 'no' }).success).toBe(false);
    expect(rejectProfessionalInput.safeParse({ professionalId: ID, expectedStatus: 'pending', reason: 'ID is unreadable' }).success).toBe(true);
    expect(suspendProfessionalInput.safeParse({ professionalId: ID, reason: '   ' }).success).toBe(false);
    expect(reactivateProfessionalInput.safeParse({ professionalId: ID, reason: 'Issue resolved' }).success).toBe(true);
  });
  it('rejects a caller-supplied non-uuid id', () => {
    expect(suspendProfessionalInput.safeParse({ professionalId: 'x', reason: 'valid reason' }).success).toBe(false);
  });
});

describe('verification call sites', () => {
  const files = [
    'src/lib/services/verification.ts',
    'src/lib/services/admin.ts',
    'src/app/professional/onboarding/actions.ts',
    'src/app/admin/actions.ts',
  ];
  it.each(files)('%s never calls the removed RPC or passes an admin id', (f) => {
    const src = read(f);
    expect(src).not.toContain('transition_professional_verification_status');
    expect(src).not.toContain('p_admin_user_id');
  });
  it('no code writes professional_profiles.verification_status directly', () => {
    for (const f of files) {
      expect(read(f)).not.toMatch(/verification_status:\s*'(documents_submitted|verified|suspended|rejected)'/);
    }
  });
  it('service routes every transition through the audited runner and the new RPC', () => {
    const src = read('src/lib/services/verification.ts');
    for (const name of ['approve', 'reject', 'suspend', 'reactivate']) {
      expect(src).toContain(`name: 'admin.professional.${name}'`);
    }
    expect(src).toContain("'admin_transition_professional_verification'");
    expect(src).toContain("'submit_professional_verification'");
  });
});

describe('migration 20261030_104', () => {
  const sql = read('supabase/migrations/20261030_104_professional_verification_state_machine.sql');
  it('derives the admin from the session and pins search_path', () => {
    expect(sql).toMatch(/v_actor\s+uuid\s*:=\s*auth\.uid\(\)/i);
    expect(sql).not.toMatch(/p_admin_user_id/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
  });
  it('revokes execute from PUBLIC and anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_transition_professional_verification[^;]*FROM PUBLIC/is);
    expect(sql).toMatch(/anon/);
  });
  it('blocks assignment of non-verified professionals at the table', () => {
    expect(sql).toContain('jobs_guard_professional_verified');
  });
});
