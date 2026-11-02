import { z } from 'zod';
import { uuid } from './common';

export const createBookingSchema = z.object({
  serviceId: uuid,
  propertyId: uuid,
  scheduledStart: z.iso.datetime({ offset: true, message: 'Choose a date and time' }),
  /** {service_option_id: value}; the RPC checks each pair against the service's active options. */
  selectedOptions: z.record(uuid, z.string().max(200)).optional(),
  /** Shown to offered professionals before they accept, so it must not hold access codes. */
  problemSummary: z.string().trim().max(1000).optional(),
  /** Customer-selectable materials; a preference only. The RPC checks them against the service and nothing is charged. */
  materialIds: z.array(uuid).max(10).optional(),
});

export type CreateBookingInput = z.input<typeof createBookingSchema>;

/** Reason categories accepted by customer_cancel_booking(); the database rejects anything else. */
export const CUSTOMER_CANCEL_REASONS = [
  { value: 'changed_my_mind', label: 'I changed my mind' },
  { value: 'booked_by_mistake', label: 'I booked by mistake' },
  { value: 'found_other_help', label: 'I found other help' },
  { value: 'schedule_conflict', label: 'The schedule no longer works' },
  { value: 'price_concern', label: 'Price concern' },
  { value: 'other', label: 'Other' },
] as const;

const customerCancelReasonValues = CUSTOMER_CANCEL_REASONS.map((r) => r.value) as [
  (typeof CUSTOMER_CANCEL_REASONS)[number]['value'],
  ...(typeof CUSTOMER_CANCEL_REASONS)[number]['value'][],
];

/**
 * expectedState is the job state the customer saw ('no_job' while no professional is matched).
 * The database refuses with STALE_STATE if it has moved on, so a cancel never lands on a booking
 * that changed under the customer's feet.
 */
export const cancelBookingSchema = z.object({
  bookingId: uuid,
  expectedState: z.string().trim().min(1, 'Missing booking state').max(40),
  reasonCategory: z.enum(customerCancelReasonValues, { message: 'Choose a reason' }),
  note: z
    .string()
    .trim()
    .max(300, 'Keep the note to 300 characters')
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type CancelBookingInput = z.input<typeof cancelBookingSchema>;
