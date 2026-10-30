import type { SupabaseClient } from '@supabase/supabase-js';

export interface PendingRpcError {
  code?: string;
  message: string;
}

export interface PendingRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: PendingRpcError | null }>;
}

/**
 * Typed access to RPCs that exist in a migration but not yet in database.types.ts.
 * Remove the call sites (use `supabase.rpc` directly) once the types are regenerated after apply.
 */
export function pendingRpc(client: SupabaseClient<never, never, never> | unknown): PendingRpcClient {
  return client as PendingRpcClient;
}
