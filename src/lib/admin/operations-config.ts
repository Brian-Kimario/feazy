import { z } from 'zod';

/**
 * Alert thresholds for the Operations queue. These only decide what is *flagged for review*;
 * nothing here cancels, reassigns or otherwise changes a booking. Override per deployment with
 * the OPS_* variables listed in .env.example.
 */
export interface OperationsThresholds {
  /** An offer still open this long after `offer_expires_at` means the matching worker is behind. */
  offerOverdueGraceMinutes: number;
  /** A booking with no job and no `unmatched_since` is given this long to be picked up by the worker. */
  newBookingGraceMinutes: number;
  /** Past the scheduled start, an unmatched booking is no longer offered; after this it needs a person. */
  unmatchedStopMinutes: number;
  /** An accepted / on-the-way job with no arrival this long after the scheduled start is a possible no-show. */
  noShowMinutes: number;
  /** In-progress or quote-pending job with no activity (and past its scheduled end) for this long. */
  staleActivityHours: number;
}

export const DEFAULT_OPERATIONS_THRESHOLDS: OperationsThresholds = {
  offerOverdueGraceMinutes: 2,
  newBookingGraceMinutes: 5,
  unmatchedStopMinutes: 30,
  noShowMinutes: 30,
  staleActivityHours: 24,
};

const positive = z.coerce.number().positive().finite();

const envSchema = z.object({
  OPS_OFFER_OVERDUE_GRACE_MINUTES: positive.optional(),
  OPS_NEW_BOOKING_GRACE_MINUTES: positive.optional(),
  OPS_UNMATCHED_STOP_MINUTES: positive.optional(),
  OPS_NO_SHOW_MINUTES: positive.optional(),
  OPS_STALE_ACTIVITY_HOURS: positive.optional(),
});

/** Throws on a malformed override so a bad deploy shows an error state, not silently different alerts. */
export function resolveOperationsThresholds(
  env: Record<string, string | undefined> = process.env,
): OperationsThresholds {
  const raw = Object.fromEntries(
    Object.keys(envSchema.shape).map((key) => [key, env[key] === '' ? undefined : env[key]]),
  );
  const parsed = envSchema.parse(raw);
  const d = DEFAULT_OPERATIONS_THRESHOLDS;
  return {
    offerOverdueGraceMinutes: parsed.OPS_OFFER_OVERDUE_GRACE_MINUTES ?? d.offerOverdueGraceMinutes,
    newBookingGraceMinutes: parsed.OPS_NEW_BOOKING_GRACE_MINUTES ?? d.newBookingGraceMinutes,
    unmatchedStopMinutes: parsed.OPS_UNMATCHED_STOP_MINUTES ?? d.unmatchedStopMinutes,
    noShowMinutes: parsed.OPS_NO_SHOW_MINUTES ?? d.noShowMinutes,
    staleActivityHours: parsed.OPS_STALE_ACTIVITY_HOURS ?? d.staleActivityHours,
  };
}
