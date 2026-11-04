import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Refuses to run synthetic tests against the production Supabase project.
 *
 * Next.js reads `.env.local`, but Playwright does not, so this reads the same file.
 * Precedence matches Next.js: a variable set in the process environment wins over the file.
 */

export const PRODUCTION_PROJECT_REF = 'azmajqztvcuwajaaldqm'

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) vars[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return vars
}

function isLocalUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value)
    return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')
  } catch {
    return false
  }
}

export function assertLocalSupabase(
  options: { envFile?: string; processEnv?: NodeJS.ProcessEnv } = {}
): void {
  const envFile = resolve(options.envFile ?? '.env.local')
  const processEnv = options.processEnv ?? process.env
  const fileVars = existsSync(envFile) ? parseEnvFile(readFileSync(envFile, 'utf8')) : {}
  const effective: Record<string, string | undefined> = { ...fileVars, ...processEnv }

  const supabaseUrl = effective.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!isLocalUrl(supabaseUrl)) {
    throw new Error(
      `Refusing to run synthetic tests: NEXT_PUBLIC_SUPABASE_URL must point at a local host (got a non-local or missing URL). ` +
        `Start the local stack with \`supabase start\` and use its API URL.`
    )
  }

  const baseUrl = effective.PLAYWRIGHT_TEST_BASE_URL
  if (baseUrl && !isLocalUrl(baseUrl)) {
    throw new Error('Refusing to run synthetic tests: PLAYWRIGHT_TEST_BASE_URL must be a local URL.')
  }

  const leaked = Object.entries(effective).filter(
    ([, value]) => typeof value === 'string' && value.includes(PRODUCTION_PROJECT_REF)
  )
  if (leaked.length > 0) {
    throw new Error(
      `Refusing to run synthetic tests: ${leaked.map(([key]) => key).join(', ')} references the production Supabase project.`
    )
  }
}
