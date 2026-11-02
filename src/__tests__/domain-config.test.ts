import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

describe('domain configuration', () => {
  it('has no stale production hosts in app source', () => {
    const root = path.resolve(__dirname, '../..');
    const out = execSync(
      `grep -rnE "fixify\\.vercel\\.app|fixify-amber|feasy\\.in" src --include=*.ts --include=*.tsx --exclude-dir=__tests__ || true`,
      { cwd: root, encoding: 'utf8' }
    );
    expect(out.trim()).toBe('');
  });
});
