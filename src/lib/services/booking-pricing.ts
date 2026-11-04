/**
 * Booking pricing reads. The database decides whether an inspection is free; the booking wizard
 * displays that decision rather than deriving it from a frontend flag.
 */

import type { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Whether free inspection is on in the database, which is what create_booking charges by.
 * Returns null when the answer cannot be read (for example, migration 119 is not applied yet).
 * Callers must treat null as "unknown", not as "off".
 */
export async function getFreeInspectionStatus(supabase: ServerClient): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('get_booking_free_inspection');
  if (error) {
    console.error('get_booking_free_inspection error:', error.message);
    return null;
  }
  return typeof data === 'boolean' ? data : null;
}
