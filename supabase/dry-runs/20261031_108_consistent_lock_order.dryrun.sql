CREATE FUNCTION pg_temp.mk(p_job_state text, p_status text, p_pro uuid, p_offer boolean) RETURNS uuid
LANGUAGE plpgsql AS $mk$
DECLARE v_b uuid; v_t public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.bookings WHERE id = 'c9bca247-db78-40fa-b216-1b699f151e03';
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
DO $dry$
DECLARE
  out jsonb := '[]'::jsonb;
  r jsonb; r2 jsonb; c jsonb;
  bk uuid; jb uuid; n int;
BEGIN
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_cancel_job(jb,'assigned','lock order dry run','other');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_withdrawn',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='withdrawn'),'record',(select count(*) from public.admin_job_cancellations where job_id=jb),'pro_notified',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'));
      out := out || jsonb_build_object('case', $n$e01 admin cancel: assigned job with offer, offer withdrawn, record written$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_withdrawn',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='withdrawn'),'record',(select count(*) from public.admin_job_cancellations where job_id=jb),'pro_notified',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'));
      out := out || jsonb_build_object('case', $n$e01 admin cancel: assigned job with offer, offer withdrawn, record written$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_cancel_job(jb,'accepted','lock order dry run','customer_request');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'record',(select count(*) from public.admin_job_cancellations where job_id=jb));
      out := out || jsonb_build_object('case', $n$e02 admin cancel: accepted job$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'record',(select count(*) from public.admin_job_cancellations where job_id=jb));
      out := out || jsonb_build_object('case', $n$e02 admin cancel: accepted job$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_cancel_job(jb,'assigned','lock order dry run','other');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e03 admin cancel: stale expected state refused, untouched$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e03 admin cancel: stale expected state refused, untouched$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_cancel_job(jb,'accepted','lock order dry run','other');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e04 admin cancel: non-admin refused$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e04 admin cancel: non-admin refused$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_cancel_job(gen_random_uuid(),'accepted','lock order dry run','other');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$e05 admin cancel: unknown job$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$e05 admin cancel: unknown job$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk); insert into public.payments (customer_id,payment_type,amount,status,job_id,booking_id,provider,provider_reference) values ('9b681bca-520d-462a-bd50-521c42f2b098','service',1,'paid',jb,bk,'dryrun','dryrun-paid108');
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_cancel_job(jb,'accepted','lock order dry run','other');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'paid',(select count(*) from public.payments where booking_id=bk and status='paid'));
      out := out || jsonb_build_object('case', $n$e06 admin cancel: paid payment preserved and counted$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'paid',(select count(*) from public.payments where booking_id=bk and status='paid'));
      out := out || jsonb_build_object('case', $n$e06 admin cancel: paid payment preserved and counted$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_cancel_job(jb,'accepted','lock order dry run','other'); r2 := public.admin_cancel_job(jb,'accepted','lock order dry run','other'); r := jsonb_build_object('first',r,'second',r2);
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'records',(select count(*) from public.admin_job_cancellations where job_id=jb));
      out := out || jsonb_build_object('case', $n$e07 admin cancel: duplicate is refused cleanly$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'records',(select count(*) from public.admin_job_cancellations where job_id=jb));
      out := out || jsonb_build_object('case', $n$e07 admin cancel: duplicate is refused cleanly$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"3e86d907-43e8-4b5f-80a3-fd17da3932bd","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.decline_job(jb,'schedule_conflict',NULL);
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_declined',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='declined'),'pro',(select professional_id from public.jobs where id=jb));
      out := out || jsonb_build_object('case', $n$e08 decline: professional declines, attempt recorded, job offered onward or unassigned$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_declined',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='declined'),'pro',(select professional_id from public.jobs where id=jb));
      out := out || jsonb_build_object('case', $n$e08 decline: professional declines, attempt recorded, job offered onward or unassigned$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"70738ef6-019e-4c3c-877f-8e6490d0399e","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '70738ef6-019e-4c3c-877f-8e6490d0399e', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.decline_job(jb,'schedule_conflict',NULL);
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e09 decline: another professional cannot decline$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e09 decline: another professional cannot decline$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true); jb := (select id from public.jobs where booking_id = bk); update public.jobs set offer_expires_at = now() - interval '5 minutes' where id = jb;
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE postgres';
    BEGIN
      r := public.process_assignment_queue();
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_expired',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='expired'));
      out := out || jsonb_build_object('case', $n$e10 queue: an expired offer is released (expired attempt)$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_expired',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='expired'));
      out := out || jsonb_build_object('case', $n$e10 queue: an expired offer is released (expired attempt)$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE postgres';
    BEGIN
      r := public.process_assignment_queue();
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_expired',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='expired'),'pro',(select professional_id from public.jobs where id=jb));
      out := out || jsonb_build_object('case', $n$e11 queue: an unexpired offer is left alone$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_expired',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='expired'),'pro',(select professional_id from public.jobs where id=jb));
      out := out || jsonb_build_object('case', $n$e11 queue: an unexpired offer is left alone$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE postgres';
    BEGIN
      r := to_jsonb(public._release_offer(jb,'expired','offer_expired',NULL,NULL));
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_expired',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='expired'),'pro',(select professional_id from public.jobs where id=jb));
      out := out || jsonb_build_object('case', $n$e12 _release_offer(expired) re-checks the deadline under the lock$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_expired',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='expired'),'pro',(select professional_id from public.jobs where id=jb));
      out := out || jsonb_build_object('case', $n$e12 _release_offer(expired) re-checks the deadline under the lock$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true); jb := (select id from public.jobs where booking_id = bk); update public.jobs set offer_expires_at = now() - interval '5 minutes' where id = jb; update public.bookings set booking_status='cancelled' where id=bk;
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE postgres';
    BEGIN
      r := public.process_assignment_queue();
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e13 queue: a cancelled booking with a stale expired offer is not touched$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e13 queue: a cancelled booking with a stale expired offer is not touched$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_transition_professional_verification('3e86d907-43e8-4b5f-80a3-fd17da3932bd','suspend','verified','lock order dry run suspension','{}'::jsonb);
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_withdrawn',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='withdrawn'),'verification',(select verification_status from public.professional_profiles where user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd'));
      out := out || jsonb_build_object('case', $n$e14 suspension withdraws the pending offer (booking then job order)$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_withdrawn',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='withdrawn'),'verification',(select verification_status from public.professional_profiles where user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd'));
      out := out || jsonb_build_object('case', $n$e14 suspension withdraws the pending offer (booking then job order)$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.admin_transition_professional_verification('3e86d907-43e8-4b5f-80a3-fd17da3932bd','suspend','verified','lock order dry run suspension','{}'::jsonb);
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e15 suspension does not cancel an accepted job$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e15 suspension does not cancel an accepted job$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk,'assigned','changed_my_mind','dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_withdrawn',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='withdrawn'));
      out := out || jsonb_build_object('case', $n$e16 customer cancel: assigned with offer still works$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'att_withdrawn',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='withdrawn'));
      out := out || jsonb_build_object('case', $n$e16 customer cancel: assigned with offer still works$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk(NULL, 'pending', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk,'no_job','changed_my_mind','dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e17 customer cancel: no job still works$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e17 customer cancel: no job still works$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk(NULL, 'pending', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE postgres';
    BEGIN
      r := public.process_assignment_queue();
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e18 queue still runs on a pending booking (no error)$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$e18 queue still runs on a pending booking (no error)$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  RAISE EXCEPTION 'DRYRUN_REPORT %', jsonb_pretty(jsonb_build_object('cases', out));
END
$dry$;

