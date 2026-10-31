#!/usr/bin/env python3
"""Generates 20261031_108_consistent_lock_order.dryrun.sql (a DO block that ends by raising its report).
Run: python3 gen_108.py > 20261031_108_consistent_lock_order.dryrun.sql
Execute (never commits; see docs/A3_LOCK_ORDER_DESIGN.md):
  (echo 'BEGIN;'; cat ../migrations/20261031_108_consistent_lock_order.sql; cat 20261031_108_consistent_lock_order.dryrun.sql)
All fixtures are synthetic rows created inside the transaction; the final RAISE aborts everything.
"""
ADMIN = 'a56652e0-6cce-471c-9926-d168b288a123'
CUST = '9b681bca-520d-462a-bd50-521c42f2b098'
PRO = '3e86d907-43e8-4b5f-80a3-fd17da3932bd'
OTHER = '70738ef6-019e-4c3c-877f-8e6490d0399e'  # customer.b@fixify.dev, a designated test account
TEMPLATE_BOOKING = 'c9bca247-db78-40fa-b216-1b699f151e03'

def jwt(sub):
    return "'{\"sub\":\"%s\",\"role\":\"authenticated\"}'" % sub if sub else "'{}'"

cases = []
def case(name, setup='', actor=CUST, role='authenticated', body='', checks="'{}'::jsonb"):
    cases.append((name, setup, actor, role, body, checks))

def mk(job_state, status='pending', pro=None, offer=False, expired=False):
    js = "NULL" if job_state is None else "'%s'" % job_state
    p = "NULL" if pro is None else "'%s'" % pro
    s = "bk := pg_temp.mk(%s, '%s', %s, %s); jb := (select id from public.jobs where booking_id = bk);" % (js, status, p, 'true' if offer else 'false')
    if expired:
        s += " update public.jobs set offer_expires_at = now() - interval '5 minutes' where id = jb;"
    return s

STATE = "'booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk)"
ATT = lambda o: "'att_%s',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='%s')" % (o, o)

# admin_cancel_job (lock order changed)
case('e01 admin cancel: assigned job with offer, offer withdrawn, record written', actor=ADMIN, setup=mk('assigned', pro=PRO, offer=True),
     body="r := public.admin_cancel_job(jb,'assigned','lock order dry run','other');",
     checks="jsonb_build_object(%s,%s,'record',(select count(*) from public.admin_job_cancellations where job_id=jb),'pro_notified',(select count(*) from public.notifications where job_id=jb and user_id='%s' and kind='job_cancelled'))" % (STATE, ATT('withdrawn'), PRO))
case('e02 admin cancel: accepted job', actor=ADMIN, setup=mk('accepted', pro=PRO),
     body="r := public.admin_cancel_job(jb,'accepted','lock order dry run','customer_request');",
     checks="jsonb_build_object(%s,'record',(select count(*) from public.admin_job_cancellations where job_id=jb))" % STATE)
case('e03 admin cancel: stale expected state refused, untouched', actor=ADMIN, setup=mk('accepted', pro=PRO),
     body="r := public.admin_cancel_job(jb,'assigned','lock order dry run','other');", checks="jsonb_build_object(%s)" % STATE)
case('e04 admin cancel: non-admin refused', actor=CUST, setup=mk('accepted', pro=PRO),
     body="r := public.admin_cancel_job(jb,'accepted','lock order dry run','other');", checks="jsonb_build_object(%s)" % STATE)
case('e05 admin cancel: unknown job', actor=ADMIN, body="r := public.admin_cancel_job(gen_random_uuid(),'accepted','lock order dry run','other');")
case('e06 admin cancel: paid payment preserved and counted', actor=ADMIN,
     setup=mk('accepted', pro=PRO) + " insert into public.payments (customer_id,payment_type,amount,status,job_id,booking_id,provider,provider_reference) values ('%s','service',1,'paid',jb,bk,'dryrun','dryrun-paid108');" % CUST,
     body="r := public.admin_cancel_job(jb,'accepted','lock order dry run','other');",
     checks="jsonb_build_object(%s,'paid',(select count(*) from public.payments where booking_id=bk and status='paid'))" % STATE)
case('e07 admin cancel: duplicate is refused cleanly', actor=ADMIN, setup=mk('accepted', pro=PRO),
     body="r := public.admin_cancel_job(jb,'accepted','lock order dry run','other'); r2 := public.admin_cancel_job(jb,'accepted','lock order dry run','other'); r := jsonb_build_object('first',r,'second',r2);",
     checks="jsonb_build_object(%s,'records',(select count(*) from public.admin_job_cancellations where job_id=jb))" % STATE)

# _release_offer via decline_job
case('e08 decline: professional declines, attempt recorded, job offered onward or unassigned', actor=PRO, setup=mk('assigned', pro=PRO, offer=True),
     body="r := public.decline_job(jb,'schedule_conflict',NULL);",
     checks="jsonb_build_object(%s,%s,'pro',(select professional_id from public.jobs where id=jb))" % (STATE, ATT('declined')))
case('e09 decline: another professional cannot decline', actor=OTHER, setup=mk('assigned', pro=PRO, offer=True),
     body="r := public.decline_job(jb,'schedule_conflict',NULL);", checks="jsonb_build_object(%s)" % STATE)

# _release_offer via the queue
case('e10 queue: an expired offer is released (expired attempt)', actor=None, role='postgres', setup=mk('assigned', pro=PRO, offer=True, expired=True),
     body="r := public.process_assignment_queue();", checks="jsonb_build_object(%s,%s)" % (STATE, ATT('expired')))
case('e11 queue: an unexpired offer is left alone', actor=None, role='postgres', setup=mk('assigned', pro=PRO, offer=True),
     body="r := public.process_assignment_queue();", checks="jsonb_build_object(%s,%s,'pro',(select professional_id from public.jobs where id=jb))" % (STATE, ATT('expired')))
case('e12 _release_offer(expired) re-checks the deadline under the lock', actor=None, role='postgres', setup=mk('assigned', pro=PRO, offer=True),
     body="r := to_jsonb(public._release_offer(jb,'expired','offer_expired',NULL,NULL));", checks="jsonb_build_object(%s,%s,'pro',(select professional_id from public.jobs where id=jb))" % (STATE, ATT('expired')))
case('e13 queue: a cancelled booking with a stale expired offer is not touched', actor=None, role='postgres',
     setup=mk('assigned', pro=PRO, offer=True, expired=True) + " update public.bookings set booking_status='cancelled' where id=bk;",
     body="r := public.process_assignment_queue();", checks="jsonb_build_object(%s)" % STATE)

# suspension
case('e14 suspension withdraws the pending offer (booking then job order)', actor=ADMIN, setup=mk('assigned', pro=PRO, offer=True),
     body="r := public.admin_transition_professional_verification('%s','suspend','verified','lock order dry run suspension','{}'::jsonb);" % PRO,
     checks="jsonb_build_object(%s,%s,'verification',(select verification_status from public.professional_profiles where user_id='%s'))" % (STATE, ATT('withdrawn'), PRO))
case('e15 suspension does not cancel an accepted job', actor=ADMIN, setup=mk('accepted', pro=PRO),
     body="r := public.admin_transition_professional_verification('%s','suspend','verified','lock order dry run suspension','{}'::jsonb);" % PRO,
     checks="jsonb_build_object(%s)" % STATE)

# customer cancel and matcher regression
case('e16 customer cancel: assigned with offer still works', setup=mk('assigned', pro=PRO, offer=True),
     body="r := public.customer_cancel_booking(bk,'assigned','changed_my_mind','dry run');", checks="jsonb_build_object(%s,%s)" % (STATE, ATT('withdrawn')))
case('e17 customer cancel: no job still works', setup=mk(None),
     body="r := public.customer_cancel_booking(bk,'no_job','changed_my_mind','dry run');", checks="jsonb_build_object(%s)" % STATE)
case('e18 queue still runs on a pending booking (no error)', actor=None, role='postgres', setup=mk(None),
     body="r := public.process_assignment_queue();", checks="jsonb_build_object(%s)" % STATE)

HELPER = """CREATE FUNCTION pg_temp.mk(p_job_state text, p_status text, p_pro uuid, p_offer boolean) RETURNS uuid
LANGUAGE plpgsql AS $mk$
DECLARE v_b uuid; v_t public.bookings%%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.bookings WHERE id = '%s';
  INSERT INTO public.bookings (customer_id, property_id, service_id, scheduled_start, pricing_model, quoted_or_base_amount, booking_status)
  VALUES (v_t.customer_id, v_t.property_id, v_t.service_id, now() + interval '3 days', v_t.pricing_model, v_t.quoted_or_base_amount, p_status)
  RETURNING id INTO v_b;
  IF p_job_state IS NOT NULL THEN
    INSERT INTO public.jobs (booking_id, customer_id, property_id, current_state, professional_id, offer_expires_at)
    VALUES (v_b, v_t.customer_id, v_t.property_id, p_job_state, p_pro,
            CASE WHEN p_offer THEN now() + interval '30 minutes' END);
  END IF;
  RETURN v_b;
END $mk$;
""" % TEMPLATE_BOOKING

out = [HELPER]
out.append("""DO $dry$
DECLARE
  out jsonb := '[]'::jsonb;
  r jsonb; r2 jsonb; c jsonb;
  bk uuid; jb uuid; n int;
BEGIN
""")
for name, setup, actor, role, body, checks in cases:
    out.append("""  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    %s
    PERFORM set_config('request.jwt.claims', %s, true);
    PERFORM set_config('request.jwt.claim.sub', '%s', true);
    EXECUTE 'SET LOCAL ROLE %s';
    BEGIN
      %s
      EXECUTE 'RESET ROLE';
      c := %s;
      out := out || jsonb_build_object('case', %s::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := %s;
      out := out || jsonb_build_object('case', %s::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
""" % (setup, jwt(actor), actor or '', role, body, checks, "$n$%s$n$" % name, checks, "$n$%s$n$" % name))
out.append("""  RAISE EXCEPTION 'DRYRUN_REPORT %', jsonb_pretty(jsonb_build_object('cases', out));
END
$dry$;
""")
print(''.join(out))
