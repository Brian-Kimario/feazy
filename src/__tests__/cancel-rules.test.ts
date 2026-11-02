import { describe, it, expect } from 'vitest';
import { cancelOffer, expectedCancelState } from '@/lib/bookings/cancel-rules';

describe('cancelOffer', () => {
  it.each([null, 'assigned', 'accepted', 'on_the_way'])(
    'offers cancel for a pending booking with job state %s',
    (s) => expect(cancelOffer('pending', s)).toBe('offer'),
  );
  it.each(['arrived', 'quote_pending', 'in_progress'])('asks for review at job state %s', (s) =>
    expect(cancelOffer('pending', s)).toBe('request_review'));
  it.each(['completed', 'closed', 'cancelled'])('offers nothing for job state %s', (s) =>
    expect(cancelOffer('pending', s)).toBe('none'));
  it.each(['cancelled', 'completed'])('offers nothing for booking %s', (b) =>
    expect(cancelOffer(b, null)).toBe('none'));
});

describe('expectedCancelState', () => {
  it('is no_job without a job, else the job state', () => {
    expect(expectedCancelState(null)).toBe('no_job');
    expect(expectedCancelState('accepted')).toBe('accepted');
  });
});
