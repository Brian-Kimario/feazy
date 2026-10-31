#!/usr/bin/env python3
"""Builds supabase/migrations/20261031_108_consistent_lock_order.sql from the LIVE function definitions
(pg_get_functiondef dumps passed as arguments) with exact, asserted textual replacements.
Usage: gen_108_migration.py <dir with live_<name>.sql dumps> > migration.sql
Every replacement must match exactly once, so a drifted definition fails loudly instead of silently."""
import sys, os

d = sys.argv[1]
def live(name):
    t = open(os.path.join(d, 'live_%s.sql' % name)).read().strip()
    assert t.startswith('CREATE OR REPLACE FUNCTION'), name
    return t

def sub(text, old, new, label):
    assert text.count(old) == 1, '%s: expected exactly one match, found %d' % (label, text.count(old))
    return text.replace(old, new)

HEADER = open(os.path.join(os.path.dirname(__file__), 'gen_108_header.sql')).read()

out = [HEADER]

# 1. admin_cancel_job: booking first, then job (was job, then booking)
t = live('admin_cancel_job')
t = sub(t, """  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;""", """  -- Lock order: booking, then job (the canonical order; see 20261031_108).
  SELECT booking_id INTO v_booking_id FROM public.jobs WHERE id = p_job_id;
  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT booking_status INTO v_booking_status FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;""", 'admin_cancel_job lock')
t = sub(t, "  v_booking_status text;\n", "  v_booking_status text;\n  v_booking_id uuid;\n", 'admin_cancel_job decl')
t = sub(t, """  SELECT booking_status INTO v_booking_status FROM public.bookings WHERE id = v_job.booking_id FOR UPDATE;
  IF v_booking_status IS NOT NULL""", """  IF v_booking_status IS NOT NULL""", 'admin_cancel_job late lock')
out.append(t + ';\n')

# 2. _release_offer: booking first, then job; an expiry is re-checked under the lock
t = live('_release_offer')
t = sub(t, """  SELECT * INTO v_job FROM public.jobs
  WHERE id = p_job_id AND current_state = 'assigned' AND professional_id IS NOT NULL
  FOR UPDATE;""", """  -- Lock order: booking, then job. _offer_next takes the same order, so the whole call is consistent.
  SELECT booking_id INTO v_booking_id FROM public.jobs WHERE id = p_job_id;
  IF v_booking_id IS NOT NULL THEN
    PERFORM 1 FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
  END IF;
  SELECT * INTO v_job FROM public.jobs
  WHERE id = p_job_id AND current_state = 'assigned' AND professional_id IS NOT NULL
    AND (p_outcome <> 'expired' OR offer_expires_at < now())
  FOR UPDATE;""", '_release_offer lock')
t = sub(t, "  v_decision uuid;\n", "  v_decision uuid;\n  v_booking_id uuid;\n", '_release_offer decl')
out.append(t + ';\n')

# 3. process_assignment_queue: never wait on a lock; lock the booking, not the job
t = live('process_assignment_queue')
t = sub(t, """    SELECT id, professional_id FROM public.jobs
    WHERE current_state = 'assigned'
      AND professional_id IS NOT NULL
      AND offer_expires_at IS NOT NULL
      AND offer_expires_at < now()
    FOR UPDATE SKIP LOCKED""", """    SELECT j.id, j.professional_id FROM public.jobs j
    JOIN public.bookings b ON b.id = j.booking_id
    WHERE j.current_state = 'assigned'
      AND j.professional_id IS NOT NULL
      AND j.offer_expires_at IS NOT NULL
      AND j.offer_expires_at < now()
    ORDER BY j.booking_id
    FOR UPDATE OF b SKIP LOCKED""", 'queue expiry loop')
t = sub(t, """      AND (j.id IS NULL OR (j.current_state = 'assigned' AND j.professional_id IS NULL))
  LOOP""", """      AND (j.id IS NULL OR (j.current_state = 'assigned' AND j.professional_id IS NULL))
    ORDER BY b.id
    FOR UPDATE OF b SKIP LOCKED
  LOOP""", 'queue offer loop')
out.append(t + ';\n')

# 4. suspension: no job locks before the booking; deterministic booking order
t = live('admin_transition_professional_verification')
t = sub(t, """      SELECT id FROM public.jobs
      WHERE professional_id = p_professional_id AND current_state = 'assigned'
      ORDER BY created_at
      FOR UPDATE
    LOOP""", """      SELECT id FROM public.jobs
      WHERE professional_id = p_professional_id AND current_state = 'assigned'
      ORDER BY booking_id
    LOOP""", 'suspension loop')
out.append(t + ';\n')

print('\n'.join(out))
