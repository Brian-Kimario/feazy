-- A2 transactional dry run. Everything (fixtures, the migration itself if pasted above, results) is
-- rolled back. Run as: supabase db query --linked -f tests/security/admin-cancel-job.dryrun.sql
-- Prints one line per check: PASS/FAIL | label | detail. Then a PASS/FAIL tally.
BEGIN;

-- ---- helpers (rolled back with everything else) ----------------------------------------------
CREATE FUNCTION public.zz_rec(p_label text, p_ok boolean, p_detail text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('t.res', coalesce(current_setting('t.res', true), '') ||
    CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END || ' | ' || p_label || ' | ' || coalesce(p_detail, '') || E'\n', false);
END $$;

-- Run sql as uid (NULL = anon). expect: 'ok' or text that must appear in the error ('' = any error).
CREATE FUNCTION public.zz_expect(p_label text, p_uid uuid, p_sql text, p_expect text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_out text; v_err text; v_state text;
BEGIN
  IF p_uid IS NULL THEN
    EXECUTE 'set local role anon';
  ELSE
    EXECUTE 'set local role authenticated';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  END IF;
  BEGIN
    EXECUTE p_sql INTO v_out;
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  EXECUTE 'reset role';
  PERFORM set_config('request.jwt.claims', '', true);
  IF p_expect = 'ok' THEN
    PERFORM public.zz_rec(p_label, v_err IS NULL, coalesce(v_err, left(v_out, 120)));
  ELSE
    PERFORM public.zz_rec(p_label, v_err IS NOT NULL AND position(p_expect in v_err) > 0, coalesce('['||v_state||'] '||v_err, 'NO ERROR: ' || left(v_out, 80)));
  END IF;
  RETURN v_out;
END $$;

CREATE FUNCTION public.zz_eq(p_label text, p_actual text, p_expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM public.zz_rec(p_label, p_actual IS NOT DISTINCT FROM p_expected, 'got=' || coalesce(p_actual,'NULL') || ' want=' || p_expected); END $$;

CREATE FUNCTION public.zz_mk(p_state text, p_pro uuid, p_cust uuid, p_offer boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_prop uuid; v_svc uuid; v_b uuid; v_j uuid;
BEGIN
  SELECT id INTO v_prop FROM public.properties WHERE owner_customer_id = p_cust LIMIT 1;
  SELECT id INTO v_svc FROM public.services WHERE is_active LIMIT 1;
  INSERT INTO public.bookings (customer_id, property_id, service_id, scheduled_start, pricing_model, quoted_or_base_amount, booking_status)
  VALUES (p_cust, v_prop, v_svc, now() + interval '2 days', 'fixed', 100, 'pending') RETURNING id INTO v_b;
  INSERT INTO public.jobs (booking_id, customer_id, property_id, professional_id, current_state, offer_expires_at)
  VALUES (v_b, p_cust, v_prop, p_pro, p_state, CASE WHEN p_offer THEN now() + interval '1 hour' END) RETURNING id INTO v_j;
  RETURN v_j;
END $$;

-- ---- actors -----------------------------------------------------------------------------------
SELECT set_config('t.admin', (SELECT id::text FROM public.profiles WHERE email = 'admin.test@fixify.dev'), false);
SELECT set_config('t.support', (SELECT id::text FROM public.profiles WHERE email = 'support.test@fixify.dev'), false);
SELECT set_config('t.custA', (SELECT p.id::text FROM public.profiles p WHERE p.email = 'customer.a@fixify.dev'), false);
SELECT set_config('t.custB', (SELECT p.id::text FROM public.profiles p WHERE p.email = 'customer.b@fixify.dev'), false);
SELECT set_config('t.proA', (SELECT id::text FROM public.profiles WHERE email = 'pro.a@fixify.dev'), false);
SELECT set_config('t.proB', (SELECT id::text FROM public.profiles WHERE email = 'pro.b@fixify.dev'), false);
DO $$
DECLARE
  admin uuid := current_setting('t.admin')::uuid;
  supp uuid := current_setting('t.support')::uuid;
  ca uuid := current_setting('t.custA')::uuid;
  cb uuid := current_setting('t.custB')::uuid;
  pa uuid := current_setting('t.proA')::uuid;
  pb uuid := current_setting('t.proB')::uuid;
  j uuid; st text; r text; n int; res text;
BEGIN
  -- === 1. transition_job_state: NULL-professional hole closed =====================================
  j := public.zz_mk('assigned', NULL, ca);
  PERFORM public.zz_expect('unmatched: unrelated customer cannot cancel', cb,
    format('select public.transition_job_state(%L,''cancelled'',%L)', j, cb), 'Not allowed');
  PERFORM public.zz_expect('unmatched: unrelated professional cannot cancel', pb,
    format('select public.transition_job_state(%L,''cancelled'',%L)', j, pb), 'Not allowed');
  PERFORM public.zz_expect('unmatched: support cannot cancel directly', supp,
    format('select public.transition_job_state(%L,''cancelled'',%L)', j, supp), 'Not allowed');
  PERFORM public.zz_expect('unmatched: admin cannot cancel via the raw transition', admin,
    format('select public.transition_job_state(%L,''cancelled'',%L,''{"event_type":"admin_cancel"}'')', j, admin), 'Not allowed');
  PERFORM public.zz_expect('unmatched: anon has no execute', NULL,
    format('select public.transition_job_state(%L,''cancelled'',%L)', j, ca), 'permission denied');
  PERFORM public.zz_expect('unmatched: actor mismatch rejected', cb,
    format('select public.transition_job_state(%L,''cancelled'',%L)', j, ca), 'Actor does not match');
  PERFORM public.zz_expect('unmatched: owning customer CAN cancel (constraint fix)', ca,
    format('select public.transition_job_state(%L,''cancelled'',%L)', j, ca), 'ok');
  SELECT current_state INTO st FROM public.jobs WHERE id = j;
  PERFORM public.zz_eq('unmatched: job is cancelled with no professional', st, 'cancelled');

  -- matched job
  j := public.zz_mk('accepted', pa, ca);
  PERFORM public.zz_expect('matched: unrelated customer denied', cb, format('select public.transition_job_state(%L,''cancelled'',%L)', j, cb), 'Not allowed');
  PERFORM public.zz_expect('matched: unrelated professional denied', pb, format('select public.transition_job_state(%L,''on_the_way'',%L)', j, pb), 'Not allowed');
  PERFORM public.zz_expect('matched: admin raw transition denied', admin, format('select public.transition_job_state(%L,''cancelled'',%L)', j, admin), 'Not allowed');
  PERFORM public.zz_expect('matched: customer cannot start work', ca, format('select public.transition_job_state(%L,''on_the_way'',%L)', j, ca), 'Not allowed');
  PERFORM public.zz_expect('matched: assigned professional can progress', pa, format('select public.transition_job_state(%L,''on_the_way'',%L)', j, pa), 'ok');
  PERFORM public.zz_expect('matched: owning customer can cancel', ca, format('select public.transition_job_state(%L,''cancelled'',%L)', j, ca), 'ok');
  PERFORM public.zz_expect('terminal: customer cannot cancel again', ca, format('select public.transition_job_state(%L,''cancelled'',%L)', j, ca), 'Not allowed');
  PERFORM public.zz_expect('terminal: pro cannot reopen', pa, format('select public.transition_job_state(%L,''accepted'',%L)', j, pa), 'Invalid state transition');

  -- outstanding offer
  j := public.zz_mk('assigned', pa, ca, true);
  PERFORM public.zz_expect('offer: unrelated customer denied', cb, format('select public.transition_job_state(%L,''cancelled'',%L)', j, cb), 'Not allowed');
  PERFORM public.zz_expect('offer: unrelated professional denied', pb, format('select public.transition_job_state(%L,''accepted'',%L)', j, pb), 'Not allowed');
  PERFORM public.zz_expect('offer: owning customer can cancel', ca, format('select public.transition_job_state(%L,''cancelled'',%L)', j, ca), 'ok');

  -- === 2. admin_cancel_job: eligibility ===========================================================
  -- non-admins
  j := public.zz_mk('in_progress', pb, ca);
  PERFORM public.zz_expect('admin_cancel: owning customer refused', ca, format('select public.admin_cancel_job(%L,''in_progress'',''valid reason'',''other'')::text', j), 'Only administrators');
  PERFORM public.zz_expect('admin_cancel: unrelated customer refused', cb, format('select public.admin_cancel_job(%L,''in_progress'',''valid reason'',''other'')::text', j), 'Only administrators');
  PERFORM public.zz_expect('admin_cancel: assigned professional refused', pb, format('select public.admin_cancel_job(%L,''in_progress'',''valid reason'',''other'')::text', j), 'Only administrators');
  PERFORM public.zz_expect('admin_cancel: support refused', supp, format('select public.admin_cancel_job(%L,''in_progress'',''valid reason'',''other'')::text', j), 'Only administrators');
  PERFORM public.zz_expect('admin_cancel: anon refused', NULL, format('select public.admin_cancel_job(%L,''in_progress'',''valid reason'',''other'')::text', j), 'permission denied');
  SELECT current_state INTO st FROM public.jobs WHERE id = j;
  PERFORM public.zz_eq('admin_cancel: refused callers changed nothing', st, 'in_progress');
  -- input validation
  PERFORM public.zz_expect('admin_cancel: short reason rejected', admin, format('select public.admin_cancel_job(%L,''in_progress'',''no'',''other'')::text', j), 'reason');
  PERFORM public.zz_expect('admin_cancel: blank reason rejected', admin, format('select public.admin_cancel_job(%L,''in_progress'',''      '',''other'')::text', j), 'reason');
  PERFORM public.zz_expect('admin_cancel: unknown category rejected', admin, format('select public.admin_cancel_job(%L,''in_progress'',''valid reason'',''because'')::text', j), 'category');
  PERFORM public.zz_expect('admin_cancel: null expected state rejected', admin, format('select public.admin_cancel_job(%L,NULL,''valid reason'',''other'')::text', j), 'expected state');
  PERFORM public.zz_expect('admin_cancel: unknown job rejected', admin, 'select public.admin_cancel_job(gen_random_uuid(),''assigned'',''valid reason'',''other'')::text', 'Job not found');
  PERFORM public.zz_expect('admin_cancel: stale expected state rejected', admin, format('select public.admin_cancel_job(%L,''accepted'',''valid reason'',''other'')::text', j), 'is now');

  -- === 3. every cancellable state: job, booking, event, notifications, offer ======================
  DECLARE
    labels text[] := ARRAY['assigned_offer','assigned_unmatched','accepted','on_the_way','arrived','in_progress','quote_pending'];
    states text[] := ARRAY['assigned','assigned','accepted','on_the_way','arrived','in_progress','quote_pending'];
    lab text; i int; has_pro boolean; cnt int; txt text; res text;
  BEGIN
    FOR i IN 1 .. array_length(labels, 1) LOOP
      lab := labels[i];
      has_pro := lab <> 'assigned_unmatched';
      j := public.zz_mk(states[i], CASE WHEN has_pro THEN pa END, ca, lab = 'assigned_offer');
      res := public.zz_expect('cancel from ' || lab, admin,
        format('select public.admin_cancel_job(%L,%L,''Internal: pro suspected of misconduct'',''scheduling_issue'')::text', j, states[i]), 'ok');
      SELECT current_state INTO st FROM public.jobs WHERE id = j;
      PERFORM public.zz_eq(lab || ': job cancelled', st, 'cancelled');
      SELECT b.booking_status INTO st FROM public.bookings b JOIN public.jobs x ON x.booking_id = b.id WHERE x.id = j;
      PERFORM public.zz_eq(lab || ': booking cancelled', st, 'cancelled');
      SELECT count(*), max(metadata::text) INTO cnt, txt FROM public.job_events
        WHERE job_id = j AND event_type = 'admin_cancel' AND to_state = 'cancelled' AND actor_user_id = admin AND from_state = states[i];
      PERFORM public.zz_eq(lab || ': one admin_cancel job event by the admin', cnt::text, '1');
      PERFORM public.zz_rec(lab || ': event metadata holds no internal reason', position('misconduct' in coalesce(txt,'')) = 0, txt);
      SELECT count(*) INTO cnt FROM public.admin_job_cancellations WHERE job_id = j AND cancelled_by = admin
        AND internal_reason = 'Internal: pro suspected of misconduct' AND customer_reason_category = 'scheduling_issue' AND from_state = states[i];
      PERFORM public.zz_eq(lab || ': internal record stored', cnt::text, '1');
      SELECT count(*), max(n.body) INTO cnt, txt FROM public.notifications n WHERE n.job_id = j AND n.user_id = ca AND n.kind = 'job_cancelled_by_admin';
      PERFORM public.zz_eq(lab || ': customer notified once', cnt::text, '1');
      PERFORM public.zz_rec(lab || ': customer text is safe and complete',
        txt LIKE '%cancelled by Fixify due to a scheduling issue%' AND txt LIKE '%No further action is required%'
        AND position('misconduct' in txt) = 0 AND position('has been refunded' in txt) = 0, txt);
      SELECT count(*) INTO cnt FROM public.notifications WHERE job_id = j AND user_id = pa AND kind = 'job_cancelled_by_admin';
      PERFORM public.zz_eq(lab || ': professional notified ' || CASE WHEN has_pro THEN 'once' ELSE 'not at all (none assigned)' END, cnt::text, CASE WHEN has_pro THEN '1' ELSE '0' END);
      SELECT count(*) INTO cnt FROM public.notifications WHERE job_id = j AND user_id NOT IN (ca, pa);
      PERFORM public.zz_eq(lab || ': nobody else notified', cnt::text, '0');
      IF lab = 'assigned_offer' THEN
        SELECT count(*) INTO cnt FROM public.booking_assignment_attempts a JOIN public.jobs x ON x.booking_id = a.booking_id
          WHERE x.id = j AND a.outcome = 'withdrawn' AND a.reason_code = 'job_cancelled' AND a.professional_id = pa;
        PERFORM public.zz_eq('offer: withdrawal recorded', cnt::text, '1');
        SELECT offer_expires_at::text INTO st FROM public.jobs WHERE id = j;
        PERFORM public.zz_eq('offer: no dangling expiry', st, NULL);
      END IF;
      SELECT count(*) INTO cnt FROM public.job_codes WHERE job_id = j AND status = 'active';
      PERFORM public.zz_eq(lab || ': no active codes remain', cnt::text, '0');
    END LOOP;
  END;

  -- unrelated professional pb never notified for any job above
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = pb AND kind = 'job_cancelled_by_admin';
  PERFORM public.zz_eq('unrelated professional never notified', n::text, '0');
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = cb AND kind = 'job_cancelled_by_admin';
  PERFORM public.zz_eq('unrelated customer never notified', n::text, '0');

  -- === 4. terminal, stale, duplicate =================================================================
  FOREACH st IN ARRAY ARRAY['completed','cancelled','closed'] LOOP
    j := public.zz_mk(st, pa, ca);
    PERFORM public.zz_expect('terminal ' || st || ' rejected', admin, format('select public.admin_cancel_job(%L,%L,''valid reason'',''other'')::text', j, st), 'cannot be cancelled');
  END LOOP;
  j := public.zz_mk('accepted', pa, ca);
  PERFORM public.zz_expect('first cancel succeeds', admin, format('select public.admin_cancel_job(%L,''accepted'',''valid reason'',''other'')::text', j), 'ok');
  PERFORM public.zz_expect('duplicate (same expected state) rejected', admin, format('select public.admin_cancel_job(%L,''accepted'',''valid reason'',''other'')::text', j), 'is now');
  PERFORM public.zz_expect('duplicate (expecting cancelled) rejected', admin, format('select public.admin_cancel_job(%L,''cancelled'',''valid reason'',''other'')::text', j), 'cannot be cancelled');
  SELECT count(*) INTO n FROM public.job_events WHERE job_id = j AND to_state = 'cancelled';
  PERFORM public.zz_eq('duplicates added no second event', n::text, '1');
  SELECT count(*) INTO n FROM public.notifications WHERE job_id = j AND kind = 'job_cancelled_by_admin';
  PERFORM public.zz_eq('duplicates added no second notifications (customer+pro)', n::text, '2');

  -- === 5. visibility of the internal reason ============================================================
  r := public.zz_expect('customer reads job_events of own job', ca,
    format('select string_agg(metadata::text, '','') from public.job_events where job_id = %L', j), 'ok');
  PERFORM public.zz_rec('customer-visible event text has no internal reason', position('valid reason' in coalesce(r,'')) = 0, r);
  r := public.zz_expect('customer reads admin_job_cancellations', ca, 'select count(*)::text from public.admin_job_cancellations', 'ok');
  PERFORM public.zz_eq('customer sees 0 internal cancellation rows', r, '0');
  r := public.zz_expect('professional reads admin_job_cancellations', pa, 'select count(*)::text from public.admin_job_cancellations', 'ok');
  PERFORM public.zz_eq('professional sees 0 internal cancellation rows', r, '0');
  r := public.zz_expect('support reads admin_job_cancellations', supp, 'select count(*)::text from public.admin_job_cancellations', 'ok');
  PERFORM public.zz_eq('support sees 0 internal cancellation rows (admin only)', r, '0');
  r := public.zz_expect('admin reads admin_job_cancellations', admin, format('select count(*)::text from public.admin_job_cancellations where job_id = %L', j), 'ok');
  PERFORM public.zz_eq('admin sees the internal record', r, '1');
  PERFORM public.zz_expect('authenticated cannot insert admin_job_cancellations', admin,
    format('insert into public.admin_job_cancellations (job_id,booking_id,cancelled_by,from_state,internal_reason,customer_reason_category,payment_review_required) select id,booking_id,%L,''x'',''forged reason'',''other'',false from public.jobs limit 1', admin), 'permission denied');

  -- === 6. payments preserved ==============================================================================
  j := public.zz_mk('accepted', pa, ca);
  INSERT INTO public.payments (customer_id, booking_id, job_id, payment_type, amount, currency, provider, provider_reference, status, paid_at)
    SELECT ca, booking_id, j, 'booking', 100, 'INR', 'razorpay', 'zz_paid_' || j, 'paid', now() FROM public.jobs WHERE id = j;
  INSERT INTO public.payments (customer_id, booking_id, job_id, payment_type, amount, currency, provider, provider_reference, status)
    SELECT ca, booking_id, j, 'booking', 50, 'INR', 'razorpay', 'zz_pending_' || j, 'pending' FROM public.jobs WHERE id = j;
  r := (SELECT string_agg(provider_reference || ':' || status || ':' || amount || ':' || coalesce(paid_at::text,''), ',' ORDER BY provider_reference) FROM public.payments WHERE job_id = j);
  res := public.zz_expect('cancel job holding paid + pending payments', admin, format('select public.admin_cancel_job(%L,''accepted'',''valid reason'',''professional_unavailable'')::text', j), 'ok');
  PERFORM public.zz_rec('result flags financial review', res::jsonb->>'payment_review_required' = 'true' AND (res::jsonb->>'paid_payment_count') = '1' AND (res::jsonb->>'pending_payment_count') = '1', res);
  PERFORM public.zz_eq('payments unchanged (status, amount, paid_at)',
    (SELECT string_agg(provider_reference || ':' || status || ':' || amount || ':' || coalesce(paid_at::text,''), ',' ORDER BY provider_reference) FROM public.payments WHERE job_id = j), r);
  PERFORM public.zz_eq('no payment marked refunded', (SELECT count(*)::text FROM public.payments WHERE job_id = j AND status NOT IN ('paid','pending')), '0');
  SELECT body INTO r FROM public.notifications WHERE job_id = j AND user_id = ca AND kind = 'job_cancelled_by_admin';
  PERFORM public.zz_rec('customer text does not promise a refund', position('refund' in r) > 0 AND r LIKE '%communicated separately%' AND r NOT LIKE '%will be refunded%' AND r NOT LIKE '%is being refunded%', r);
  j := public.zz_mk('accepted', pa, ca);
  INSERT INTO public.payments (customer_id, booking_id, job_id, payment_type, amount, currency, provider, provider_reference, status)
    SELECT ca, booking_id, j, 'booking', 50, 'INR', 'razorpay', 'zz_only_pending_' || j, 'pending' FROM public.jobs WHERE id = j;
  res := public.zz_expect('cancel job with only a pending payment', admin, format('select public.admin_cancel_job(%L,''accepted'',''valid reason'',''other'')::text', j), 'ok');
  PERFORM public.zz_rec('pending-only does NOT flag financial review', res::jsonb->>'payment_review_required' = 'false' AND (res::jsonb->>'pending_payment_count') = '1', res);
END $$;

SELECT count(*) FILTER (WHERE l LIKE 'PASS%') AS passed, count(*) FILTER (WHERE l LIKE 'FAIL%') AS failed,
       string_agg(l, E'\n') FILTER (WHERE l LIKE 'FAIL%') AS failures
FROM unnest(string_to_array(current_setting('t.res'), E'\n')) l WHERE l <> '';
ROLLBACK;
