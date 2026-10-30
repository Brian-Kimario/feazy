-- Dry run for 20261030_104. Applies the migration, runs the checks, ROLLS BACK.
-- Usage (never commits):  cat supabase/migrations/20261030_104_*.sql tests/security/verification-state-machine.dryrun.sql | \
--   (echo 'BEGIN;'; cat; echo 'ROLLBACK;')  -> supabase db query --linked -f <file>
-- Uses the designated *@fixify.dev test accounts only.
CREATE TEMP TABLE res (n serial, name text, ok boolean, detail text);

CREATE FUNCTION pg_temp.as_user(p_uid uuid, p_role text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_out text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '{"role":"anon"}' ELSE json_build_object('sub', p_uid, 'role', p_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE 'SELECT (' || p_sql || ')::text' INTO v_out;
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true); RETURN 'OK ' || COALESCE(v_out, 'null');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true); RETURN 'ERR ' || SQLSTATE;
  END;
END $$;


CREATE FUNCTION pg_temp.as_user_dml(p_uid uuid, p_role text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '{"role":"anon"}' ELSE json_build_object('sub', p_uid, 'role', p_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql; GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true); RETURN 'OK ' || v_n;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true); RETURN 'ERR ' || SQLSTATE;
  END;
END $$;

CREATE FUNCTION pg_temp.uid(p_email text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM auth.users WHERE email = p_email $$;
CREATE FUNCTION pg_temp.chk(p_name text, p_ok boolean, p_detail text) RETURNS void LANGUAGE sql AS $$ INSERT INTO res(name, ok, detail) VALUES (p_name, p_ok, p_detail) $$;

DO $$
DECLARE
  adm uuid := pg_temp.uid('admin.test@fixify.dev');
  cus uuid := pg_temp.uid('customer.a@fixify.dev');
  sup uuid := pg_temp.uid('support.test@fixify.dev');
  pa  uuid := pg_temp.uid('pro.a@fixify.dev');
  pb  uuid := pg_temp.uid('pro.b@fixify.dev');
  r text; v_vid uuid; v_cnt int; v_s text; v_av boolean;
  adm_call text;
BEGIN
  -- ---------- authorization of the admin function ----------
  r := pg_temp.as_user(NULL, 'anon', format('public.admin_transition_professional_verification(%L,''suspend'',''verified'',''because reasons'')', pb));
  PERFORM pg_temp.chk('anon cannot call admin transition', r LIKE 'ERR 42501', r);
  r := pg_temp.as_user(cus, 'authenticated', format('public.admin_transition_professional_verification(%L,''suspend'',''verified'',''because reasons'')', pb));
  PERFORM pg_temp.chk('customer rejected', r = 'ERR 42501', r);
  r := pg_temp.as_user(pa, 'authenticated', format('public.admin_transition_professional_verification(%L,''suspend'',''verified'',''because reasons'')', pb));
  PERFORM pg_temp.chk('professional rejected', r = 'ERR 42501', r);
  r := pg_temp.as_user(sup, 'authenticated', format('public.admin_transition_professional_verification(%L,''suspend'',''verified'',''because reasons'')', pb));
  PERFORM pg_temp.chk('support rejected', r = 'ERR 42501', r);
  SELECT verification_status INTO v_s FROM professional_profiles WHERE user_id = pb;
  PERFORM pg_temp.chk('rejected callers changed nothing', v_s = 'verified', v_s);

  -- ---------- input validation ----------
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''delete'',''verified'',''because reasons'')', pb));
  PERFORM pg_temp.chk('unknown action -> 22023', r = 'ERR 22023', r);
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''suspend'',''verified'',''no'')', pb));
  PERFORM pg_temp.chk('short reason -> 22023', r = 'ERR 22023', r);
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''suspend'',''verified'',''     '')', pb));
  PERFORM pg_temp.chk('blank reason -> 22023', r = 'ERR 22023', r);
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''suspend'',''verified'',''because reasons'')', gen_random_uuid()));
  PERFORM pg_temp.chk('unknown professional -> P0002', r = 'ERR P0002', r);

  -- ---------- approve requires evidence; stale + duplicate ----------
  UPDATE professional_profiles SET is_available = false, verification_status = 'pending' WHERE user_id = pa;  -- postgres (no JWT): maintenance path
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''approve'',''pending'',''checked docs'')', pa));
  PERFORM pg_temp.chk('approve pending with no documents blocked (23514)', r = 'ERR 23514', r);

  INSERT INTO professional_verifications (professional_id, status, submitted_at) VALUES (pa, 'pending', now()) RETURNING id INTO v_vid;
  INSERT INTO professional_verification_documents (verification_id, document_type, storage_path, status) VALUES (v_vid, 'license', pa || '/license/x.pdf', 'pending');
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''approve'',''pending'',''checked docs'')', pa));
  PERFORM pg_temp.chk('approve blocked when only a non-required doc type exists', r = 'ERR 23514', r);
  INSERT INTO professional_verification_documents (verification_id, document_type, storage_path, status) VALUES (v_vid, 'id', pa || '/id/x.pdf', 'rejected');
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''approve'',''pending'',''checked docs'')', pa));
  PERFORM pg_temp.chk('rejected document does not satisfy evidence', r = 'ERR 23514', r);
  INSERT INTO professional_verification_documents (verification_id, document_type, storage_path, status) VALUES (v_vid, 'id', pa || '/id/y.pdf', 'pending');

  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''approve'',''documents_submitted'',''checked docs'')', pa));
  PERFORM pg_temp.chk('stale expected status -> 55000', r = 'ERR 55000', r);
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''approve'',''pending'',''checked docs'')', pa));
  PERFORM pg_temp.chk('approve pending with evidence succeeds', r LIKE 'OK %', r);
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''approve'',''pending'',''checked docs'')', pa));
  PERFORM pg_temp.chk('duplicate approve (old expected) -> 55000', r = 'ERR 55000', r);
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''approve'',''verified'',''checked docs'')', pa));
  PERFORM pg_temp.chk('approve already-verified -> 55000', r = 'ERR 55000', r);
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''reject'',''verified'',''changed my mind'')', pa));
  PERFORM pg_temp.chk('reject a verified professional -> 55000', r = 'ERR 55000', r);
  SELECT count(*) INTO v_cnt FROM professional_verification_events WHERE professional_id = pa AND action = 'approve';
  PERFORM pg_temp.chk('exactly one approve event', v_cnt = 1, v_cnt::text);
  SELECT is_available INTO v_av FROM professional_profiles WHERE user_id = pa;
  PERFORM pg_temp.chk('approve does not switch availability on', v_av = false, v_av::text);

  -- ---------- direct tampering by the professional ----------
  UPDATE professional_profiles SET verification_status = 'rejected' WHERE user_id = pa;     -- maintenance path to stage state
  r := pg_temp.as_user_dml(pa, 'authenticated', format('UPDATE professional_profiles SET verification_status=''verified'' WHERE user_id=%L', pa));
  PERFORM pg_temp.chk('rejected pro cannot self-verify', r = 'ERR 42501', r);
  r := pg_temp.as_user_dml(pa, 'authenticated', format('UPDATE professional_profiles SET verification_status=''documents_submitted'' WHERE user_id=%L', pa));
  PERFORM pg_temp.chk('rejected pro cannot self-resubmit by direct update', r = 'ERR 42501', r);
  r := pg_temp.as_user_dml(pa, 'authenticated', format('UPDATE professional_profiles SET is_available=true WHERE user_id=%L', pa));
  PERFORM pg_temp.chk('rejected pro cannot set is_available', r = 'ERR 42501', r);
  r := pg_temp.as_user_dml(adm, 'authenticated', format('UPDATE professional_profiles SET verification_status=''verified'' WHERE user_id=%L', pa));
  PERFORM pg_temp.chk('admin direct update of another pro blocked (RLS: 0 rows)', r = 'OK 0', r);
  SELECT verification_status INTO v_s FROM professional_profiles WHERE user_id = pa;
  PERFORM pg_temp.chk('status still rejected after tampering attempts', v_s = 'rejected', v_s);

  -- ---------- suspend: reason, availability, offers, active jobs ----------
  -- pb: verified+available, has an in_progress job. Give pb a pending offer on a live unmatched job.
  UPDATE jobs SET professional_id = pb, offer_expires_at = now() + interval '30 minutes' WHERE id = '7153294b-a7cc-4575-9574-7ac4bbca2507';
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''suspend'',''verified'',''abc'')', pb));
  PERFORM pg_temp.chk('suspend without meaningful reason blocked', r = 'ERR 22023', r);
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''suspend'',''verified'',''Complaint under investigation'')', pb));
  PERFORM pg_temp.chk('admin suspends verified pro', r LIKE 'OK %', r);
  SELECT verification_status, is_available INTO v_s, v_av FROM professional_profiles WHERE user_id = pb;
  PERFORM pg_temp.chk('suspended and unavailable', v_s = 'suspended' AND v_av = false, v_s || '/' || v_av);
  SELECT count(*) INTO v_cnt FROM jobs WHERE id = '7153294b-a7cc-4575-9574-7ac4bbca2507' AND professional_id = pb;
  PERFORM pg_temp.chk('pending offer no longer held by suspended pro', v_cnt = 0, v_cnt::text);
  SELECT count(*) INTO v_cnt FROM booking_assignment_attempts WHERE professional_id = pb AND outcome = 'withdrawn' AND reason_code = 'professional_suspended';
  PERFORM pg_temp.chk('withdrawal recorded in attempt log', v_cnt = 1, v_cnt::text);
  SELECT current_state INTO v_s FROM jobs WHERE id = '3049783d-dc71-4297-85c3-5c7fc3801cbb';
  PERFORM pg_temp.chk('active job not auto-cancelled', v_s = 'in_progress', v_s);
  SELECT count(*) INTO v_cnt FROM professional_verification_events
   WHERE professional_id = pb AND action = 'suspend' AND metadata->'active_job_ids' @> to_jsonb('3049783d-dc71-4297-85c3-5c7fc3801cbb'::text) AND (metadata->>'offers_withdrawn')::int = 1;
  PERFORM pg_temp.chk('suspend event records withdrawn offers and active job ids', v_cnt = 1, v_cnt::text);

  -- ---------- eligibility: no path can give a non-verified pro work ----------
  BEGIN
    UPDATE jobs SET professional_id = pb WHERE id = 'bb392dfc-1e2f-4243-8c5e-6dd05ffbf281';
    PERFORM pg_temp.chk('direct assignment to suspended pro blocked', false, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.chk('direct assignment to suspended pro blocked (even as maintenance role)', SQLSTATE = '55000', SQLSTATE); END;
  BEGIN
    UPDATE jobs SET professional_id = pa WHERE id = 'bb392dfc-1e2f-4243-8c5e-6dd05ffbf281';  -- pa is rejected
    PERFORM pg_temp.chk('direct assignment to rejected pro blocked', false, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.chk('direct assignment to rejected pro blocked', SQLSTATE = '55000', SQLSTATE); END;
  UPDATE professional_profiles SET verification_status = 'pending' WHERE user_id = pa;
  BEGIN
    UPDATE jobs SET professional_id = pa WHERE id = 'bb392dfc-1e2f-4243-8c5e-6dd05ffbf281';
    PERFORM pg_temp.chk('direct assignment to pending pro blocked', false, 'update succeeded');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.chk('direct assignment to pending pro blocked', SQLSTATE = '55000', SQLSTATE); END;
  SELECT count(*) INTO v_cnt FROM public._rank_professionals((SELECT booking_id FROM jobs WHERE id='bb392dfc-1e2f-4243-8c5e-6dd05ffbf281')) r WHERE r.professional_id IN (pa, pb);
  PERFORM pg_temp.chk('matching ranker excludes suspended and pending pros', v_cnt = 0, v_cnt::text);
  r := pg_temp.as_user(pb, 'authenticated', 'public.transition_job_state(''3049783d-dc71-4297-85c3-5c7fc3801cbb''::uuid,''accepted'',NULL::uuid,''{}''::jsonb)');
  PERFORM pg_temp.chk('suspended pro cannot accept work via job RPC', r LIKE 'ERR %' AND r <> 'ERR 42883', r);
  r := pg_temp.as_user_dml(pb, 'authenticated', format('UPDATE professional_profiles SET is_available=true WHERE user_id=%L', pb));
  PERFORM pg_temp.chk('suspended pro cannot make self available', r = 'ERR 42501', r);
  r := pg_temp.as_user_dml(pb, 'authenticated', format('UPDATE professional_profiles SET verification_status=''verified'' WHERE user_id=%L', pb));
  PERFORM pg_temp.chk('suspended pro cannot self-reactivate', r = 'ERR 42501', r);
  r := pg_temp.as_user(pb, 'authenticated', 'public.submit_professional_verification()');
  PERFORM pg_temp.chk('suspended pro submit is a no-op (cannot un-suspend)', r LIKE 'OK %"changed": false%', r);
  SELECT verification_status INTO v_s FROM professional_profiles WHERE user_id = pb;
  PERFORM pg_temp.chk('still suspended after submit attempt', v_s = 'suspended', v_s);

  -- ---------- reactivate ----------
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''reactivate'',''suspended'',''Investigation closed'')', pb));
  PERFORM pg_temp.chk('reactivate blocked: no documents on file for legacy verified pro (23514)', r = 'ERR 23514', r);
  INSERT INTO professional_verifications (professional_id, status, submitted_at) VALUES (pb, 'verified', now()) RETURNING id INTO v_vid;
  INSERT INTO professional_verification_documents (verification_id, document_type, storage_path, status) VALUES (v_vid, 'id', pb || '/id/z.pdf', 'accepted');
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''reactivate'',''suspended'',''Investigation closed'')', pb));
  PERFORM pg_temp.chk('reactivate with evidence succeeds', r LIKE 'OK %', r);
  SELECT verification_status, is_available INTO v_s, v_av FROM professional_profiles WHERE user_id = pb;
  PERFORM pg_temp.chk('reactivated verified but availability NOT restored', v_s = 'verified' AND v_av = false, v_s || '/' || v_av);
  SELECT count(*) INTO v_cnt FROM jobs WHERE professional_id = pb AND current_state = 'assigned';
  PERFORM pg_temp.chk('withdrawn offers not revived', v_cnt = 0, v_cnt::text);
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''reactivate'',''suspended'',''Investigation closed'')', pb));
  PERFORM pg_temp.chk('duplicate reactivate -> 55000', r = 'ERR 55000', r);
  SELECT count(*) INTO v_cnt FROM professional_verification_events WHERE professional_id = pb AND action IN ('suspend','reactivate');
  PERFORM pg_temp.chk('suspension history preserved (suspend + reactivate events)', v_cnt = 2, v_cnt::text);

  -- ---------- reject, resubmit, history ----------
  UPDATE professional_profiles SET verification_status = 'documents_submitted' WHERE user_id = pa;
  r := pg_temp.as_user(adm, 'authenticated', format('public.admin_transition_professional_verification(%L,''reject'',''documents_submitted'',''Photo is unreadable'')', pa));
  PERFORM pg_temp.chk('reject from documents_submitted', r LIKE 'OK %', r);
  SELECT count(*) INTO v_cnt FROM professional_verifications WHERE professional_id = pa AND status = 'rejected' AND rejection_reason = 'Photo is unreadable' AND reviewed_by = adm;
  PERFORM pg_temp.chk('rejection reason + reviewer stored on submission', v_cnt = 1, v_cnt::text);
  r := pg_temp.as_user(pa, 'authenticated', 'public.submit_professional_verification()');
  PERFORM pg_temp.chk('resubmit without newer documents -> changed:false + missing', r LIKE 'OK %"changed": false%' AND r LIKE '%missing%', r);
  INSERT INTO professional_verification_documents (verification_id, document_type, storage_path, status, uploaded_at)
    SELECT id, 'id', pa || '/id/new.pdf', 'pending', now() + interval '1 minute' FROM professional_verifications WHERE professional_id = pa ORDER BY created_at DESC LIMIT 1;
  r := pg_temp.as_user(pa, 'authenticated', 'public.submit_professional_verification()');
  PERFORM pg_temp.chk('resubmit with newer document succeeds', r LIKE 'OK %"changed": true%', r);
  SELECT count(*) INTO v_cnt FROM professional_verifications WHERE professional_id = pa AND rejection_reason = 'Photo is unreadable';
  PERFORM pg_temp.chk('original rejection reason preserved', v_cnt = 1, v_cnt::text);
  SELECT count(*) INTO v_cnt FROM professional_verification_events WHERE professional_id = pa AND action IN ('reject','resubmit');
  PERFORM pg_temp.chk('reject + resubmit events recorded', v_cnt = 2, v_cnt::text);
  r := pg_temp.as_user(pa, 'authenticated', 'public.submit_professional_verification()');
  PERFORM pg_temp.chk('duplicate submit is a no-op', r LIKE 'OK %"changed": false%', r);
  r := pg_temp.as_user(adm, 'authenticated', 'public.submit_professional_verification()');
  PERFORM pg_temp.chk('admin cannot call professional submit', r = 'ERR 42501', r);
  r := pg_temp.as_user(NULL, 'anon', 'public.submit_professional_verification()');
  PERFORM pg_temp.chk('anon cannot call professional submit', r LIKE 'ERR 42501', r);

  -- ---------- history table protections ----------
  BEGIN UPDATE professional_verification_events SET reason = 'edited reason' WHERE professional_id = pa;
    PERFORM pg_temp.chk('events cannot be updated', false, 'updated');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.chk('events cannot be updated', SQLSTATE = '42501', SQLSTATE); END;
  r := pg_temp.as_user_dml(pa, 'authenticated', format('INSERT INTO professional_verification_events(professional_id,from_status,to_status,action,actor_role,reason) VALUES (%L,''pending'',''verified'',''approve'',''admin'',''forged event'')', pa));
  PERFORM pg_temp.chk('authenticated cannot insert events directly', r = 'ERR 42501', r);
  r := pg_temp.as_user(pb, 'authenticated', format('(SELECT count(*) FROM professional_verification_events WHERE professional_id=%L AND action IN (''suspend'',''reactivate''))', pb));
  PERFORM pg_temp.chk('professional cannot read their suspension notes', r = 'OK 0', r);
  r := pg_temp.as_user(adm, 'authenticated', format('(SELECT count(*) FROM professional_verification_events WHERE professional_id=%L)', pb));
  PERFORM pg_temp.chk('admin can read history', r NOT IN ('OK 0') AND r LIKE 'OK %', r);
  r := pg_temp.as_user(NULL, 'anon', '(SELECT count(*) FROM professional_verification_events)');
  PERFORM pg_temp.chk('anon cannot read history', r LIKE 'ERR %', r);

  -- ---------- grants ----------
  PERFORM pg_temp.chk('grants: admin fn execute (anon,authenticated,service_role,public)',
    NOT has_function_privilege('anon','public.admin_transition_professional_verification(uuid,text,text,text,jsonb)','execute')
    AND has_function_privilege('authenticated','public.admin_transition_professional_verification(uuid,text,text,text,jsonb)','execute')
    AND NOT has_function_privilege('service_role','public.admin_transition_professional_verification(uuid,text,text,text,jsonb)','execute'),
    'anon/auth/service');
  PERFORM pg_temp.chk('grants: submit fn',
    NOT has_function_privilege('anon','public.submit_professional_verification()','execute')
    AND has_function_privilege('authenticated','public.submit_professional_verification()','execute'), '');
  PERFORM pg_temp.chk('grants: internal helpers not callable by clients',
    NOT has_function_privilege('authenticated','public._verification_missing_documents(uuid,timestamptz)','execute')
    AND NOT has_function_privilege('authenticated','public._release_offer(uuid,text,text,text,uuid)','execute'), '');
  PERFORM pg_temp.chk('function config pinned search_path',
    (SELECT bool_and(proconfig::text LIKE '%search_path%') FROM pg_proc WHERE proname IN ('admin_transition_professional_verification','submit_professional_verification','guard_job_professional_verified','guard_professional_profile_protected_columns','_verification_missing_documents') AND pronamespace='public'::regnamespace), '');
END $$;

SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM res ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM res;
