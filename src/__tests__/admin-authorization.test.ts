import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('role-change endpoint is disabled (D-1)', () => {
  const routePath = 'src/app/api/admin/users/[id]/role/route.ts';

  it('PATCH answers 410 without reading a body or touching data', async () => {
    const { PATCH } = await import('@/app/api/admin/users/[id]/role/route');
    const res = await PATCH();
    expect(res.status).toBe(410);
  });

  it('only PATCH is exported, so other methods fall through to 405', async () => {
    const mod = await import('@/app/api/admin/users/[id]/role/route');
    expect(Object.keys(mod).sort()).toEqual(['PATCH']);
  });

  it('the route no longer imports a database client or the old helper', () => {
    const src = read(routePath).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/createAdminClient|createClient|updateUserRole|profiles/);
  });

  it('updateUserRole no longer exists anywhere in src', () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
        const rel = path.join(d, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(e.name) && rel !== path.join('src', '__tests__', 'admin-authorization.test.ts')) {
          if (/updateUserRole/.test(read(rel))) hits.push(rel);
        }
      }
    };
    walk('src');
    expect(hits).toEqual([]);
  });

  it('nothing in src writes profiles.role with .update()', () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
        const rel = path.join(d, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(e.name) && !rel.includes('__tests__')) {
          if (/\.update\(\s*\{[^}]*\brole\b/.test(read(rel))) hits.push(rel);
        }
      }
    };
    walk('src');
    expect(hits).toEqual([]);
  });
});

/**
 * Every export of a 'use server' module is a client-callable endpoint. Each async export must
 * either contain a recognised guard in its own body, or be listed with the reason it is safe.
 */
describe('server-action exposure inventory', () => {
  const GUARDS = /\b(requireAdmin|runAdminAction|getAdminActor|adminOr)\(/;

  // name -> why it needs no admin guard of its own
  const ALLOW: Record<string, Record<string, string>> = {
    'src/lib/services/verification.ts': {
      uploadVerificationDocument: 'professional-only: checks profiles.role === professional and writes under own user id',
      getDocumentSignedUrl: 'owner may sign own path; any other path requires getAdminActor and an audit row',
    },
    'src/app/admin/actions.ts': {
      loadOperationsCaseDetail: 'delegates to getOperationsCaseDetail (guarded)',
      reconcileOperationsJob: 'delegates to adminReconcileJob (runAdminAction)',
      verifyProfessional: 'delegates to approveProfessional / rejectProfessional (runAdminAction)',
    },
  };

  const FILES = [
    'src/lib/services/admin.ts',
    'src/lib/services/verification.ts',
    'src/lib/services/admin-assignment.ts',
    'src/lib/services/admin-operations.ts',
    'src/lib/services/admin-overview.ts',
    'src/lib/services/admin-case.ts',
    'src/lib/services/admin-reads.ts',
    'src/lib/services/verification-queue.ts',
    'src/app/admin/actions.ts',
  ];

  function exportedAsyncBodies(src: string): Record<string, string> {
    const out: Record<string, string> = {};
    const re = /^export async function (\w+)/gm;
    const starts: { name: string; at: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
    const next = [...src.matchAll(/^export /gm)].map((x) => x.index!);
    for (const s of starts) {
      const end = next.find((n) => n > s.at) ?? src.length;
      out[s.name] = src.slice(s.at, end);
    }
    return out;
  }

  it.each(FILES)('%s is a use-server module and every async export is guarded or justified', (file) => {
    const src = read(file);
    // admin-operations.ts is a plain server module (not an endpoint) reached only through
    // actions.ts; its exports stay guarded anyway so a later 'use server' cannot open a hole.
    const isEndpointModule = !file.endsWith('admin-operations.ts') && !file.endsWith('admin-overview.ts') && !file.endsWith('admin-case.ts') && !file.endsWith('admin-reads.ts') && !file.endsWith('verification-queue.ts');
    const head = src.split('\n').slice(0, 15).join('\n');
    if (isEndpointModule) expect(head).toMatch(/['"]use server['"]/);
    else expect(head).not.toMatch(/['"]use server['"]/);
    const bodies = exportedAsyncBodies(src);
    expect(Object.keys(bodies).length).toBeGreaterThan(0);

    const unguarded = Object.entries(bodies)
      .filter(([name, body]) => !GUARDS.test(body) && !ALLOW[file]?.[name])
      .map(([name]) => name);
    expect(unguarded).toEqual([]);
  });

  it('allow-list entries still exist (no stale exemptions)', () => {
    for (const [file, names] of Object.entries(ALLOW)) {
      const bodies = exportedAsyncBodies(read(file));
      for (const name of Object.keys(names)) expect(bodies).toHaveProperty(name);
    }
  });

  it('delegating wrappers really call the guarded function they claim to', () => {
    const a = read('src/app/admin/actions.ts');
    expect(a).toMatch(/getOperationsCaseDetail\(input\)/);
    expect(a).toMatch(/adminReconcileJob\(input\)/);
    expect(a).toMatch(/approveProfessional\(/);
    expect(a).toMatch(/rejectProfessional\(/);
  });

  it('the admin guard reads the role from the database, not from input', () => {
    const g = read('src/lib/admin/guard.ts');
    expect(g).toMatch(/\.from\('profiles'\)/);
    expect(g).toMatch(/profile\.role !== 'admin'/);
  });
});

describe('admin services are typed and page-only reads are not endpoints (D-2, D-6)', () => {
  const ADMIN_FILES = [
    'src/lib/services/admin.ts',
    'src/lib/services/admin-reads.ts',
    'src/lib/services/verification.ts',
    'src/lib/services/verification-queue.ts',
    'src/lib/admin/client.ts',
    'src/app/admin/customers/page.tsx',
    'src/app/admin/jobs/page.tsx',
    'src/app/admin/professionals/page.tsx',
    'src/lib/services/admin-professional-directory.ts',
    'src/app/admin/professionals/verification/page.tsx',
    'src/app/admin/audit/page.tsx',
    'src/lib/services/admin-audit.ts',
    'src/app/admin/finance/page.tsx',
    'src/lib/services/admin-payments.ts',
  ];

  it.each(ADMIN_FILES)('%s has no any or @ts-ignore', (file) => {
    expect(read(file)).not.toMatch(/@ts-ignore|\bas any\b|:\s*any\b|<any>/);
  });

  it('client components never import the page-only read modules', () => {
    const dir = 'src/components';
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
        const rel = path.join(d, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) {
          const src = read(rel);
          if (/^['"]use client['"]/m.test(src.slice(0, 200)) && /services\/(admin-reads|verification-queue)['"]/.test(src)) hits.push(rel);
        }
      }
    };
    walk(dir);
    expect(hits).toEqual([]);
  });

  it('moved reads are gone from the endpoint modules', () => {
    const admin = read('src/lib/services/admin.ts');
    const ver = read('src/lib/services/verification.ts');
    for (const name of ['getAdminMetrics', 'getAllJobs', 'getAllProfessionals', 'getRecentPayments', 'getAllCustomers', 'getUnmatchedBookings', 'getAssignmentQueueStatus']) {
      expect(admin).not.toMatch(new RegExp(`export async function ${name}\\b`));
    }
    expect(ver).not.toMatch(/export async function getUnverifiedProfessionals/);
  });
});
