/**
 * Pure rules behind the role shells and dashboards. Kept free of Supabase and React so
 * they can be unit tested; every input is a column value read elsewhere.
 */
import { STATE_META, isJobState, isTerminal, type JobStateTone } from '@/lib/jobs/states';

/* ── Verification ─────────────────────────────────────────────────────────── */

/** Values written by `src/lib/services/verification.ts`. */
export type VerificationStatus =
  | 'pending'
  | 'documents_submitted'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'suspended';

export interface VerificationNotice {
  tone: 'ochre' | 'blue' | 'danger';
  title: string;
  body: string;
}

const LOCKED = 'Until then you can’t go online or receive job requests.';

/**
 * Banner copy for a professional who is not verified. Returns null when verified.
 * `rejectionReason` comes from the latest `professional_verifications` row.
 */
export function verificationNotice(
  status: string | null | undefined,
  rejectionReason?: string | null,
): VerificationNotice | null {
  switch (status) {
    case 'verified':
      return null;
    case 'documents_submitted':
      return {
        tone: 'blue',
        title: 'Documents submitted',
        body: `Your documents are waiting for an admin to review them. ${LOCKED}`,
      };
    case 'under_review':
      return {
        tone: 'blue',
        title: 'Verification under review',
        body: `An admin is reviewing your profile. ${LOCKED}`,
      };
    case 'rejected': {
      const reason = rejectionReason?.trim();
      return {
        tone: 'danger',
        title: 'Verification was not approved',
        body: reason ? `Reason given: ${reason}. ${LOCKED}` : `No reason was recorded. ${LOCKED}`,
      };
    }
    case 'suspended':
      return {
        tone: 'danger',
        title: 'Your profile is suspended',
        body: 'You can’t go online or receive job requests while suspended.',
      };
    case 'pending':
      return {
        tone: 'ochre',
        title: 'Your profile is not verified yet',
        body: `An admin needs to verify your profile. ${LOCKED}`,
      };
    default:
      return {
        tone: 'ochre',
        title: 'Verification status unavailable',
        body: `We couldn’t read your verification status. ${LOCKED}`,
      };
  }
}

/* ── Time ─────────────────────────────────────────────────────────────────── */

export const PLATFORM_TIME_ZONE = 'Asia/Kolkata';
/** India Standard Time is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight IST at the start of the IST day containing `now`, as a UTC instant. */
export function startOfDayIST(now: Date): Date {
  const shifted = now.getTime() + IST_OFFSET_MS;
  return new Date(shifted - (shifted % DAY_MS) - IST_OFFSET_MS);
}

/** Monday 00:00 IST of the week containing `now`, as a UTC instant. */
export function startOfWeekIST(now: Date): Date {
  const dayStart = startOfDayIST(now);
  // Weekday of the IST calendar date: 0 = Sunday … 6 = Saturday.
  const weekday = new Date(dayStart.getTime() + IST_OFFSET_MS).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return new Date(dayStart.getTime() - daysSinceMonday * DAY_MS);
}

/** True when `iso` falls on the same IST calendar day as `now`. */
export function isTodayIST(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const start = startOfDayIST(now).getTime();
  return t >= start && t < start + DAY_MS;
}

/** "14:05" for minutes and seconds left; "0:00" once expired. Hours are folded into minutes. */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Offer is still open: no expiry recorded, or expiry is in the future. */
export function isOfferOpen(offerExpiresAt: string | null | undefined, now: Date): boolean {
  if (!offerExpiresAt) return true;
  const t = new Date(offerExpiresAt).getTime();
  return Number.isNaN(t) ? true : t > now.getTime();
}

/* ── Bookings ─────────────────────────────────────────────────────────────── */

export type BookingTab = 'active' | 'upcoming' | 'past';
export const BOOKING_TABS: readonly BookingTab[] = ['active', 'upcoming', 'past'];

export function isBookingTab(value: unknown): value is BookingTab {
  return typeof value === 'string' && (BOOKING_TABS as readonly string[]).includes(value);
}

/** Job states where the professional is travelling or on site. */
const LIVE_STATES: ReadonlySet<string> = new Set(['on_the_way', 'arrived', 'assessing', 'in_progress', 'quote_pending']);

export function isLiveState(state: string | null | undefined): boolean {
  return state != null && LIVE_STATES.has(state);
}

/**
 * Which bookings tab a booking belongs to.
 *  - past: the job is completed, cancelled or closed, or the booking itself is cancelled/completed
 *  - upcoming: not yet live (no job, or waiting/accepted) and scheduled in the future
 *  - active: everything else (live work, or a booking whose start time has passed)
 */
export function bookingTab(
  input: { bookingStatus: string | null; jobState: string | null; scheduledStart: string | null },
  now: Date,
): BookingTab {
  const { bookingStatus, jobState, scheduledStart } = input;
  if ((jobState && isTerminal(jobState)) || bookingStatus === 'cancelled' || bookingStatus === 'completed') {
    return 'past';
  }
  if (isLiveState(jobState)) return 'active';
  const start = scheduledStart ? new Date(scheduledStart).getTime() : Number.NaN;
  if (!Number.isNaN(start) && start > now.getTime()) return 'upcoming';
  return 'active';
}

const BOOKING_STATUS_DISPLAY: Record<string, { label: string; tone: JobStateTone }> = {
  pending: { label: 'Pending', tone: 'neutral' },
  confirmed: { label: 'Confirmed', tone: 'teal' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

/**
 * Why an open booking has no professional, or null if it isn't waiting on one:
 *  - overdue: the start time passed with no professional confirmed. The matcher stops
 *    offering a visit once it has started, so nobody will be found for this slot.
 *  - unmatched: the matcher found nobody eligible yet (bookings.unmatched_since).
 */
export function missingProfessional(input: {
  bookingStatus: string | null;
  jobState: string | null;
  unmatchedSince?: string | null;
  startPassed?: boolean;
}): 'overdue' | 'unmatched' | null {
  const open = input.bookingStatus !== 'cancelled' && input.bookingStatus !== 'completed';
  if (!open || (input.jobState && input.jobState !== 'assigned')) return null;
  if (input.startPassed) return 'overdue';
  if (input.unmatchedSince) return 'unmatched';
  return null;
}

/**
 * Status shown for a booking: why there is no professional when there isn't one (see
 * `missingProfessional`), else the job's state once there is a job, else the booking's
 * own status.
 */
export function bookingStatusDisplay(input: {
  bookingStatus: string | null;
  jobState: string | null;
  unmatchedSince?: string | null;
  startPassed?: boolean;
}): { label: string; tone: JobStateTone } {
  const missing = missingProfessional(input);
  if (missing === 'overdue') return { label: 'No professional assigned', tone: 'ochre' };
  if (missing === 'unmatched') return { label: 'No professional yet', tone: 'ochre' };
  if (input.jobState && isJobState(input.jobState)) {
    const meta = STATE_META[input.jobState];
    return { label: meta.label, tone: meta.tone };
  }
  const status = input.bookingStatus ?? '';
  return (
    BOOKING_STATUS_DISPLAY[status] ?? {
      label: status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : 'Unknown',
      tone: 'neutral',
    }
  );
}

/* ── Customer action inbox ────────────────────────────────────────────────── */

/**
 * Payment is due on a booking when its job is completed, nothing has been paid and the
 * booking has a positive amount. Mirrors the pay section on `/customer/bookings/[id]`.
 */
export function isPaymentDue(input: {
  jobState: string | null;
  paymentStatuses: readonly string[];
  amount: number | string | null;
}): boolean {
  const amount = input.amount == null ? 0 : Number(input.amount);
  return input.jobState === 'completed' && !input.paymentStatuses.includes('paid') && amount > 0;
}

/**
 * A quote waits on the customer when it is `pending_customer`, its job is in
 * `quote_pending` and it has not expired. Mirrors the checks in `respond_to_quote()`.
 */
export function isQuoteAwaitingCustomer(
  input: { status: string; jobState: string | null; expiresAt: string | null },
  now: Date,
): boolean {
  if (input.status !== 'pending_customer' || input.jobState !== 'quote_pending') return false;
  return isOfferOpen(input.expiresAt, now);
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** "Thu 30 Oct, 10:30 am" in IST. */
export function formatSlot(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: PLATFORM_TIME_ZONE,
  }).format(d);
}

/** "10:30 am" in IST. */
export function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: PLATFORM_TIME_ZONE,
  }).format(d);
}

/** "Thursday, 30 October" in IST. */
export function formatLongDate(now: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: PLATFORM_TIME_ZONE,
  }).format(now);
}

/* ── Properties ───────────────────────────────────────────────────────────── */

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  house: 'House',
  apartment: 'Apartment',
  villa: 'Villa',
  office: 'Office',
  shop: 'Shop',
  rental: 'Rental',
  other: 'Other',
};

/** Display label for `properties.property_type`; unknown values are humanised, not hidden. */
export function propertyTypeLabel(type: string): string {
  const known = PROPERTY_TYPE_LABEL[type];
  if (known) return known;
  const words = type.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Property';
}

/* ── Offers ───────────────────────────────────────────────────────────────── */

function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * How an offered job is priced, from the booking's pricing_model and amounts. These are
 * customer prices; nothing here says what the professional is paid.
 */
export function offerPayBasis(input: {
  pricingModel: string | null;
  customerPrice: number | null;
  inspectionFee: number | null;
}): { label: string; detail: string } | null {
  switch (input.pricingModel) {
    case 'fixed':
      return input.customerPrice == null
        ? null
        : { label: 'Fixed price', detail: `${rupees(input.customerPrice)} customer price` };
    case 'inspection':
      return {
        label: 'Inspection',
        detail:
          input.inspectionFee == null
            ? 'Inspection, then your quote'
            : `${rupees(input.inspectionFee)} inspection fee, then your quote`,
      };
    case 'quote_after_inspection':
      return { label: 'Quote', detail: 'Priced by your quote after inspection' };
    default:
      return null;
  }
}

/** "Indiranagar, Bengaluru · 3.2 km" from get_offer_localities. */
export function offerLocalityLabel(
  locality: { area: string | null; city: string; distanceKm: number | null } | null,
): string | null {
  if (!locality) return null;
  const place = [locality.area, locality.city].filter(Boolean).join(', ');
  if (locality.distanceKm == null) return place;
  const km = locality.distanceKm < 10 ? locality.distanceKm.toFixed(1) : Math.round(locality.distanceKm).toString();
  return `${place} · ${km} km`;
}

/**
 * Median time a professional takes to answer an offer (professional_metrics), as shown to
 * customers. Null when there is no history.
 */
export function responseTimeLabel(seconds: number | null): string | null {
  if (seconds == null || seconds < 0) return null;
  if (seconds < 60) return 'Typically responds in under a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Typically responds in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `Typically responds in ${hours} hr`;
}
