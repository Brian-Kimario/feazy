'use server';

import { createClient } from '@/lib/supabase/server';
import { fail, ok, parseInput, type ActionFailure, type ActionResult } from '@/lib/actions/result';
import { createBookingSchema, type CreateBookingInput } from '@/validators';
import { getFreeInspectionStatus } from '@/lib/services/booking-pricing';

export type { CreateBookingInput };

// ── Output shape ────────────────────────────────────────────────────────────

export interface CreateBookingOutput {
  bookingId: string;
  bookingReference: string;
  /** True when a professional has already been offered the job. */
  matched: boolean;
}

// ── Server action ─────────────────────────────────────────────────────────────

/**
 * createBookingAction
 *
 * The create_booking RPC does the checks and the insert: it takes the customer from the
 * session, requires an active service and a property the customer owns, refuses past dates,
 * checks chosen options against the service, and sets the amount from the service row
 * (option price modifiers are not applied). Customers have no INSERT policy on bookings.
 */
export async function createBookingAction(
  payload: CreateBookingInput
): Promise<ActionResult<CreateBookingOutput>> {
  const parsed = parseInput(createBookingSchema, payload);
  if (parsed.success === false) return parsed;
  const input = parsed.data;

  const scheduledDate = new Date(input.scheduledStart);
  if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    return fail('invalid_input', 'Please choose a future date and time for your booking.');
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return fail('unauthenticated', 'Not authenticated. Please sign in.');
  }

  // A clientRequestId means the form was built against the structured booking path (migrations 119 and 120).
  // That path checks the price, stores materials and budget, and de-duplicates a retry inside one transaction.
  // Without it, the legacy six-argument create_booking runs, and the price is checked against a read taken first.
  const structured = input.clientRequestId !== undefined;

  if (!structured && input.expectedFreeInspection !== undefined) {
    const current = await getFreeInspectionStatus(supabase);
    if (current === null) {
      return fail('failed', 'We could not confirm the price. Please try again.');
    }
    if (current !== input.expectedFreeInspection) {
      return fail('price_changed', PRICE_CHANGED_MESSAGE);
    }
  }

  const { data: rows, error: bookingError } = structured
    ? await supabase.rpc('create_booking_with_materials', {
        p_service_id: input.serviceId,
        p_property_id: input.propertyId,
        p_scheduled_start: scheduledDate.toISOString(),
        p_problem_summary: input.problemSummary || '',
        p_options: input.selectedOptions ?? {},
        p_materials: (input.materials ?? []).map((m) => ({ material_id: m.materialId, quantity: m.quantity })),
        p_budget: input.budget ?? null,
        p_expected_free_inspection: input.expectedFreeInspection ?? null,
        p_expected_amount: input.expectedAmount ?? null,
        p_client_request_id: input.clientRequestId ?? null,
      })
    : await supabase.rpc('create_booking', {
          p_service_id: input.serviceId,
          p_property_id: input.propertyId,
          p_scheduled_start: scheduledDate.toISOString(),
          p_problem_summary: input.problemSummary || undefined,
          p_options: input.selectedOptions ?? {},
        });
  const booking = rows?.[0];

  if (bookingError || !booking) {
    return createBookingFailure(bookingError);
  }

  // ── Offer the job to the best-matching professional ─────────────────────────
  // A failure here must not fail the booking: unmatched bookings are retried
  // by the assignment queue (/api/cron/assignment-queue).
  let matched = false;
  const { data: assignment, error: assignError } = await supabase.rpc('assign_booking', {
    p_booking_id: booking.booking_id,
  });
  if (assignError) {
    console.error('assign_booking error:', assignError.message);
  } else {
    matched = Boolean((assignment as unknown as { matched?: boolean } | null)?.matched);
  }

  // Client will handle navigation after showing success state
  return ok({
    bookingId: booking.booking_id,
    bookingReference: booking.booking_reference,
    matched,
  });
}

const PRICE_CHANGED_MESSAGE =
  'The price for this service has changed since you opened this page. Please check the new price and confirm again.';

function createBookingFailure(error: { code?: string; message: string } | null): ActionFailure {
  switch (error?.code) {
    case 'P0002':
      // The RPC uses this for both an unavailable service and a property the caller doesn't own.
      return fail('not_found', 'That service or property is no longer available. Please check and try again.');
    case 'P0003':
      // The database's price differs from the one the customer confirmed. Nothing was booked.
      return fail('price_changed', PRICE_CHANGED_MESSAGE);
    case 'P0007':
      return fail('rejected', 'You have made several booking requests in the last hour. Please wait a little and try again.');
    case 'P0005':
      return fail(
        'rejected',
        'You already have an inspection booked for this property and service that is still open. Check your bookings first.'
      );
    case 'P0006':
      return fail('rejected', 'No inspector is free for a visit right now. Please try again later.');
    case 'P0008':
      // The property's city has no verified professional with an active service area. Nothing was booked.
      return fail('rejected', 'We do not serve this area yet. Please check the address for this property.');
    case 'P0009':
      // The unguarded booking path has been switched off. The current form sends the structured request.
      return fail('rejected', 'Please refresh the page and book again.');
    case '22023':
      // A past start time (already checked above, so clock skew), a service with no price,
      // an option that is no longer offered, or an urgency that is switched off.
      if (error.message.includes('budget')) {
        return fail('rejected', 'The budget you entered is outside the allowed range. Please adjust it and try again.');
      }
      if (error.message.includes('material')) {
        return fail('rejected', 'One of the materials you chose is no longer available. Please go back and choose again.');
      }
      if (error.message.includes('option')) {
        return fail('rejected', 'One of the options you chose is no longer available. Please go back and choose again.');
      }
      return fail('rejected', 'This service cannot be booked for that time. Please choose another time or service.');
    case '42501':
      return fail('rejected', 'Only customer accounts can create bookings.');
    default:
      console.error('create_booking error:', error?.message ?? 'no row returned');
      return fail('failed', 'We could not create your booking. Please try again.');
  }
}
