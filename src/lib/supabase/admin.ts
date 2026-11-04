import { createClient } from '@supabase/supabase-js'

let adminClient: ReturnType<typeof createClient> | null = null

/**
 * The server-only key that bypasses RLS. Prefers SUPABASE_SECRET_KEY (the newer
 * key type); falls back to the legacy SUPABASE_SERVICE_ROLE_KEY until that
 * variable is removed from every environment. Never expose this to the browser.
 */
export function getServerSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined
}

export async function createAdminClient() {
  if (adminClient) {
    return adminClient
  }

  const serviceRoleKey = getServerSecretKey()

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SECRET_KEY environment variable is not set.'
    )
  }

  adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  return adminClient
}

export async function createUserProfile(
  userId: string,
  email: string,
  fullName?: string,
  role: 'customer' | 'professional' = 'customer'
) {
  try {
    const admin = await createAdminClient()

    // @ts-ignore - Supabase SDK type inference issue
    const { data, error } = await (admin as any)
      .from('profiles')
      .upsert(
        [
          {
            id: userId,
            full_name: fullName || email.split('@')[0],
            role,
          },
        ],
        { onConflict: 'id' }
      )
      .select()
      .single()

    if (error) {
      console.error('Failed to create user profile:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error creating user profile:', error)
    throw error
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { createClient: createServerClient } = await import('./server')
    const supabase = await createServerClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return user?.id || null
  } catch {
    return null
  }
}

export async function fetchUserData(userId: string, table: string, select = '*') {
  try {
    const admin = await createAdminClient()

    const { data, error } = await admin
      .from(table)
      .select(select)
      .eq('id', userId)
      .single()

    if (error) {
      console.error(`Failed to fetch user data from ${table}:`, error)
      return null
    }

    return data
  } catch (error) {
    console.error('Error fetching user data:', error)
    return null
  }
}

export async function verifyAdminAccess(userId: string): Promise<boolean> {
  try {
    const admin = await createAdminClient()
    const { data, error } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error || !data) return false
    return (data as any)?.role === 'admin'
  } catch {
    return false
  }
}

export async function logAdminAction(
  adminId: string,
  action: string,
  changes?: Record<string, unknown>
) {
  try {
    const admin = await createAdminClient()
    // @ts-ignore - Supabase SDK type inference issue
    const { data, error } = await (admin as any)
      .from('audit_logs')
      .insert([
        {
          created_by: adminId,
          user_id: adminId,
          action,
          changes: changes || null,
        },
      ])
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error logging admin action:', error)
    throw error
  }
}

export async function getAuditLogs(
  limit: number = 100,
  offset: number = 0
) {
  try {
    const admin = await createAdminClient()
    const { data, error, count } = await admin
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error
    return { data, count }
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    throw error
  }
}
