import { describe, expect, it } from 'vitest';
import {
  responseTimeLabel,
  bookingStatusDisplay,
  missingProfessional,
  bookingTab,
  formatCountdown,
  initialsOf,
  isOfferOpen,
  isPaymentDue,
  isQuoteAwaitingCustomer,
  offerLocalityLabel,
  offerPayBasis,
  propertyTypeLabel,
  isTodayIST,
  startOfDayIST,
  startOfWeekIST,
  verificationNotice,
} from './rules';

describe('verificationNotice', () => {
  it('returns nothing for verified professionals', () => {
    expect(verificationNotice('verified')).toBeNull();
  });

  it.each(['pending', 'documents_submitted', 'under_review', 'suspended'])('explains %s', (status) => {
    const notice = verificationNotice(status);
    expect(notice).not.toBeNull();
    expect(notice?.body).toMatch(/can’t go online/);
  });

  it('quotes the recorded rejection reason', () => {
    expect(verificationNotice('rejected', 'ID photo unreadable')?.body).toContain('ID photo unreadable');
    expect(verificationNotice('rejected', '  ')?.body).toContain('No reason was recorded');
  });

  it('does not pretend to know an unknown status', () => {
    expect(verificationNotice(null)?.title).toBe('Verification status unavailable');
    expect(verificationNotice('something_new')?.title).toBe('Verification status unavailable');
  });
});

describe('IST day and week boundaries', () => {
  it('starts the IST day at 18:30 UTC the previous day', () => {
    // 2026-10-29 02:00 IST is 2026-10-28 20:30 UTC
    expect(startOfDayIST(new Date('2026-10-28T20:30:00Z')).toISOString()).toBe('2026-10-28T18:30:00.000Z');
  });

  it('starts the week on Monday 00:00 IST', () => {
    // Thursday 29 Oct 2026, 15:00 IST
    expect(startOfWeekIST(new Date('2026-10-29T09:30:00Z')).toISOString()).toBe('2026-10-25T18:30:00.000Z');
  });

  it('keeps Monday 00:10 IST in the new week and Sunday 23:50 IST in the old one', () => {
    expect(startOfWeekIST(new Date('2026-10-25T18:40:00Z')).toISOString()).toBe('2026-10-25T18:30:00.000Z');
    expect(startOfWeekIST(new Date('2026-10-25T18:20:00Z')).toISOString()).toBe('2026-10-18T18:30:00.000Z');
  });

  it('treats Sunday as the last day of the week', () => {
    // Sunday 1 Nov 2026, 12:00 IST
    expect(startOfWeekIST(new Date('2026-11-01T06:30:00Z')).toISOString()).toBe('2026-10-25T18:30:00.000Z');
  });

  it('matches times on the same IST calendar day', () => {
    const now = new Date('2026-10-29T09:30:00Z');
    expect(isTodayIST('2026-10-28T18:30:00Z', now)).toBe(true);
    expect(isTodayIST('2026-10-29T18:29:59Z', now)).toBe(true);
    expect(isTodayIST('2026-10-29T18:30:00Z', now)).toBe(false);
    expect(isTodayIST(null, now)).toBe(false);
  });
});

describe('offer countdown', () => {
  it('formats minutes and seconds', () => {
    expect(formatCountdown(29 * 60_000 + 5_000)).toBe('29:05');
    expect(formatCountdown(59_999)).toBe('0:59');
    expect(formatCountdown(-1)).toBe('0:00');
  });

  it('treats a missing expiry as open and a past one as closed', () => {
    const now = new Date('2026-10-29T10:00:00Z');
    expect(isOfferOpen(null, now)).toBe(true);
    expect(isOfferOpen('2026-10-29T10:00:01Z', now)).toBe(true);
    expect(isOfferOpen('2026-10-29T10:00:00Z', now)).toBe(false);
  });
});

describe('bookingTab', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const future = '2026-10-30T10:00:00Z';
  const past = '2026-10-28T10:00:00Z';

  it('puts finished or cancelled work in past', () => {
    expect(bookingTab({ bookingStatus: 'confirmed', jobState: 'completed', scheduledStart: future }, now)).toBe('past');
    expect(bookingTab({ bookingStatus: 'confirmed', jobState: 'cancelled', scheduledStart: future }, now)).toBe('past');
    expect(bookingTab({ bookingStatus: 'cancelled', jobState: null, scheduledStart: future }, now)).toBe('past');
  });

  it('puts live work in active regardless of schedule', () => {
    expect(bookingTab({ bookingStatus: 'confirmed', jobState: 'on_the_way', scheduledStart: future }, now)).toBe('active');
    expect(bookingTab({ bookingStatus: 'confirmed', jobState: 'quote_pending', scheduledStart: future }, now)).toBe('active');
  });

  it('puts waiting work in upcoming until its start time', () => {
    expect(bookingTab({ bookingStatus: 'pending', jobState: null, scheduledStart: future }, now)).toBe('upcoming');
    expect(bookingTab({ bookingStatus: 'confirmed', jobState: 'accepted', scheduledStart: future }, now)).toBe('upcoming');
    expect(bookingTab({ bookingStatus: 'confirmed', jobState: 'accepted', scheduledStart: past }, now)).toBe('active');
    expect(bookingTab({ bookingStatus: 'pending', jobState: null, scheduledStart: null }, now)).toBe('active');
  });
});

describe('customer action inbox', () => {
  it('flags payment only for completed, unpaid, positive bookings', () => {
    expect(isPaymentDue({ jobState: 'completed', paymentStatuses: [], amount: '499.00' })).toBe(true);
    expect(isPaymentDue({ jobState: 'completed', paymentStatuses: ['failed'], amount: 499 })).toBe(true);
    expect(isPaymentDue({ jobState: 'completed', paymentStatuses: ['failed', 'paid'], amount: 499 })).toBe(false);
    expect(isPaymentDue({ jobState: 'completed', paymentStatuses: [], amount: 0 })).toBe(false);
    expect(isPaymentDue({ jobState: 'completed', paymentStatuses: [], amount: null })).toBe(false);
    expect(isPaymentDue({ jobState: 'in_progress', paymentStatuses: [], amount: 499 })).toBe(false);
  });

  it('flags quotes the customer can still answer', () => {
    const now = new Date('2026-10-29T10:00:00Z');
    const base = { status: 'pending_customer', jobState: 'quote_pending', expiresAt: null };
    expect(isQuoteAwaitingCustomer(base, now)).toBe(true);
    expect(isQuoteAwaitingCustomer({ ...base, status: 'pending_customer_approval' }, now)).toBe(false);
    expect(isQuoteAwaitingCustomer({ ...base, jobState: 'in_progress' }, now)).toBe(false);
    expect(isQuoteAwaitingCustomer({ ...base, expiresAt: '2026-10-29T09:00:00Z' }, now)).toBe(false);
  });
});

describe('initialsOf', () => {
  it('uses first and last names', () => {
    expect(initialsOf('Asha Devi Rao')).toBe('AR');
    expect(initialsOf('naveen')).toBe('NA');
    expect(initialsOf('  ')).toBe('?');
  });
});

describe('bookingStatusDisplay', () => {
  it('uses the job state once there is a job', () => {
    expect(bookingStatusDisplay({ bookingStatus: 'confirmed', jobState: 'on_the_way' })).toEqual({
      label: 'On the way',
      tone: 'teal',
    });
  });

  it('falls back to the booking status', () => {
    expect(bookingStatusDisplay({ bookingStatus: 'pending', jobState: null }).label).toBe('Pending');
    expect(bookingStatusDisplay({ bookingStatus: 'awaiting_slot', jobState: null })).toEqual({
      label: 'Awaiting slot',
      tone: 'neutral',
    });
  });
});

describe('propertyTypeLabel', () => {
  it('labels known types', () => {
    expect(propertyTypeLabel('villa')).toBe('Villa');
    expect(propertyTypeLabel('apartment')).toBe('Apartment');
  });

  it('humanises unknown types instead of hiding them', () => {
    expect(propertyTypeLabel('farm_house')).toBe('Farm house');
    expect(propertyTypeLabel('')).toBe('Property');
  });
});

describe('offerPayBasis', () => {
  it('shows the customer price for fixed-price jobs', () => {
    expect(offerPayBasis({ pricingModel: 'fixed', customerPrice: 1499, inspectionFee: null })).toEqual({
      label: 'Fixed price',
      detail: '₹1,499 customer price',
    });
  });
  it('hides a fixed price with no amount instead of showing ₹0', () => {
    expect(offerPayBasis({ pricingModel: 'fixed', customerPrice: null, inspectionFee: null })).toBeNull();
  });
  it('shows the inspection fee then the quote', () => {
    expect(offerPayBasis({ pricingModel: 'inspection', customerPrice: 299, inspectionFee: 299 })?.detail).toBe(
      '₹299 inspection fee, then your quote',
    );
  });
  it('describes quote-after-inspection without an amount', () => {
    expect(
      offerPayBasis({ pricingModel: 'quote_after_inspection', customerPrice: null, inspectionFee: null })?.detail,
    ).toBe('Priced by your quote after inspection');
  });
  it('returns nothing for an unknown model', () => {
    expect(offerPayBasis({ pricingModel: 'hourly', customerPrice: 100, inspectionFee: null })).toBeNull();
  });
});

describe('offerLocalityLabel', () => {
  it('joins area and city', () => {
    expect(offerLocalityLabel({ area: 'Indiranagar', city: 'Bengaluru', distanceKm: null })).toBe(
      'Indiranagar, Bengaluru',
    );
  });
  it('adds distance when the matcher measured it', () => {
    expect(offerLocalityLabel({ area: null, city: 'Pune', distanceKm: 3.24 })).toBe('Pune · 3.2 km');
    expect(offerLocalityLabel({ area: 'Baner', city: 'Pune', distanceKm: 12.6 })).toBe('Baner, Pune · 13 km');
  });
  it('is empty without a locality', () => {
    expect(offerLocalityLabel(null)).toBeNull();
  });
});

describe('bookingStatusDisplay while unmatched', () => {
  it('says no professional yet for an open unmatched booking', () => {
    expect(
      bookingStatusDisplay({ bookingStatus: 'pending', jobState: 'assigned', unmatchedSince: '2026-10-30T10:00:00Z' }),
    ).toEqual({ label: 'No professional yet', tone: 'ochre' });
    expect(
      bookingStatusDisplay({ bookingStatus: 'pending', jobState: null, unmatchedSince: '2026-10-30T10:00:00Z' }).label,
    ).toBe('No professional yet');
  });
  it('ignores the flag once the booking is cancelled or the job has moved on', () => {
    expect(
      bookingStatusDisplay({ bookingStatus: 'cancelled', jobState: null, unmatchedSince: '2026-10-30T10:00:00Z' }).label,
    ).toBe('Cancelled');
    expect(
      bookingStatusDisplay({ bookingStatus: 'confirmed', jobState: 'accepted', unmatchedSince: '2026-10-30T10:00:00Z' }).label,
    ).not.toBe('No professional yet');
  });
});

describe('responseTimeLabel', () => {
  it('returns null without history', () => {
    expect(responseTimeLabel(null)).toBeNull();
  });
  it('formats seconds, minutes and hours', () => {
    expect(responseTimeLabel(30)).toBe('Typically responds in under a minute');
    expect(responseTimeLabel(12 * 60 + 10)).toBe('Typically responds in 12 min');
    expect(responseTimeLabel(2 * 3600 + 100)).toBe('Typically responds in 2 hr');
  });
});

describe('missingProfessional', () => {
  it('is overdue once the start passes with no accepted job', () => {
    expect(missingProfessional({ bookingStatus: 'pending', jobState: null, startPassed: true })).toBe('overdue');
    expect(missingProfessional({ bookingStatus: 'pending', jobState: 'assigned', startPassed: true })).toBe('overdue');
  });

  it('prefers overdue to unmatched', () => {
    expect(
      missingProfessional({ bookingStatus: 'pending', jobState: 'assigned', unmatchedSince: '2026-10-30T10:00:00Z', startPassed: true }),
    ).toBe('overdue');
  });

  // The unmatched queue (getUnmatchedBookings) keeps a row only when this returns a reason.
  // Cases follow the real job states: TERMINAL_STATES = completed, cancelled, closed.
  describe('unmatched queue membership', () => {
    const past = '2026-10-30T10:00:00Z';
    const queueReason = (input: { bookingStatus: string; jobState: string | null; unmatchedSince: string | null }) =>
      missingProfessional({ ...input, startPassed: true });

    it('keeps a booking without a job (no professional yet)', () => {
      expect(queueReason({ bookingStatus: 'pending', jobState: null, unmatchedSince: past })).toBe('overdue');
    });

    it('keeps a booking whose job is still assigned and unfilled', () => {
      expect(queueReason({ bookingStatus: 'pending', jobState: 'assigned', unmatchedSince: past })).toBe('overdue');
    });

    it.each(['completed', 'closed', 'cancelled'] as const)('drops a booking whose job is %s', (jobState) => {
      expect(queueReason({ bookingStatus: 'pending', jobState, unmatchedSince: past })).toBeNull();
    });

    it('drops a booking whose status is already completed or cancelled', () => {
      expect(queueReason({ bookingStatus: 'completed', jobState: null, unmatchedSince: past })).toBeNull();
      expect(queueReason({ bookingStatus: 'cancelled', jobState: null, unmatchedSince: past })).toBeNull();
    });

    it('drops any booking whose job has moved past assignment', () => {
      for (const jobState of ['accepted', 'on_the_way', 'arrived', 'assessing', 'in_progress', 'quote_pending']) {
        expect(queueReason({ bookingStatus: 'pending', jobState, unmatchedSince: past })).toBeNull();
      }
    });
  });

  it('is null once a professional accepted, or the booking is closed', () => {
    expect(missingProfessional({ bookingStatus: 'pending', jobState: 'in_progress', startPassed: true })).toBeNull();
    expect(missingProfessional({ bookingStatus: 'cancelled', jobState: null, startPassed: true })).toBeNull();
    expect(missingProfessional({ bookingStatus: 'pending', jobState: null })).toBeNull();
  });

  it('labels an overdue booking', () => {
    expect(bookingStatusDisplay({ bookingStatus: 'pending', jobState: null, startPassed: true })).toEqual({
      label: 'No professional assigned',
      tone: 'ochre',
    });
  });
});
