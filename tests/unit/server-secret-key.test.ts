import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getServerSecretKey } from '@/lib/supabase/admin'

const KEYS = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('getServerSecretKey', () => {
  it('returns undefined when neither variable is set', () => {
    expect(getServerSecretKey()).toBeUndefined()
  })

  it('prefers SUPABASE_SECRET_KEY over the legacy variable', () => {
    process.env.SUPABASE_SECRET_KEY = 'new-secret'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-value'
    expect(getServerSecretKey()).toBe('new-secret')
  })

  it('falls back to the legacy variable when the new one is unset or empty', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-value'
    expect(getServerSecretKey()).toBe('legacy-value')
    process.env.SUPABASE_SECRET_KEY = ''
    expect(getServerSecretKey()).toBe('legacy-value')
  })
})
