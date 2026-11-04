import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertLocalSupabase, parseEnvFile, PRODUCTION_PROJECT_REF } from '../scripts/assert-local-supabase'

const LOCAL = 'http://127.0.0.1:54321'
const PROD = `https://${PRODUCTION_PROJECT_REF}.supabase.co`

let dir: string

function envFile(content: string): string {
  const path = join(dir, '.env.local')
  writeFileSync(path, content)
  return path
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'assert-local-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('assertLocalSupabase', () => {
  it('accepts a local Supabase URL in .env.local', () => {
    const envFileName = envFile(`NEXT_PUBLIC_SUPABASE_URL=${LOCAL}\n`)
    expect(() => assertLocalSupabase({ envFile: envFileName, processEnv: {} })).not.toThrow()
  })

  it('refuses the production project in .env.local', () => {
    const envFileName = envFile(`NEXT_PUBLIC_SUPABASE_URL=${PROD}\n`)
    expect(() => assertLocalSupabase({ envFile: envFileName, processEnv: {} })).toThrow(/local host/)
  })

  it('lets a process environment value override the file, as Next.js does', () => {
    const envFileName = envFile(`NEXT_PUBLIC_SUPABASE_URL=${PROD}\n`)
    expect(() =>
      assertLocalSupabase({ envFile: envFileName, processEnv: { NEXT_PUBLIC_SUPABASE_URL: LOCAL } })
    ).not.toThrow()
  })

  it('refuses when the URL is missing', () => {
    const envFileName = envFile('OTHER=1\n')
    expect(() => assertLocalSupabase({ envFile: envFileName, processEnv: {} })).toThrow(/local host/)
  })

  it('refuses a non-local Playwright base URL', () => {
    const envFileName = envFile(`NEXT_PUBLIC_SUPABASE_URL=${LOCAL}\n`)
    expect(() =>
      assertLocalSupabase({
        envFile: envFileName,
        processEnv: { PLAYWRIGHT_TEST_BASE_URL: 'https://fixify.example.com' },
      })
    ).toThrow(/PLAYWRIGHT_TEST_BASE_URL/)
  })

  it('refuses any other variable that names the production project', () => {
    const envFileName = envFile(`NEXT_PUBLIC_SUPABASE_URL=${LOCAL}\nSOME_OTHER_URL=${PROD}\n`)
    expect(() => assertLocalSupabase({ envFile: envFileName, processEnv: {} })).toThrow(/SOME_OTHER_URL/)
  })
})

describe('parseEnvFile', () => {
  it('reads KEY=value pairs and strips quotes', () => {
    expect(parseEnvFile('A=1\n# comment\nB="two"\n')).toEqual({ A: '1', B: 'two' })
  })
})
