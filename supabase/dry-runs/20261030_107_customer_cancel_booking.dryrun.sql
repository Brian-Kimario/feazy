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
    bk := pg_temp.mk('assigned', 'pending', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'assigned', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d01 unauthenticated caller$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d01 unauthenticated caller$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
      r := public.customer_cancel_booking(bk, 'assigned', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d02 anon role has no execute$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d02 anon role has no execute$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"70738ef6-019e-4c3c-877f-8e6490d0399e","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '70738ef6-019e-4c3c-877f-8e6490d0399e', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'accepted', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d03 another customer: reported as not found, booking untouched$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d03 another customer: reported as not found, booking untouched$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"3e86d907-43e8-4b5f-80a3-fd17da3932bd","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'accepted', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d04 the assigned professional cannot use the customer call$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d04 the assigned professional cannot use the customer call$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      r := public.customer_cancel_booking(bk, 'accepted', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d05 an admin cannot use the customer call (admin_cancel_job is theirs)$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d05 an admin cannot use the customer call (admin_cancel_job is theirs)$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk,'assigned','because',NULL);
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d06 invalid reason category$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d06 invalid reason category$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk,'assigned','other',repeat('x',301));
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d07 note over 300 characters$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d07 note over 300 characters$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk,NULL,'other',NULL);
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d08 null expected state$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d08 null expected state$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(gen_random_uuid(),'assigned','other',NULL);
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d09 unknown booking$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d09 unknown booking$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      r := public.customer_cancel_booking(bk, 'assigned', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d10 stale expected state: refused, nothing written$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d10 stale expected state: refused, nothing written$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      r := public.customer_cancel_booking(bk, 'no_job', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'event',(select jsonb_build_object('from',from_status,'to',to_status,'actor',actor_user_id,'role',actor_role,'type',event_type,'reason',reason) from public.booking_events where booking_id=bk),'unmatched_since',(select unmatched_since from public.bookings where id=bk));
      out := out || jsonb_build_object('case', $n$d11 HAPPY: no professional matched yet (no job)$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'event',(select jsonb_build_object('from',from_status,'to',to_status,'actor',actor_user_id,'role',actor_role,'type',event_type,'reason',reason) from public.booking_events where booking_id=bk),'unmatched_since',(select unmatched_since from public.bookings where id=bk));
      out := out || jsonb_build_object('case', $n$d11 HAPPY: no professional matched yet (no job)$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('assigned', 'pending', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'assigned', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'attempts',(select count(*) from public.booking_assignment_attempts where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d12 HAPPY: job assigned, no offer holder$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'attempts',(select count(*) from public.booking_assignment_attempts where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d12 HAPPY: job assigned, no offer holder$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      r := public.customer_cancel_booking(bk, 'assigned', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'offer_expires_at',(select offer_expires_at from public.jobs where id=jb),'withdrawn',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='withdrawn' and reason_code='job_cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'customer_notifications',(select count(*) from public.notifications n where n.job_id=jb and n.user_id=(select customer_id from public.jobs where id=jb)));
      out := out || jsonb_build_object('case', $n$d13 HAPPY: outstanding offer withdrawn, professional notified$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'offer_expires_at',(select offer_expires_at from public.jobs where id=jb),'withdrawn',(select count(*) from public.booking_assignment_attempts where booking_id=bk and outcome='withdrawn' and reason_code='job_cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'customer_notifications',(select count(*) from public.notifications n where n.job_id=jb and n.user_id=(select customer_id from public.jobs where id=jb)));
      out := out || jsonb_build_object('case', $n$d13 HAPPY: outstanding offer withdrawn, professional notified$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      r := public.customer_cancel_booking(bk, 'accepted', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'active_codes',(select count(*) from public.job_codes where job_id=jb and status='active'));
      out := out || jsonb_build_object('case', $n$d14 HAPPY: accepted job cancelled, professional notified$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'active_codes',(select count(*) from public.job_codes where job_id=jb and status='active'));
      out := out || jsonb_build_object('case', $n$d14 HAPPY: accepted job cancelled, professional notified$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('on_the_way', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'on_the_way', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'active_codes',(select count(*) from public.job_codes where job_id=jb and status='active'));
      out := out || jsonb_build_object('case', $n$d14 HAPPY: on_the_way job cancelled, professional notified$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'active_codes',(select count(*) from public.job_codes where job_id=jb and status='active'));
      out := out || jsonb_build_object('case', $n$d14 HAPPY: on_the_way job cancelled, professional notified$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('arrived', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'arrived', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'active_codes',(select count(*) from public.job_codes where job_id=jb and status='active'));
      out := out || jsonb_build_object('case', $n$d14 HAPPY: arrived job cancelled, professional notified$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'active_codes',(select count(*) from public.job_codes where job_id=jb and status='active'));
      out := out || jsonb_build_object('case', $n$d14 HAPPY: arrived job cancelled, professional notified$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('quote_pending', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'quote_pending', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'active_codes',(select count(*) from public.job_codes where job_id=jb and status='active'));
      out := out || jsonb_build_object('case', $n$d14 HAPPY: quote_pending job cancelled, professional notified$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'),'pro_notifications',(select count(*) from public.notifications where job_id=jb and user_id='3e86d907-43e8-4b5f-80a3-fd17da3932bd' and kind='job_cancelled'),'active_codes',(select count(*) from public.job_codes where job_id=jb and status='active'));
      out := out || jsonb_build_object('case', $n$d14 HAPPY: quote_pending job cancelled, professional notified$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('in_progress', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'in_progress', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d15 in_progress: refused, untouched$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d15 in_progress: refused, untouched$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('completed', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'completed', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d16 completed job: refused, untouched$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d16 completed job: refused, untouched$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      r := public.customer_cancel_booking(bk, 'accepted', 'changed_my_mind', 'dry run'); r2 := public.customer_cancel_booking(bk, 'accepted', 'changed_my_mind', 'dry run'); r := jsonb_build_object('first', r, 'second', r2);
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'));
      out := out || jsonb_build_object('case', $n$d17 duplicate request: second is ALREADY_CANCELLED, one event each$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'));
      out := out || jsonb_build_object('case', $n$d17 duplicate request: second is ALREADY_CANCELLED, one event each$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('cancelled', 'cancelled', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'cancelled', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d18 already cancelled booking and job$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d18 already cancelled booking and job$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('cancelled', 'pending', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'cancelled', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'));
      out := out || jsonb_build_object('case', $n$d19 historical drift (booking pending, job cancelled): booking synced, job untouched$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'booking_events',(select count(*) from public.booking_events where booking_id=bk),'job_cancel_events',(select count(*) from public.job_events where job_id=jb and to_state='cancelled'));
      out := out || jsonb_build_object('case', $n$d19 historical drift (booking pending, job cancelled): booking synced, job untouched$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk); insert into public.payments (customer_id,payment_type,amount,status,job_id,booking_id,provider,provider_reference) values ('9b681bca-520d-462a-bd50-521c42f2b098','booking',1,'paid',jb,bk,'dryrun','dryrun-paid');
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'accepted', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'paid',(select count(*) from public.payments where booking_id=bk and status='paid'),'event_flag',(select metadata->>'payment_review_required' from public.booking_events where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d20 captured (paid) payment is preserved and flagged$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'paid',(select count(*) from public.payments where booking_id=bk and status='paid'),'event_flag',(select metadata->>'payment_review_required' from public.booking_events where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d20 captured (paid) payment is preserved and flagged$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk); insert into public.payments (customer_id,payment_type,amount,status,job_id,booking_id,provider,provider_reference) values ('9b681bca-520d-462a-bd50-521c42f2b098','booking',1,'pending',jb,bk,'dryrun','dryrun-pending');
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := public.customer_cancel_booking(bk, 'accepted', 'changed_my_mind', 'dry run');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'pending',(select count(*) from public.payments where booking_id=bk and status='pending'),'other',(select count(*) from public.payments where booking_id=bk and status<>'pending'));
      out := out || jsonb_build_object('case', $n$d21 pending payment is preserved$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'pending',(select count(*) from public.payments where booking_id=bk and status='pending'),'other',(select count(*) from public.payments where booking_id=bk and status<>'pending'));
      out := out || jsonb_build_object('case', $n$d21 pending payment is preserved$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk); perform public.transition_booking_state(bk,'cancelled','9b681bca-520d-462a-bd50-521c42f2b098','customer','customer_cancel','other','{}'::jsonb);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := jsonb_build_object('owner_sees',(select count(*) from public.booking_events where booking_id=bk));
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d22 owner reads their booking_events; another customer reads none$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d22 owner reads their booking_events; another customer reads none$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk); perform public.transition_booking_state(bk,'cancelled','9b681bca-520d-462a-bd50-521c42f2b098','customer','customer_cancel','other','{}'::jsonb);
    PERFORM set_config('request.jwt.claims', '{"sub":"70738ef6-019e-4c3c-877f-8e6490d0399e","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '70738ef6-019e-4c3c-877f-8e6490d0399e', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := jsonb_build_object('other_sees',(select count(*) from public.booking_events where booking_id=bk));
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d23 another customer reads none$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d23 another customer reads none$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk); perform public.transition_booking_state(bk,'cancelled','9b681bca-520d-462a-bd50-521c42f2b098','customer','customer_cancel','other','{}'::jsonb);
    PERFORM set_config('request.jwt.claims', '{"sub":"a56652e0-6cce-471c-9926-d168b288a123","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', 'a56652e0-6cce-471c-9926-d168b288a123', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := jsonb_build_object('admin_sees',(select count(*) from public.booking_events where booking_id=bk));
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d24 admin reads$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d24 admin reads$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      insert into public.booking_events (booking_id,from_status,to_status) values (bk,'pending','cancelled');
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d25 customer cannot write booking_events$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d25 customer cannot write booking_events$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      r := to_jsonb(public.transition_booking_state(bk,'cancelled',auth.uid(),'customer','x','x','{}'::jsonb));
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d26 customer cannot call transition_booking_state$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d26 customer cannot call transition_booking_state$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      update public.bookings set booking_status='cancelled' where id=bk; GET DIAGNOSTICS n = ROW_COUNT; r := jsonb_build_object('rows_updated', n);
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d27 customer cannot update booking_status directly$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d27 customer cannot update booking_status directly$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('cancelled', 'cancelled', NULL, false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    EXECUTE 'SET LOCAL ROLE postgres';
    BEGIN
      r := to_jsonb(public.transition_booking_state(bk,'pending','9b681bca-520d-462a-bd50-521c42f2b098','customer','x','x','{}'::jsonb));
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d28 transition_booking_state allow-list: cancelled -> pending refused$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d28 transition_booking_state allow-list: cancelled -> pending refused$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      r := public.customer_cancel_booking(bk, 'no_job', 'changed_my_mind', 'dry run'); EXECUTE 'RESET ROLE'; PERFORM public.process_assignment_queue();
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'jobs_for_booking',(select count(*) from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d29 matcher skips a cancelled booking (no new job, no offer)$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'jobs_for_booking',(select count(*) from public.jobs where booking_id=bk));
      out := out || jsonb_build_object('case', $n$d29 matcher skips a cancelled booking (no new job, no offer)$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
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
      r := public.admin_cancel_job(jb,'accepted','compat check reason','other');
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'customer_kind',(select n.kind from public.notifications n where n.job_id=jb and n.user_id=(select customer_id from public.jobs where id=jb) limit 1));
      out := out || jsonb_build_object('case', $n$d30 compat: admin_cancel_job still works (unchanged)$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'customer_kind',(select n.kind from public.notifications n where n.job_id=jb and n.user_id=(select customer_id from public.jobs where id=jb) limit 1));
      out := out || jsonb_build_object('case', $n$d30 compat: admin_cancel_job still works (unchanged)$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('accepted', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"3e86d907-43e8-4b5f-80a3-fd17da3932bd","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := to_jsonb(public.transition_job_state(jb,'cancelled','3e86d907-43e8-4b5f-80a3-fd17da3932bd','{}'::jsonb));
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'customer_kind',(select n.kind from public.notifications n where n.job_id=jb and n.user_id=(select customer_id from public.jobs where id=jb) limit 1));
      out := out || jsonb_build_object('case', $n$d31 compat: professional cancel via transition_job_state still notifies customer$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := jsonb_build_object('booking',(select booking_status from public.bookings where id=bk),'job',(select current_state from public.jobs where booking_id=bk),'customer_kind',(select n.kind from public.notifications n where n.job_id=jb and n.user_id=(select customer_id from public.jobs where id=jb) limit 1));
      out := out || jsonb_build_object('case', $n$d31 compat: professional cancel via transition_job_state still notifies customer$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  BEGIN
    r := NULL; r2 := NULL; c := NULL; bk := NULL; jb := NULL;
    bk := pg_temp.mk('in_progress', 'pending', '3e86d907-43e8-4b5f-80a3-fd17da3932bd', false); jb := (select id from public.jobs where booking_id = bk);
    PERFORM set_config('request.jwt.claims', '{"sub":"9b681bca-520d-462a-bd50-521c42f2b098","role":"authenticated"}', true);
    PERFORM set_config('request.jwt.claim.sub', '9b681bca-520d-462a-bd50-521c42f2b098', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      r := to_jsonb(public.transition_job_state(jb,'cancelled','9b681bca-520d-462a-bd50-521c42f2b098','{}'::jsonb));
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d32 compat: customer cannot cancel in_progress through transition_job_state$n$::text, 'result', r, 'checks', c);
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      c := '{}'::jsonb;
      out := out || jsonb_build_object('case', $n$d32 compat: customer cannot cancel in_progress through transition_job_state$n$::text, 'raised_sqlstate', SQLSTATE, 'raised', SQLERRM, 'checks', c);
    END;
    RAISE EXCEPTION 'rollback case' USING ERRCODE = 'P9999';
  EXCEPTION WHEN SQLSTATE 'P9999' THEN NULL;
  END;
  RAISE EXCEPTION 'DRYRUN_REPORT %', jsonb_pretty(jsonb_build_object('cases', out));
END
$dry$;

