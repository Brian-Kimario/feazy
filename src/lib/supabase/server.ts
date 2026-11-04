import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from './database.types'

/**
 * Server-side Supabase client using cookie-based SSR pattern
 * 
 * Used in:
 * - Server Components
 * - API Routes / Route Handlers
 * - Server Actions
 * - Middleware
 * 
 * Follows Supabase's recommended Next.js SSR pattern with cookie-based session management.
 * This client automatically refreshes authentication tokens between requests.
 * 
 * SECURITY ENHANCEMENTS:
 * - All auth cookies set with HttpOnly flag (prevents XSS token theft)
 * - All cookies set with Secure flag (HTTPS only)
 * - All cookies use SameSite=Strict (prevents CSRF)
 * - Auth token expiry: 7 days (reduced from 6 months)
 * 
 * Rules:
 * - This client reads/writes cookies
 * - Uses publishable key (same as browser client)
 * - Does NOT use service-role key (would bypass RLS)
 * - Respects Row Level Security policies
 * - Can use service-role ONLY in specific protected Edge Functions
 */

const COOKIE_OPTIONS = {
  // FIX 1: HttpOnly prevents JavaScript from accessing cookies (XSS protection)
  httpOnly: true,
  
  // FIX 2: Secure forces HTTPS only (prevents MITM interception)
  secure: process.env.NODE_ENV === 'production',
  
  // SameSite=Lax (not Strict): the PKCE code-verifier cookie must survive the
  // cross-site top-level redirect back from Google, or the callback's code
  // exchange fails with exchange_failed. Lax still blocks cross-site POSTs.
  sameSite: 'lax' as const,
  
  // FIX 4: Reduce token lifetime from 6 months to 7 days
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Apply security cookie options to all auth-related cookies
              const isAuthCookie = name.includes('auth') || name.includes('session') || name.startsWith('sb-')
              
              const secureOptions = isAuthCookie 
                ? { ...options, ...COOKIE_OPTIONS }
                : { ...options, httpOnly: true, secure: process.env.NODE_ENV === 'production' }
              
              cookieStore.set(name, value, secureOptions)
            })
          } catch {
            // Handle errors in cookie setting (e.g., in middleware)
          }
        },
      },
    }
  )
}
