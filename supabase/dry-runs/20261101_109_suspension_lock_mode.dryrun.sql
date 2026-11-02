-- Dry run for 109. Run as: (echo 'BEGIN;'; cat ../migrations/20261101_109_suspension_lock_mode.sql; cat this) -> ends with RAISE, nothing commits.
-- All fixtures are synthetic rows created inside the transaction.
DO $dry$
DECLARE
  rep jsonb := '{}'::jsonb; r jsonb; bk uuid := gen_random_uuid(); jb uuid := gen_random_uuid();
  pro uuid := gen_random_uuid(); adm uuid := 'a56652e0-6cce-471c-9926-d168b288a123'; cust uuid := '9b681bca-520d-462a-bd50-521c42f2b098';
  def text;
BEGIN
  SELECT pg_get_functiondef('public.admin_transition_professional_verification(uuid,text,text,text,jsonb)'::regprocedure) INTO def;
  rep := rep || jsonb_build_object('e01_def_no_key_update', position('FOR NO KEY UPDATE' in def) > 0 AND position('FOR UPDATE;' in def) = 0);
  rep := rep || jsonb_build_object('e02_grants', jsonb_build_object(
    'anon', has_function_privilege('anon','public.admin_transition_professional_verification(uuid,text,text,text,jsonb)','EXECUTE'),
    'authenticated', has_function_privilege('authenticated','public.admin_transition_professional_verification(uuid,text,text,text,jsonb)','EXECUTE')));

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  VALUES (pro,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','dry109@fixify.invalid','{"role":"professional","full_name":"SYNTHETIC dry109"}','{}',now(),now(),now());
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available) VALUES (pro,'SYNTHETIC dry109','verified',false)
    ON CONFLICT (user_id) DO UPDATE SET verification_status='verified', is_available=false;
  INSERT INTO public.bookings (id, customer_id, property_id, service_id, scheduled_start, pricing_model, quoted_or_base_amount, booking_status, problem_summary)
    SELECT bk, customer_id, property_id, service_id, now() - interval '1 hour', pricing_model, quoted_or_base_amount, 'pending', 'SYNTHETIC dry109' FROM public.bookings WHERE id='c9bca247-db78-40fa-b216-1b699f151e03';
  INSERT INTO public.jobs (id, booking_id, customer_id, property_id, current_state, professional_id, offer_expires_at)
    VALUES (jb, bk, cust, 'fb3744f4-5939-4cf4-8247-6f89335117bd', 'assigned', pro, now() + interval '25 minutes');

  -- e03: non-admin refused
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cust), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_transition_professional_verification(pro,'suspend','verified','dry run suspension','{}'::jsonb);
    rep := rep || jsonb_build_object('e03_nonadmin','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('e03_nonadmin', SQLSTATE);
  END;
  RESET ROLE;
  -- e04: stale expected status refused
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_transition_professional_verification(pro,'suspend','pending','dry run suspension','{}'::jsonb);
    rep := rep || jsonb_build_object('e04_stale','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('e04_stale', SQLSTATE);
  END;
  RESET ROLE;
  -- e05: short reason refused
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_transition_professional_verification(pro,'suspend','verified','x','{}'::jsonb);
    rep := rep || jsonb_build_object('e05_short_reason','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('e05_short_reason', SQLSTATE);
  END;
  RESET ROLE;
  rep := rep || jsonb_build_object('e05b_unchanged', (SELECT verification_status FROM public.professional_profiles WHERE user_id=pro));
  -- e06: valid suspension withdraws the offer
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
  SET LOCAL ROLE authenticated;
  r := public.admin_transition_professional_verification(pro,'suspend','verified','dry run suspension','{}'::jsonb);
  RESET ROLE;
  rep := rep || jsonb_build_object('e06_result', r,
    'e06_profile', (SELECT verification_status FROM public.professional_profiles WHERE user_id=pro),
    'e06_job_pro_cleared', (SELECT professional_id IS NULL FROM public.jobs WHERE id=jb),
    'e06_withdrawn_attempts', (SELECT count(*) FROM public.booking_assignment_attempts WHERE booking_id=bk AND outcome='withdrawn'));
  -- e07: second suspension refused as stale
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_transition_professional_verification(pro,'suspend','verified','dry run second','{}'::jsonb);
    rep := rep || jsonb_build_object('e07_second','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('e07_second', SQLSTATE);
  END;
  RESET ROLE;
  -- e08: reactivation still hits the unchanged document gate (the synthetic professional has no documents)
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_transition_professional_verification(pro,'reactivate','suspended','dry run reactivation','{}'::jsonb);
    rep := rep || jsonb_build_object('e08_reactivate','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('e08_reactivate_gate', SQLSTATE);
  END;
  RESET ROLE;
  RAISE EXCEPTION 'DRYRUN_REPORT %', rep::text;
END
$dry$;
