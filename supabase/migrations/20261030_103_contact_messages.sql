-- Public contact form: stores messages so they reach the team and get a real reference.
-- Anyone (including signed-out visitors) may insert; only staff and the sender can read.

CREATE TABLE public.contact_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference   text GENERATED ALWAYS AS ('FS-' || upper(substr(replace(id::text, '-', ''), 1, 8))) STORED,
  topic       text NOT NULL CHECK (topic IN ('booking', 'payment', 'professional', 'account', 'partnership', 'other')),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email       text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  booking_ref text CHECK (booking_ref IS NULL OR char_length(booking_ref) <= 60),
  message     text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 3000),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'resolved')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX contact_messages_reference_key ON public.contact_messages (reference);
CREATE INDEX contact_messages_status_created_idx ON public.contact_messages (status, created_at DESC);
CREATE INDEX contact_messages_email_created_idx ON public.contact_messages (email, created_at DESC);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.contact_messages FROM anon, authenticated;
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT ON public.contact_messages TO authenticated;
GRANT UPDATE (status) ON public.contact_messages TO authenticated;

-- Visitors can only create new, unattributed-or-own messages; they cannot choose a status.
CREATE POLICY contact_messages_insert ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'new' AND (user_id IS NULL OR user_id = auth.uid()));

CREATE POLICY contact_messages_select_own ON public.contact_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY contact_messages_staff_select ON public.contact_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin'::user_role, 'support'::user_role)));

CREATE POLICY contact_messages_staff_update ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin'::user_role, 'support'::user_role)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin'::user_role, 'support'::user_role)));

-- Abuse guard that holds across server instances: at most 5 messages per address per hour.
CREATE OR REPLACE FUNCTION public.contact_messages_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.contact_messages
      WHERE email = NEW.email AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'contact_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.contact_messages_rate_limit() FROM PUBLIC;

CREATE TRIGGER contact_messages_rate_limit
  BEFORE INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.contact_messages_rate_limit();
