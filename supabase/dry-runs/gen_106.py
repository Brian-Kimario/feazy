#!/usr/bin/env python3
"""Generates 20261030_106_admin_reconcile_job.dryrun.sql (a DO block that ends by raising its report).
Run: python3 gen_106.py > 20261030_106_admin_reconcile_job.dryrun.sql
Execute (never commits; see docs/A3_2_RECOVERY_DESIGN.md section 8):
  (echo 'BEGIN;'; cat ../migrations/20261030_106_admin_reconcile_job.sql; cat 20261030_106_admin_reconcile_job.dryrun.sql) > /tmp/x.sql
"""
F14 = '7153294b-a7cc-4575-9574-7ac4bbca2507'
F19 = 'bb392dfc-1e2f-4243-8c5e-6dd05ffbf281'
ADMIN = 'a56652e0-6cce-471c-9926-d168b288a123'
CUST = '9b681bca-520d-462a-bd50-521c42f2b098'
PRO = '3e86d907-43e8-4b5f-80a3-fd17da3932bd'

def jwt(sub):
    return "'{\"sub\":\"%s\",\"role\":\"authenticated\"}'" % sub if sub else "'{}'"

# name, setup (as postgres), actor, role, call/body (as actor), checks (as postgres, jsonb expression)
cases = []
def case(name, setup='', actor=ADMIN, role='authenticated', body='', checks="'{}'::jsonb"):
    cases.append((name, setup, actor, role, body, checks))

REC = "public.admin_reconcile_job('%s','assigned','test reason here')"
NJ = "(select count(*) from public.job_events where job_id='%s' and event_type='admin_reconcile')"

case('c01 unauthenticated caller', actor=None, body="r := %s;" % (REC % F14))
case('c02 anon role has no execute', actor=None, role='anon', body="r := %s;" % (REC % F14))
case('c03 customer of the job', actor=CUST, body="r := %s;" % (REC % F14))
case('c04 professional', actor=PRO, body="r := %s;" % (REC % F14))
case('c05 admin, reason too short', body="r := public.admin_reconcile_job('%s','assigned','no');" % F14)
case('c06 admin, unknown job', body="r := public.admin_reconcile_job(gen_random_uuid(),'assigned','test reason here');")
case('c07 admin, null expected state', body="r := public.admin_reconcile_job('%s',NULL,'test reason here');" % F14)
case('c08 stale expected state: refused, nothing written',
     body="r := public.admin_reconcile_job('%s','accepted','test reason here');" % F14,
     checks="jsonb_build_object('job_state',(select current_state from public.jobs where id='%s'),'recs',(select count(*) from public.admin_reconciliations),'events',%s)" % (F14, NJ % F14))
case('c09 booking not cancelled: refused',
     setup="update public.bookings set booking_status='pending' where id=(select booking_id from public.jobs where id='%s');" % F14,
     body="r := %s;" % (REC % F14),
     checks="jsonb_build_object('job_state',(select current_state from public.jobs where id='%s'))" % F14)
case('c10 job accepted (professional committed): refused',
     setup="update public.jobs set professional_id='%s', current_state='accepted' where id='%s';" % (PRO, F14),
     body="r := %s;" % (REC.replace("'assigned'", "'accepted'") % F14),
     checks="jsonb_build_object('job_state',(select current_state from public.jobs where id='%s'))" % F14)
case('c11 job in_progress: refused',
     setup="update public.jobs set professional_id='%s', current_state='in_progress' where id='%s';" % (PRO, F14),
     body="r := %s;" % (REC.replace("'assigned'", "'in_progress'") % F14),
     checks="jsonb_build_object('job_state',(select current_state from public.jobs where id='%s'))" % F14)
case('c12 job completed: refused, untouched',
     setup="update public.jobs set professional_id='%s', current_state='completed' where id='%s';" % (PRO, F14),
     body="r := %s;" % (REC.replace("'assigned'", "'completed'") % F14),
     checks="jsonb_build_object('job_state',(select current_state from public.jobs where id='%s'))" % F14)
case('c13 captured (paid) payment: refused, payment untouched',
     setup="insert into public.payments (customer_id,payment_type,amount,status,job_id,provider,provider_reference) values ('%s','booking',1,'paid','%s','dryrun','dryrun-paid');" % (CUST, F14),
     body="r := %s;" % (REC % F14),
     checks="jsonb_build_object('job_state',(select current_state from public.jobs where id='%s'),'paid_payments',(select count(*) from public.payments where job_id='%s' and status='paid'))" % (F14, F14))
case('c14 HAPPY PATH: unmatched job of a cancelled booking',
     body="r := %s;" % (REC % F14),
     checks=("jsonb_build_object('job_state',(select current_state from public.jobs where id='%s'),"
             "'booking_status',(select b.booking_status from public.bookings b join public.jobs j on j.booking_id=b.id where j.id='%s'),"
             "'reconcile_events',%s,"
             "'recon_rows',(select count(*) from public.admin_reconciliations where job_id='%s' and performed_by='%s' and not had_outstanding_offer),"
             "'cancel_rows',(select count(*) from public.admin_job_cancellations where job_id='%s'),"
             "'inapp_notifications',(select count(*) from public.notifications where job_id='%s'),"
             "'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='%s'),"
             "'live_mismatch_left',(select count(*) from public.bookings b join public.jobs j on j.booking_id=b.id where b.booking_status='cancelled' and j.current_state in ('assigned','accepted','on_the_way','arrived','in_progress','quote_pending')))") % (F14, F14, NJ % F14, F14, ADMIN, F14, F14, F14))
case('c15 duplicate request after success -> STALE_STATE, one event only',
     body="r := %s; r2 := %s; r := jsonb_build_object('first', r, 'second', r2);" % (REC % F14, REC % F14),
     checks="jsonb_build_object('reconcile_events',%s,'recon_rows',(select count(*) from public.admin_reconciliations where job_id='%s'))" % (NJ % F14, F14))
case('c16 outstanding offer: withdrawn, professional told, customer not',
     setup="update public.jobs set professional_id='%s', offer_expires_at=now()+interval '30 minutes' where id='%s';" % (PRO, F19),
     body="r := %s;" % (REC % F19),
     checks=("jsonb_build_object('job_state',(select current_state from public.jobs where id='%s'),"
             "'offer_expires_at',(select offer_expires_at from public.jobs where id='%s'),"
             "'withdrawn_attempts',(select count(*) from public.booking_assignment_attempts a join public.jobs j on j.booking_id=a.booking_id where j.id='%s' and a.outcome='withdrawn' and a.reason_code='job_cancelled'),"
             "'pro_notifications',(select count(*) from public.notifications where job_id='%s' and user_id='%s' and kind='job_cancelled'),"
             "'customer_notifications',(select count(*) from public.notifications n join public.jobs j on j.id=n.job_id where n.job_id='%s' and n.user_id=j.customer_id),"
             "'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='%s'))") % (F19, F19, F19, F19, PRO, F19, F19))
case('c17 pending payment is preserved exactly',
     setup="insert into public.payments (customer_id,payment_type,amount,status,job_id,provider,provider_reference) values ('%s','booking',1,'pending','%s','dryrun','dryrun-pending');" % (CUST, F14),
     body="r := %s;" % (REC % F14),
     checks="jsonb_build_object('job_state',(select current_state from public.jobs where id='%s'),'pending_payments',(select count(*) from public.payments where job_id='%s' and status='pending'),'other_payments',(select count(*) from public.payments where job_id='%s' and status<>'pending'))" % (F14, F14, F14))
case('c18 admin still cannot cancel through transition_job_state directly',
     body="r := to_jsonb(public.transition_job_state('%s','cancelled','%s','{}'::jsonb));" % (F14, ADMIN),
     checks="jsonb_build_object('job_state',(select current_state from public.jobs where id='%s'))" % F14)
case('c19 compat: admin_cancel_job still works and notifies as before',
     body="r := public.admin_cancel_job('%s','assigned','compat check reason','other');" % F14,
     checks="jsonb_build_object('customer_kind',(select n.kind from public.notifications n join public.jobs j on j.id=n.job_id where n.job_id='%s' and n.user_id=j.customer_id limit 1),'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='%s'))" % (F14, F14))
case('c20 compat: ordinary professional cancel still notifies customer and queues WhatsApp',
     setup="update public.jobs set professional_id='%s', current_state='accepted' where id='%s';" % (PRO, F14),
     actor=PRO,
     body="r := to_jsonb(public.transition_job_state('%s','cancelled','%s','{}'::jsonb));" % (F14, PRO),
     checks="jsonb_build_object('customer_kind',(select n.kind from public.notifications n join public.jobs j on j.id=n.job_id where n.job_id='%s' and n.user_id=j.customer_id limit 1),'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='%s' and notification_type='cancellation'))" % (F14, F14))
case('c21 both fixtures reconciled in one transaction: nothing left in the mismatch queue',
     body=("r := jsonb_build_array(%s, %s);" % (REC % F14, REC % F19)),
     checks="jsonb_build_object('live_mismatch_left',(select count(*) from public.bookings b join public.jobs j on j.booking_id=b.id where b.booking_status='cancelled' and j.current_state in ('assigned','accepted','on_the_way','arrived','in_progress','quote_pending')),'f14',(select current_state from public.jobs where id='%s'),'f19',(select current_state from public.jobs where id='%s'))" % (F14, F19))

out = []
out.append("""DO $dry$
DECLARE
  out jsonb := '[]'::jsonb;
  r jsonb;
  r2 jsonb;
  c jsonb;
  pre jsonb;
BEGIN
  pre := jsonb_build_object(
    'fixtures', (SELECT jsonb_agg(jsonb_build_object('id', j.id, 'state', j.current_state, 'booking', b.booking_status, 'pro', j.professional_id)) FROM public.jobs j JOIN public.bookings b ON b.id = j.booking_id WHERE j.id IN ('%s','%s')));
""" % (F14, F19))
for name, setup, actor, role, body, checks in cases:
    out.append("""  BEGIN
    r := NULL; r2 := NULL; c := NULL;
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
out.append("""  RAISE EXCEPTION 'DRYRUN_REPORT %', jsonb_pretty(jsonb_build_object('pre', pre, 'cases', out));
END
$dry$;
""")
print(''.join(out))
