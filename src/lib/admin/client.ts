import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';

export type TypedAdminClient = SupabaseClient<Database>;

/** The shared service-role client is untyped; the schema types are applied here once. */
export async function createTypedAdminClient(): Promise<TypedAdminClient> {
  return (await createAdminClient()) as unknown as TypedAdminClient;
}
