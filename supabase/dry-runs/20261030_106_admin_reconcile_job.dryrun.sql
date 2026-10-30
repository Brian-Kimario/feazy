DO $dry$
DECLARE
  out jsonb := '[]'::jsonb;
  r jsonb;
  r2 jsonb;
  c jsonb;
  pre jsonb;
BEGIN
  pre := jsonb_build_object(
    'fixtures', (SELECT jsonb_agg(jsonb_build_object('id', j.id, 'state', j.current_state, 'booking', b.booking_status, 'pro', j.professional_id)) FROM public.jobs j JOIN public.bookings b ON b.id = j.booking_id WHERE j.id IN ('7153294b-a7cc-4575-9574-7ac4bbca2507','bb392dfc-1e2f-4243-8c5e-6dd05ffbf281')));
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c01 unauthenticated caller$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c01 unauthenticated caller$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c02 anon role has no execute$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c02 anon role has no execute$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c03 customer of the job$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c03 customer of the job$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"3e86d907-43e8-4b5f-80a3-fd17da3932bd","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c04 professional$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c04 professional$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','no');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c05 admin, reason too short$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c05 admin, reason too short$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job(gen_random_uuid(),'assigned','test reason here');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c06 admin, unknown job$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c06 admin, unknown job$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507',NULL,'test reason here');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c07 admin, null expected state$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$c07 admin, null expected state$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','accepted','test reason here');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'recs',(select count(*) from public.admin_reconciliations),'events',(select count(*) from public.job_events where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and event_type='admin_reconcile'));
      out := out || jsonb_build_object('case', $n$c08 stale expected state: refused, nothing written$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'recs',(select count(*) from public.admin_reconciliations),'events',(select count(*) from public.job_events where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and event_type='admin_reconcile'));
      out := out || jsonb_build_object('case', $n$c08 stale expected state: refused, nothing written$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    update public.bookings set booking_status='pending' where id=(select booking_id from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507');
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c09 booking not cancelled: refused$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c09 booking not cancelled: refused$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    update public.jobs set professional_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd', current_state='accepted' where id='7153294b-a7cc-4575-9574-7ac4bbca2507';
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','accepted','test reason here');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c10 job accepted (professional committed): refused$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c10 job accepted (professional committed): refused$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    update public.jobs set professional_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd', current_state='in_progress' where id='7153294b-a7cc-4575-9574-7ac4bbca2507';
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','in_progress','test reason here');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c11 job in_progress: refused$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c11 job in_progress: refused$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    update public.jobs set professional_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd', current_state='completed' where id='7153294b-a7cc-4575-9574-7ac4bbca2507';
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','completed','test reason here');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c12 job completed: refused, untouched$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c12 job completed: refused, untouched$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    insert into public.payments (customer_id,payment_type,amount,status,job_id,provider,provider_reference) values ('9b681bca-520d-462a-bd50-521c42f2b098','booking',1,'paid','7153294b-a7cc-4575-9574-7ac4bbca2507','dryrun','dryrun-paid');
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'paid_payments',(select count(*) from public.payments where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and status='paid'));
      out := out || jsonb_build_object('case', $n$c13 captured (paid) payment: refused, payment untouched$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'paid_payments',(select count(*) from public.payments where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and status='paid'));
      out := out || jsonb_build_object('case', $n$c13 captured (paid) payment: refused, payment untouched$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'booking_status',(select b.booking_status from public.bookings b join public.jobs j on j.booking_id=b.id where j.id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'reconcile_events',(select count(*) from public.job_events where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and event_type='admin_reconcile'),'recon_rows',(select count(*) from public.admin_reconciliations where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and performed_by='a56652e0-6cce-471c-9926-d168b288a123' and not had_outstanding_offer),'cancel_rows',(select count(*) from public.admin_job_cancellations where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'inapp_notifications',(select count(*) from public.notifications where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'live_mismatch_left',(select count(*) from public.bookings b join public.jobs j on j.booking_id=b.id where b.booking_status='cancelled' and j.current_state in ('assigned','accepted','on_the_way','arrived','in_progress','quote_pending')));
      out := out || jsonb_build_object('case', $n$c14 HAPPY PATH: unmatched job of a cancelled booking$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'booking_status',(select b.booking_status from public.bookings b join public.jobs j on j.booking_id=b.id where j.id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'reconcile_events',(select count(*) from public.job_events where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and event_type='admin_reconcile'),'recon_rows',(select count(*) from public.admin_reconciliations where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and performed_by='a56652e0-6cce-471c-9926-d168b288a123' and not had_outstanding_offer),'cancel_rows',(select count(*) from public.admin_job_cancellations where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'inapp_notifications',(select count(*) from public.notifications where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'live_mismatch_left',(select count(*) from public.bookings b join public.jobs j on j.booking_id=b.id where b.booking_status='cancelled' and j.current_state in ('assigned','accepted','on_the_way','arrived','in_progress','quote_pending')));
      out := out || jsonb_build_object('case', $n$c14 HAPPY PATH: unmatched job of a cancelled booking$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here'); r2 := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here'); r := jsonb_build_object('first', r, 'second', r2);
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('reconcile_events',(select count(*) from public.job_events where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and event_type='admin_reconcile'),'recon_rows',(select count(*) from public.admin_reconciliations where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c15 duplicate request after success -> STALE_STATE, one event only$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('reconcile_events',(select count(*) from public.job_events where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and event_type='admin_reconcile'),'recon_rows',(select count(*) from public.admin_reconciliations where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c15 duplicate request after success -> STALE_STATE, one event only$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    update public.jobs set professional_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd', offer_expires_at=now()+interval '30 minutes' where id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281';
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('bb392dfc-1e2f-4243-8c5e-6dd05ffbf281','assigned','test reason here');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281'),'offer_expires_at',(select offer_expires_at from public.jobs where id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281'),'withdrawn_attempts',(select count(*) from public.booking_assignment_attempts a join public.jobs j on j.booking_id=a.booking_id where j.id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281' and a.outcome='withdrawn' and a.reason_code='job_cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281' and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'customer_notifications',(select count(*) from public.notifications n join public.jobs j on j.id=n.job_id where n.job_id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281' and n.user_id=j.customer_id),'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281'));
      out := out || jsonb_build_object('case', $n$c16 outstanding offer: withdrawn, professional told, customer not$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281'),'offer_expires_at',(select offer_expires_at from public.jobs where id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281'),'withdrawn_attempts',(select count(*) from public.booking_assignment_attempts a join public.jobs j on j.booking_id=a.booking_id where j.id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281' and a.outcome='withdrawn' and a.reason_code='job_cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281' and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'customer_notifications',(select count(*) from public.notifications n join public.jobs j on j.id=n.job_id where n.job_id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281' and n.user_id=j.customer_id),'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281'));
      out := out || jsonb_build_object('case', $n$c16 outstanding offer: withdrawn, professional told, customer not$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    insert into public.payments (customer_id,payment_type,amount,status,job_id,provider,provider_reference) values ('9b681bca-520d-462a-bd50-521c42f2b098','booking',1,'pending','7153294b-a7cc-4575-9574-7ac4bbca2507','dryrun','dryrun-pending');
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'pending_payments',(select count(*) from public.payments where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and status='pending'),'other_payments',(select count(*) from public.payments where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and status<>'pending'));
      out := out || jsonb_build_object('case', $n$c17 pending payment is preserved exactly$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'pending_payments',(select count(*) from public.payments where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and status='pending'),'other_payments',(select count(*) from public.payments where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and status<>'pending'));
      out := out || jsonb_build_object('case', $n$c17 pending payment is preserved exactly$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := to_jsonb(public.transition_job_state('7153294b-a7cc-4575-9574-7ac4bbca2507','cancelled','a56652e0-6cce-471c-9926-d168b288a123','{}'::jsonb));
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c18 admin still cannot cancel through transition_job_state directly$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('job_state',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c18 admin still cannot cancel through transition_job_state directly$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_cancel_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','compat check reason','other');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('customer_kind',(select n.kind from public.notifications n join public.jobs j on j.id=n.job_id where n.job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and n.user_id=j.customer_id limit 1),'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c19 compat: admin_cancel_job still works and notifies as before$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('customer_kind',(select n.kind from public.notifications n join public.jobs j on j.id=n.job_id where n.job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and n.user_id=j.customer_id limit 1),'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507'));
      out := out || jsonb_build_object('case', $n$c19 compat: admin_cancel_job still works and notifies as before$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    update public.jobs set professional_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd', current_state='accepted' where id='7153294b-a7cc-4575-9574-7ac4bbca2507';
    PERFORM set_config('request.jwt.claims', '{"sub":"3e86d907-43e8-4b5f-80a3-fd17da3932bd","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := to_jsonb(public.transition_job_state('7153294b-a7cc-4575-9574-7ac4bbca2507','cancelled','3e86d907-43e8-4b5f-80a3-fd17da3932bd','{}'::jsonb));
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('customer_kind',(select n.kind from public.notifications n join public.jobs j on j.id=n.job_id where n.job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and n.user_id=j.customer_id limit 1),'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and notification_type='cancellation'));
      out := out || jsonb_build_object('case', $n$c20 compat: ordinary professional cancel still notifies customer and queues WhatsApp$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('customer_kind',(select n.kind from public.notifications n join public.jobs j on j.id=n.job_id where n.job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and n.user_id=j.customer_id limit 1),'whatsapp_queue_rows',(select count(*) from public.notification_logs where job_id='7153294b-a7cc-4575-9574-7ac4bbca2507' and notification_type='cancellation'));
      out := out || jsonb_build_object('case', $n$c20 compat: ordinary professional cancel still notifies customer and queues WhatsApp$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := jsonb_build_array(public.admin_reconcile_job('7153294b-a7cc-4575-9574-7ac4bbca2507','assigned','test reason here'), public.admin_reconcile_job('bb392dfc-1e2f-4243-8c5e-6dd05ffbf281','assigned','test reason here'));
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('live_mismatch_left',(select count(*) from public.bookings b join public.jobs j on j.booking_id=b.id where b.booking_status='cancelled' and j.current_state in ('assigned','accepted','on_the_way','arrived','in_progress','quote_pending')),'f14',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'f19',(select current_state from public.jobs where id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281'));
      out := out || jsonb_build_object('case', $n$c21 both fixtures reconciled in one transaction: nothing left in the mismatch queue$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('live_mismatch_left',(select count(*) from public.bookings b join public.jobs j on j.booking_id=b.id where b.booking_status='cancelled' and j.current_state in ('assigned','accepted','on_the_way','arrived','in_progress','quote_pending')),'f14',(select current_state from public.jobs where id='7153294b-a7cc-4575-9574-7ac4bbca2507'),'f19',(select current_state from public.jobs where id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281'));
      out := out || jsonb_build_object('case', $n$c21 both fixtures reconciled in one transaction: nothing left in the mismatch queue$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  RAISE EXCEPTION 'DRYRUN_REPORT %', jsonb_pretty(jsonb_build_object('pre', pre, 'cases', out));
END
$dry$;

