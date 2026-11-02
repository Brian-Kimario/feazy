import { describe, expect, it } from 'vitest';
import { contactMessageSchema } from '@/validators';
import { referenceFor } from './rules';

const valid = { topic: 'booking', name: ' Asha ', email: ' Asha@Example.com ', message: 'My plumber has not arrived yet.' };

describe('contactMessageSchema', () => {
  it('normalises name and email and drops an empty booking reference', () => {
    const data = contactMessageSchema.parse({ ...valid, bookingRef: '  ' });
    expect(data).toMatchObject({ name: 'Asha', email: 'asha@example.com', bookingRef: undefined });
  });
  it('rejects a short message, bad email and unknown topic', () => {
    expect(contactMessageSchema.safeParse({ ...valid, message: 'hi' }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...valid, topic: 'refund' }).success).toBe(false);
  });
  it('keeps the honeypot value so the action can drop the message quietly', () => {
    expect(contactMessageSchema.parse({ ...valid, website: 'http://spam' }).website).toBe('http://spam');
  });
});

describe('referenceFor', () => {
  it('uses the first eight hex characters, uppercased', () => {
    expect(referenceFor('9b681bca-520d-462a-bd50-521c42f2b098')).toBe('FS-9B681BCA');
  });
});
