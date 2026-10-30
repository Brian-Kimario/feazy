#!/usr/bin/env python3
"""Generates 20261030_107_customer_cancel_booking.dryrun.sql (a DO block that ends by raising its report).
Run: python3 gen_107.py > 20261030_107_customer_cancel_booking.dryrun.sql
Execute (never commits; see docs/P1_BOOKING_CANCEL_DESIGN.md):
  (echo 'BEGIN;'; cat ../migrations/20261030_107_customer_cancel_booking.sql; cat 20261030_107_customer_cancel_booking.dryrun.sql)
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

def mk(job_state, status='pending', pro=None, offer=False):
    js = "NULL" if job_state is None else "'%s'" % job_state
    p = "NULL" if pro is None else "'%s'" % pro
    return "bk := pg_temp.mk(%s, '%s', %s, %s); jb := (select id from public.jobs where booking_id = bk);" % (js, status, p, 'true' if offer else 'false')

CANCEL = "public.customer_cancel_booking(bk, '%s', 'changed_my_mind', 'dry run')"
def cancel(expected): return CANCEL % expected

STATE = "'booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk)"
BEV = "'booking_events',(select count(*) from public.booking_events where booking_id=bk)"
JEV = "'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled')"

case('d01 unauthenticated caller', actor=None, setup=mk('assigned', pro=None), body="r := %s;" % cancel('assigned'))
case('d02 anon role has no execute', actor=None, role='anon', setup=mk('assigned'), body="r := %s;" % cancel('assigned'))
case("d03 another customer: reported as not found, booking untouched", actor=OTHER, setup=mk('accepted', pro=PRO),
     body="r := %s;" % cancel('accepted'), checks="jsonb_build_object(%s)" % STATE)
case('d04 the assigned professional cannot use the customer call', actor=PRO, setup=mk('accepted', pro=PRO),
     body="r := %s;" % cancel('accepted'), checks="jsonb_build_object(%s)" % STATE)
case('d05 an admin cannot use the customer call (admin_cancel_job is theirs)', actor=ADMIN, setup=mk('accepted', pro=PRO),
     body="r := %s;" % cancel('accepted'), checks="jsonb_build_object(%s)" % STATE)
case('d06 invalid reason category', setup=mk('assigned'),
     body="r := public.customer_cancel_booking(bk,'assigned','because',NULL);")
case('d07 note over 300 characters', setup=mk('assigned'),
     body="r := public.customer_cancel_booking(bk,'assigned','other',repeat('x',301));")
case('d08 null expected state', setup=mk('assigned'),
     body="r := public.customer_cancel_booking(bk,NULL,'other',NULL);")
case('d09 unknown booking', body="r := public.customer_cancel_booking(gen_random_uuid(),'assigned','other',NULL);")
case('d10 stale expected state: refused, nothing written', setup=mk('accepted', pro=PRO),
     body="r := %s;" % cancel('assigned'), checks="jsonb_build_object(%s,%s)" % (STATE, BEV))
case('d11 HAPPY: no professional matched yet (no job)', setup=mk(None),
     body="r := %s;" % cancel('no_job'),
     checks=("jsonb_build_object(%s,%s,'event',(select jsonb_build_object('from',from_status,'to',to_status,'actor',actor_user_id,'role',actor_role,'type',event_type,'reason',reason) from public.booking_events where booking_id=bk),"
             "'unmatched_since',(select unmatched_since from public.bookings where id=bk))") % (STATE, BEV))
case('d12 HAPPY: job assigned, no offer holder', setup=mk('assigned'),
     body="r := %s;" % cancel('assigned'),
     checks="jsonb_build_object(%s,%s,%s,'attempts',(select count(*) from public.booking_assignment_attempts where booking_id=bk))" % (STATE, BEV, JEV))
case('d13 HAPPY: outstanding offer withdrawn, professional notified', setup=mk('assigned', pro=PRO, offer=True),
     body="r := %s;" % cancel('assigned'),
     checks=("jsonb_build_object(%s,%s,%s,'offer_expires_at',(select offer_expires_at from public.jobs where id=jb),"
             "'withdrawn',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='withdrawn' and reason_code='job_cancelled'),"
             "'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='%s' and kind='job_cancelled'),"
             "'customer_notifications',(select count(*) from public.notifications n where n.job_id=jb and n.user_id=(select customer_id from public.jobs where id=jb)))") % (STATE, BEV, JEV, PRO))
for st in ('accepted', 'on_the_way', 'arrived', 'quote_pending'):
    case('d14 HAPPY: %s job cancelled, professional notified' % st, setup=mk(st, pro=PRO),
         body="r := %s;" % cancel(st),
         checks=("jsonb_build_object(%s,%s,%s,"
                 "'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='%s' and kind='job_cancelled'),"
                 "'active_codes',(select count(*) from public.job_codes where job_id=jb and status='active'))") % (STATE, BEV, JEV, PRO))
case('d15 in_progress: refused, untouched', setup=mk('in_progress', pro=PRO),
     body="r := %s;" % cancel('in_progress'), checks="jsonb_build_object(%s,%s)" % (STATE, BEV))
case('d16 completed job: refused, untouched', setup=mk('completed', pro=PRO),
     body="r := %s;" % cancel('completed'), checks="jsonb_build_object(%s,%s)" % (STATE, BEV))
case('d17 duplicate request: second is ALREADY_CANCELLED, one event each', setup=mk('accepted', pro=PRO),
     body="r := %s; r2 := %s; r := jsonb_build_object('first', r, 'second', r2);" % (cancel('accepted'), cancel('accepted')),
     checks="jsonb_build_object(%s,%s,%s)" % (STATE, BEV, JEV))
case('d18 already cancelled booking and job', setup=mk('cancelled', status='cancelled'),
     body="r := %s;" % cancel('cancelled'), checks="jsonb_build_object(%s,%s)" % (STATE, BEV))
case('d19 historical drift (booking pending, job cancelled): booking synced, job untouched', setup=mk('cancelled', status='pending'),
     body="r := %s;" % cancel('cancelled'), checks="jsonb_build_object(%s,%s,%s)" % (STATE, BEV, JEV))
case('d20 captured (paid) payment is preserved and flagged', 
     setup=mk('accepted', pro=PRO) + " insert into public.payments (customer_id,payment_type,amount,status,job_id,booking_id,provider,provider_reference) values ('%s','booking',1,'paid',jb,bk,'dryrun','dryrun-paid');" % CUST,
     body="r := %s;" % cancel('accepted'),
     checks="jsonb_build_object(%s,'paid',(select count(*) from public.payments where booking_id=bk and status='paid'),'event_flag',(select metadata->>'payment_review_required' from public.booking_events where booking_id=bk))" % STATE)
case('d21 pending payment is preserved', 
     setup=mk('accepted', pro=PRO) + " insert into public.payments (customer_id,payment_type,amount,status,job_id,booking_id,provider,provider_reference) values ('%s','booking',1,'pending',jb,bk,'dryrun','dryrun-pending');" % CUST,
     body="r := %s;" % cancel('accepted'),
     checks="jsonb_build_object(%s,'pending',(select count(*) from public.payments where booking_id=bk and status='pending'),'other',(select count(*) from public.payments where booking_id=bk and status<>'pending'))" % STATE)
case('d22 owner reads their booking_events; another customer reads none', setup=mk('accepted', pro=PRO) + " perform public.transition_booking_state(bk,'cancelled','%s','customer','customer_cancel','other','{}'::jsonb);" % CUST,
     body="r := jsonb_build_object('owner_sees',(select count(*) from public.booking_events where booking_id=bk));",
     checks="'{}'::jsonb")
case('d23 another customer reads none', actor=OTHER, setup=mk('accepted', pro=PRO) + " perform public.transition_booking_state(bk,'cancelled','%s','customer','customer_cancel','other','{}'::jsonb);" % CUST,
     body="r := jsonb_build_object('other_sees',(select count(*) from public.booking_events where booking_id=bk));")
case('d24 admin reads', actor=ADMIN, setup=mk('accepted', pro=PRO) + " perform public.transition_booking_state(bk,'cancelled','%s','customer','customer_cancel','other','{}'::jsonb);" % CUST,
     body="r := jsonb_build_object('admin_sees',(select count(*) from public.booking_events where booking_id=bk));")
case('d25 customer cannot write booking_events', setup=mk('accepted', pro=PRO),
     body="insert into public.booking_events (booking_id,from_status,to_status) values (bk,'pending','cancelled');")
case('d26 customer cannot call transition_booking_state', setup=mk('accepted', pro=PRO),
     body="r := to_jsonb(public.transition_booking_state(bk,'cancelled',auth.uid(),'customer','x','x','{}'::jsonb));")
case('d27 customer cannot update booking_status directly', setup=mk('accepted', pro=PRO),
     body="update public.bookings set booking_status='cancelled' where id=bk; GET DIAGNOSTICS n = ROW_COUNT; r := jsonb_build_object('rows_updated', n);",
     checks="jsonb_build_object(%s)" % STATE)
case('d28 transition_booking_state allow-list: cancelled -> pending refused', setup=mk('cancelled', status='cancelled'),
     body="r := to_jsonb(public.transition_booking_state(bk,'pending','%s','customer','x','x','{}'::jsonb));" % CUST, actor=None, role='postgres')
case('d29 matcher skips a cancelled booking (no new job, no offer)', setup=mk(None),
     body="r := %s; EXECUTE 'RESET ROLE'; PERFORM public.process_assignment_queue();" % cancel('no_job'),
     checks="jsonb_build_object(%s,'jobs_for_booking',(select count(*) from public.jobs where booking_id=bk))" % STATE)
case('d30 compat: admin_cancel_job still works (unchanged)', actor=ADMIN, setup=mk('accepted', pro=PRO),
     body="r := public.admin_cancel_job(jb,'accepted','compat check reason','other');",
     checks=("jsonb_build_object(%s,'customer_kind',(select n.kind from public.notifications n where n.job_id=jb and n.user_id=(select customer_id from public.jobs where id=jb) limit 1))") % STATE)
case('d31 compat: professional cancel via transition_job_state still notifies customer', actor=PRO, setup=mk('accepted', pro=PRO),
     body="r := to_jsonb(public.transition_job_state(jb,'cancelled','%s','{}'::jsonb));" % PRO,
     checks=("jsonb_build_object(%s,'customer_kind',(select n.kind from public.notifications n where n.job_id=jb and n.user_id=(select customer_id from public.jobs where id=jb) limit 1))") % STATE)
case('d32 compat: customer cannot cancel in_progress through transition_job_state', setup=mk('in_progress', pro=PRO),
     body="r := to_jsonb(public.transition_job_state(jb,'cancelled','%s','{}'::jsonb));" % CUST)

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
