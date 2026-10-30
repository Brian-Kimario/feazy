import { describe, expect, it } from 'vitest';
import { forgotPasswordSchema } from '@/validators';
import { classifyResetError, cooldownRemaining, maskEmail } from './password-reset';

describe('forgotPasswordSchema', () => {
  it('trims and lowercases', () => {
    expect(forgotPasswordSchema.parse({ email: '  Jane@Example.COM ' }).email).toBe('jane@example.com');
  });
  it('rejects empty and malformed input with a readable message', () => {
    const empty = forgotPasswordSchema.safeParse({ email: '   ' });
    expect(empty.success).toBe(false);
    const bad = forgotPasswordSchema.safeParse({ email: 'not-an-email' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toMatch(/valid email/);
  });
});

describe('classifyResetError', () => {
  it('detects rate limits by status, code or message', () => {
    expect(classifyResetError({ status: 429 })).toBe('rate_limited');
    expect(classifyResetError({ code: 'over_email_send_rate_limit' })).toBe('rate_limited');
    expect(classifyResetError({ message: 'Email rate limit exceeded' })).toBe('rate_limited');
  });
  it('detects network failures and falls back to unknown', () => {
    expect(classifyResetError({ message: 'Failed to fetch' })).toBe('network');
    expect(classifyResetError({ status: 500, message: 'boom' })).toBe('unknown');
  });
});

describe('cooldownRemaining', () => {
  it('rounds up and never goes negative', () => {
    expect(cooldownRemaining(10_500, 10_000)).toBe(1);
    expect(cooldownRemaining(10_000, 12_000)).toBe(0);
  });
});

describe('maskEmail', () => {
  it('masks the local part', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j******e@example.com');
    expect(maskEmail('ab@x.in')).toBe('a*@x.in');
  });
});
