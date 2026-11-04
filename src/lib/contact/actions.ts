'use server';

import { createClient } from '@/lib/supabase/server';
import { fail, ok, parseInput, type ActionResult } from '@/lib/actions/result';
import { contactMessageSchema } from '@/validators';
import { referenceFor } from './rules';

/**
 * Stores a contact message from the public form. Visitors are anonymous under RLS: the policy only
 * allows a new row that is unattributed or the caller's own, so user_id comes from the session here,
 * never from the form. The reference is derived from the row id (the same expression the table uses).
 */
export async function submitContactMessageAction(input: unknown): Promise<ActionResult<{ reference: string }>> {
  const parsed = parseInput(contactMessageSchema, input);
  if (parsed.success === false) return parsed;
  const { topic, name, email, bookingRef, message, website } = parsed.data;

  // A filled honeypot is a bot. Answer as if it worked so it learns nothing.
  if (website) return ok({ reference: referenceFor(crypto.randomUUID()) });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const id = crypto.randomUUID();
  const { error } = await supabase.from('contact_messages').insert({
    id,
    topic,
    name,
    email,
    booking_ref: bookingRef ?? null,
    message,
    user_id: user?.id ?? null,
  });

  if (error) {
    if (error.message.includes('contact_rate_limited')) {
      return fail('rejected', 'You have sent several messages recently. Please wait an hour or email support@feazy.com.');
    }
    return fail('failed', 'We could not send your message. Please try again, or email support@feazy.com.');
  }
  return ok({ reference: referenceFor(id) });
}
