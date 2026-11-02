/**
 * Bookings Service
 * 
 * Booking retrieval and management. Bookings are created by the create_booking RPC
 * (see createBookingAction).
 * RLS ensures customers can only see/modify their own bookings.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { fail, ok, parseInput, type ActionResult } from '@/lib/actions/result'
import { cancelBookingSchema, type CancelBookingInput } from '@/validators/booking'

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

/** What a successful customer cancellation tells the caller. */
export interface CancelBookingOutcome {
  /** `cancelled`: done. `review_requested`: from arrival onward Feazy reviews it and nothing changed yet. */
  outcome: 'cancelled' | 'review_requested'
  bookingId: string
  jobId: string | null
  fromState: string
  offerWithdrawn: boolean
  /** A paid payment exists: nothing was refunded; support/admin decides. The UI must say so. */
  paymentReviewRequired: boolean
}

const cancelRpcResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    outcome: z.enum(['cancelled', 'review_requested']).default('cancelled'),
    booking_id: z.string(),
    job_id: z.string().nullable(),
    from_state: z.string(),
    offer_withdrawn: z.boolean().default(false),
    payment_review_required: z.boolean().default(false),
  }),
  z.object({
    ok: z.literal(false),
    code: z.string(),
    message: z.string(),
  }),
])

/**
 * Cancel the signed-in customer's own booking via customer_cancel_booking().
 *
 * Authorization lives in the database (actor = auth.uid(), ownership checked, job cancelled through
 * transition_job_state). This only validates input, calls the RPC with the user-scoped client and maps
 * outcomes to typed results. Ordinary refusals (stale, not eligible, already cancelled) come back as
 * `rejected` with the database's customer-facing message. Payments are never touched.
 */
export async function cancelBooking(input: CancelBookingInput): Promise<ActionResult<CancelBookingOutcome>> {
  const parsed = parseInput(cancelBookingSchema, input)
  if (parsed.success === false) return parsed
  const { bookingId, expectedState, reasonCategory, note } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('unauthenticated', 'Please sign in to cancel a booking.')

  const { data, error } = await supabase.rpc('customer_cancel_booking', {
    p_booking_id: bookingId,
    p_expected_state: expectedState,
    p_reason_category: reasonCategory,
    p_note: note,
  })

  if (error) {
    switch (error.code) {
      case '42501':
        return fail('unauthenticated', 'Please sign in to cancel a booking.')
      case 'P0002':
        return fail('not_found', 'We could not find that booking.')
      case '22023':
        return fail('invalid_input', 'Please check the cancellation details and try again.')
      case '40P01':
      case '40001':
        return fail('failed', 'Someone else updated this booking at the same moment. Please try again.')
      default:
        return fail('failed', 'We could not cancel this booking. Please try again.')
    }
  }

  const result = cancelRpcResult.safeParse(data)
  if (!result.success) return fail('failed', 'We could not confirm the cancellation. Please refresh and check.')
  if (result.data.ok === false) return fail('rejected', result.data.message)

  const done = result.data
  return ok({
    outcome: done.outcome,
    bookingId: done.booking_id,
    jobId: done.job_id,
    fromState: done.from_state,
    offerWithdrawn: done.offer_withdrawn,
    paymentReviewRequired: done.payment_review_required,
  })
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
