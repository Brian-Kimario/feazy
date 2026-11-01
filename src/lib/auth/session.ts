/**
 * Session Management
 * 
 * Provides utilities for accessing and managing user sessions
 * across Server Components, Route Handlers, and Server Actions.
 */

import { createClient } from '@/lib/supabase/server';
import { type User } from '@supabase/supabase-js';
import { createTypedAdminClient } from '@/lib/admin/client';
import { type Profile } from '@/types/auth';

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

async function createMissingCustomerProfile(user: User): Promise<Profile | null> {
  const adminClient = await createTypedAdminClient();
  // ignoreDuplicates makes this INSERT ... ON CONFLICT DO NOTHING: an existing row, with whatever
  // role it holds, is left untouched.
  const { error: insertError } = await adminClient.from('profiles').upsert(
    [
      {
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        role: 'customer',
      },
    ],
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (insertError) {
    console.error('Failed to create profile:', { code: String(insertError.code || 'UNKNOWN'), userId: user.id });
    return null;
  }
  const { data, error } = await adminClient.from('profiles').select('*').eq('id', user.id).single();
  if (error) {
    console.error('Failed to read profile after create:', { code: String(error.code || 'UNKNOWN'), userId: user.id });
    return null;
  }
  return data as Profile;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    const errorObj = {
      message: String(error.message || 'Unknown error'),
      code: String(error.code || 'UNKNOWN'),
      details: String(error.details || ''),
      hint: String(error.hint || ''),
      userId: user.id,
      timestamp: new Date().toISOString(),
    };

    console.warn('Profile fetch error details:', errorObj);

    if (error.code === 'PGRST116') {
      // No visible row. profiles are created by the handle_new_user trigger at signup, so this
      // means the row is genuinely missing. Create it only if absent and never overwrite a row
      // that appears meanwhile: an upsert here would reset an existing admin or professional to
      // customer.
      console.warn('Profile record not found, attempting to create');
      const created = await createMissingCustomerProfile(user);
      if (!created) return null;
      console.info('Profile ready for user:', user.id);
      return created;
    }

    // Any other error (including PGRST201, which is a relationship ambiguity, not an RLS denial)
    // falls through to a read-only fetch. It never writes the role.
    console.warn('Trying to fetch profile as admin due to error:', errorObj.code);
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const adminClient = await createAdminClient();

    const { data: adminData, error: adminError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (adminError) {
      const adminErrorObj = {
        message: String(adminError.message || 'Unknown error'),
        code: String(adminError.code || 'UNKNOWN'),
        details: String(adminError.details || ''),
        userId: user.id,
      };
      console.error('Failed to fetch profile even as admin:', adminErrorObj);
      return null;
    }

    console.info('Successfully fetched profile as admin for user:', user.id);
    return adminData as Profile;
  }

  return data as Profile;
}

/**
 * Check if user has a specific role
 */
export async function hasRole(role: string): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === role;
}

/**
 * Sign out current user
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
