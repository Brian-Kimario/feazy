/**
 * Bookings Service
 * 
 * Booking retrieval and management. Bookings are created by the create_booking RPC
 * (see createBookingAction).
 * RLS ensures customers can only see/modify their own bookings.
 */

import { createClient } from '@/lib/supabase/server'

export interface Booking {
  id: string
  booking_reference: string
  customer_id: string
  property_id: string
  service_request_id: string | null
  service_id: string
  professional_id: string | null
  scheduled_start: string
  scheduled_end: string | null
  pricing_model: 'fixed' | 'inspection' | 'quote_after_inspection'
  quoted_or_base_amount: number | null
  booking_status: string
  created_at: string
  updated_at: string
}

export interface BookingWithDetails extends Booking {
  service: {
    id: string
    name: string
    slug: string
  }
  property: {
    id: string
    name: string
    property_type: string
  }
  professional?: {
    user_id: string
    display_name: string
    rating_average: number
  } | null
}

/**
 * Get all bookings for the authenticated customer
 */
export async function getCustomerBookings(): Promise<BookingWithDetails[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      service:services (id, name, slug),
      property:properties (id, name, property_type),
      professional:professional_profiles (user_id, display_name, rating_average)
    `
    )
    .order('scheduled_start', { ascending: false })

  if (error) {
    console.error('Error fetching bookings:', error)
    throw new Error(`Failed to fetch bookings: ${error.message}`)
  }

  return (data || []) as BookingWithDetails[]
}

/**
 * Get a single booking by ID
 */
export async function getBooking(bookingId: string): Promise<BookingWithDetails | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      service:services (id, name, slug),
      property:properties (id, name, property_type),
      professional:professional_profiles (user_id, display_name, rating_average)
    `
    )
    .eq('id', bookingId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching booking:', error)
    throw new Error(`Failed to fetch booking: ${error.message}`)
  }

  return data as BookingWithDetails
}

/**
 * Get active bookings for a customer (not completed/cancelled)
 */
export async function getActiveBookings(): Promise<BookingWithDetails[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      service:services (id, name, slug),
      property:properties (id, name, property_type),
      professional:professional_profiles (user_id, display_name, rating_average)
    `
    )
    .in('booking_status', ['pending', 'accepted', 'in_progress'])
    .order('scheduled_start', { ascending: true })

  if (error) {
    console.error('Error fetching active bookings:', error)
    throw new Error(`Failed to fetch active bookings: ${error.message}`)
  }

  return (data || []) as BookingWithDetails[]
}

/**
 * Get completed bookings for a customer
 */
export async function getCompletedBookings(): Promise<BookingWithDetails[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      service:services (id, name, slug),
      property:properties (id, name, property_type),
      professional:professional_profiles (user_id, display_name, rating_average)
    `
    )
    .eq('booking_status', 'completed')
    .order('scheduled_start', { ascending: false })

  if (error) {
    console.error('Error fetching completed bookings:', error)
    throw new Error(`Failed to fetch completed bookings: ${error.message}`)
  }

  return (data || []) as BookingWithDetails[]
}

/**
 * Cancel a booking using the state machine
 * 
 * This function enforces:
 * - Authorization: User must be the customer who owns the booking
 * - State validation: Booking must be in a cancellable state
 * - Atomicity: Associated job is also cancelled if active
 * - Audit trail: All state transitions recorded in booking_events
 */
export async function cancelBooking(bookingId: string): Promise<Booking> {
  const supabase = await createClient()

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Not authenticated')
  }

  // Verify user owns this booking
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, customer_id, booking_status')
    .eq('id', bookingId)
    .eq('customer_id', user.id)
    .single()

  if (fetchError || !booking) {
    throw new Error('Booking not found or does not belong to you')
  }

  // The database call needs the state the customer saw: the job's state, or 'no_job' before one exists.
  const { data: job } = await supabase
    .from('jobs')
    .select('current_state')
    .eq('booking_id', bookingId)
    .maybeSingle()
  const expectedState = (job as { current_state: string } | null)?.current_state ?? 'no_job'

  // customer_cancel_booking derives the actor from the session, verifies ownership and cancels the
  // job and booking together. Failures it reports (stale state, not eligible) come back as ok=false.
  // @ts-ignore - RPC not in generated types
  const { data: result, error: rpcError } = await supabase.rpc('customer_cancel_booking', {
    p_booking_id: bookingId,
    p_expected_state: expectedState,
    p_reason_category: 'other',
    p_note: null,
  })

  if (rpcError) {
    console.error('Error cancelling booking:', rpcError)
    throw new Error(`Failed to cancel booking: ${rpcError.message}`)
  }

  const outcome = result as unknown as { ok: boolean; code?: string; message?: string } | null
  if (!outcome?.ok && outcome?.code !== 'ALREADY_CANCELLED') {
    throw new Error(outcome?.message ?? 'Failed to cancel booking')
  }

  // Fetch updated booking to return
  const { data: updated, error: fetchError2 } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single()

  if (fetchError2 || !updated) {
    throw new Error('Failed to retrieve cancelled booking')
  }

  return updated as Booking
}

/**
 * Get booking statistics for customer dashboard
 */
export async function getBookingStats(): Promise<{
  totalBookings: number
  activeBookings: number
  completedBookings: number
  cancelledBookings: number
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('booking_status')

  if (error) {
    console.error('Error fetching booking stats:', error)
    throw new Error(`Failed to fetch booking stats: ${error.message}`)
  }

  const bookings = data || []
  const stats = {
    totalBookings: bookings.length,
    activeBookings: bookings.filter((b) => ['pending', 'accepted', 'in_progress'].includes(b.booking_status)).length,
    completedBookings: bookings.filter((b) => b.booking_status === 'completed').length,
    cancelledBookings: bookings.filter((b) => b.booking_status === 'cancelled').length,
  }

  return stats
}
