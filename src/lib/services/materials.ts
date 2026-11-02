/**
 * Material reads for the customer, inspector and professional views. The RPCs decide who may see
 * what (customer, assigned inspector or professional, admin); both return empty lists, never an
 * error page, when migration 120 is not applied yet.
 */

import { createClient } from '@/lib/supabase/server';

export interface MaterialRef {
  material_id: string;
  name: string;
  brand: string | null;
  unit: string;
  indicative_price: number | null;
  price_unit: string | null;
}

export interface ConfirmedMaterial extends MaterialRef {
  quantity: number;
  sourcing: 'customer' | 'feazy';
  note: string | null;
}

export interface BookingMaterials {
  preferences: MaterialRef[];
  confirmed: ConfirmedMaterial[];
}

export interface VisitMaterials extends BookingMaterials {
  options: MaterialRef[];
}

const EMPTY: VisitMaterials = { preferences: [], confirmed: [], options: [] };

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function getBookingMaterials(bookingId: string): Promise<BookingMaterials> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_booking_materials', { p_booking_id: bookingId });
  if (error || !data || typeof data !== 'object') return { preferences: [], confirmed: [] };
  const d = data as Record<string, unknown>;
  return { preferences: list<MaterialRef>(d.preferences), confirmed: list<ConfirmedMaterial>(d.confirmed) };
}

export async function getVisitMaterials(visitId: string): Promise<VisitMaterials> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_visit_materials', { p_visit_id: visitId });
  if (error || !data || typeof data !== 'object') return EMPTY;
  const d = data as Record<string, unknown>;
  return {
    preferences: list<MaterialRef>(d.preferences),
    confirmed: list<ConfirmedMaterial>(d.confirmed),
    options: list<MaterialRef>(d.options),
  };
}
