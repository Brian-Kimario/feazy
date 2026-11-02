DO $dry$
DECLARE
  rep jsonb := '{}'::jsonb; r jsonb;
  adm uuid := 'a56652e0-6cce-471c-9926-d168b288a123'; cust uuid := '9b681bca-520d-462a-bd50-521c42f2b098';
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid();
  p4 uuid := gen_random_uuid(); p5 uuid := gen_random_uuid(); p6 uuid := gen_random_uuid();
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v6 uuid; d1 uuid; d2 uuid; d3 uuid; d4 uuid; d6 uuid;
  pth1 text := 'dry110/p1/id/file.png';
BEGIN
  rep := rep || jsonb_build_object('a01_bucket_private', (SELECT NOT public FROM storage.buckets WHERE id='verification-documents'),
    'a02_grants', jsonb_build_object(
      'auth_insert_docs', has_table_privilege('authenticated','public.professional_verification_documents','INSERT'),
      'auth_update_docs', has_table_privilege('authenticated','public.professional_verification_documents','UPDATE'),
      'auth_select_docs', has_table_privilege('authenticated','public.professional_verification_documents','SELECT'),
      'review_authenticated', has_function_privilege('authenticated','public.admin_review_verification_document(uuid,text,text)','EXECUTE'),
      'review_anon', has_function_privilege('anon','public.admin_review_verification_document(uuid,text,text)','EXECUTE'),
      'helper_authenticated', has_function_privilege('authenticated','public._verification_unaccepted_documents(uuid)','EXECUTE')),
    'a03_insert_policy_left', (SELECT count(*) FROM pg_policies WHERE tablename='professional_verification_documents' AND cmd='INSERT'));

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  SELECT x, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', 'dry110.'||left(x::text,8)||'@fixify.invalid',
         '{"role":"professional","full_name":"SYNTHETIC dry110"}','{}',now(),now(),now()
  FROM unnest(ARRAY[p1,p2,p3,p4,p5,p6]) x;
  INSERT INTO public.professional_profiles (user_id, display_name, verification_status, is_available) VALUES
    (p1,'SYNTHETIC dry110 p1','documents_submitted',false),(p2,'SYNTHETIC dry110 p2','documents_submitted',false),
    (p3,'SYNTHETIC dry110 p3','documents_submitted',false),(p4,'SYNTHETIC dry110 p4','suspended',false),
    (p5,'SYNTHETIC dry110 p5','pending',false),(p6,'SYNTHETIC dry110 p6','pending',false)
  ON CONFLICT (user_id) DO UPDATE SET verification_status=EXCLUDED.verification_status, is_available=false;
  INSERT INTO public.professional_verifications (professional_id, status, submitted_at) VALUES (p1,'documents_submitted',now()) RETURNING id INTO v1;
  INSERT INTO public.professional_verifications (professional_id, status, submitted_at) VALUES (p2,'documents_submitted',now()) RETURNING id INTO v2;
  INSERT INTO public.professional_verifications (professional_id, status, submitted_at) VALUES (p3,'documents_submitted',now()) RETURNING id INTO v3;
  INSERT INTO public.professional_verifications (professional_id, status, submitted_at) VALUES (p4,'verified',now()) RETURNING id INTO v4;
  INSERT INTO public.professional_verifications (professional_id, status) VALUES (p6,'pending') RETURNING id INTO v6;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('verification-documents', pth1), ('verification-documents','dry110/p3/id/file.png'),('verification-documents','dry110/p6/id/file.png');
  INSERT INTO public.professional_verification_documents (verification_id, document_type, storage_path, status) VALUES (v1,'id',pth1,'pending') RETURNING id INTO d1;
  INSERT INTO public.professional_verification_documents (verification_id, document_type, storage_path, status, reviewer_id, reviewed_at) VALUES (v2,'id','dry110/p2/MISSING.png','accepted',adm,now()) RETURNING id INTO d2;
  INSERT INTO public.professional_verification_documents (verification_id, document_type, storage_path, status) VALUES (v3,'id','dry110/p3/id/file.png','accepted') RETURNING id INTO d3;
  INSERT INTO public.professional_verification_documents (verification_id, document_type, storage_path, status) VALUES (v4,'id','dry110/p4/anything.png','pending') RETURNING id INTO d4;
  INSERT INTO public.professional_verification_documents (verification_id, document_type, storage_path, status) VALUES (v6,'id','dry110/p6/id/file.png','pending') RETURNING id INTO d6;

  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p1), true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.professional_verification_documents (verification_id, document_type, storage_path, status) VALUES (v1,'id','anything/at/all.png','accepted');
    rep := rep || jsonb_build_object('b01_pro_insert_doc','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('b01_pro_insert_doc', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p1), true);
    SET LOCAL ROLE authenticated;
    UPDATE public.professional_verification_documents SET status='accepted' WHERE id=d1;
    rep := rep || jsonb_build_object('b02_pro_update_own_doc','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('b02_pro_update_own_doc', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    UPDATE public.professional_verification_documents SET status='accepted' WHERE id=d1;
    rep := rep || jsonb_build_object('b03_admin_direct_update','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('b03_admin_direct_update', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p1), true);
    SET LOCAL ROLE authenticated;
    INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('verification-documents', p1::text||'/id/x.png', p1);
    rep := rep || jsonb_build_object('b04_pro_storage_upload','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('b04_pro_storage_upload', SQLSTATE);
  END;
  RESET ROLE;
  rep := rep || jsonb_build_object('b05_doc1_still_pending', (SELECT status FROM public.professional_verification_documents WHERE id=d1));
  SET LOCAL ROLE service_role;
  INSERT INTO public.professional_verification_documents (verification_id, document_type, storage_path, status) VALUES (v1,'other','dry110/p1/other/x.png','pending');
  RESET ROLE;
  rep := rep || jsonb_build_object('b06_service_role_insert','ok');
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p1), true);
  SET LOCAL ROLE authenticated;
  rep := rep || jsonb_build_object('b07_owner_reads', (SELECT count(*) FROM public.professional_verification_documents WHERE verification_id=v1),
                                   'b07b_other_pro_rows_visible', (SELECT count(*) FROM public.professional_verification_documents WHERE verification_id IN (v2,v3)));
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_transition_professional_verification(p1,'approve','documents_submitted','dry run approve','{}'::jsonb);
    rep := rep || jsonb_build_object('c01_approve_pending_doc','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('c01_approve_pending_doc', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_transition_professional_verification(p2,'approve','documents_submitted','dry run approve','{}'::jsonb);
    rep := rep || jsonb_build_object('c02_approve_accepted_file_missing','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('c02_approve_accepted_file_missing', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_transition_professional_verification(p3,'approve','documents_submitted','dry run approve','{}'::jsonb);
    rep := rep || jsonb_build_object('c03_approve_accepted_no_reviewer','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('c03_approve_accepted_no_reviewer', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cust), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_review_verification_document(d1,'accepted',NULL);
    rep := rep || jsonb_build_object('d01_review_nonadmin_customer','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('d01_review_nonadmin_customer', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p1), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_review_verification_document(d1,'accepted',NULL);
    rep := rep || jsonb_build_object('d02_review_nonadmin_pro','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('d02_review_nonadmin_pro', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_review_verification_document(d1,'approved',NULL);
    rep := rep || jsonb_build_object('d03_review_bad_decision','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('d03_review_bad_decision', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_review_verification_document(d1,'rejected','abc');
    rep := rep || jsonb_build_object('d04_reject_without_note','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('d04_reject_without_note', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_review_verification_document(gen_random_uuid(),'accepted',NULL);
    rep := rep || jsonb_build_object('d05_unknown_document','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('d05_unknown_document', SQLSTATE);
  END;
  RESET ROLE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_review_verification_document(d4,'accepted',NULL);
    rep := rep || jsonb_build_object('d06_accept_file_missing','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('d06_accept_file_missing', SQLSTATE);
  END;
  RESET ROLE;
  rep := rep || jsonb_build_object('d06b_d4_still_pending', (SELECT status FROM public.professional_verification_documents WHERE id=d4));
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
  SET LOCAL ROLE authenticated;
  r := public.admin_review_verification_document(d1,'accepted','Looked at the file.');
  RESET ROLE;
  rep := rep || jsonb_build_object('e01_accept_d1','ok');
  rep := rep || jsonb_build_object('e01b_doc', (SELECT jsonb_build_object('status',status,'reviewer_is_admin',reviewer_id=adm,'reviewed',reviewed_at IS NOT NULL,'note',reviewer_notes) FROM public.professional_verification_documents WHERE id=d1));
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_review_verification_document(d1,'rejected','second decision');
    rep := rep || jsonb_build_object('e02_review_twice','NOT REFUSED');
  EXCEPTION WHEN OTHERS THEN rep := rep || jsonb_build_object('e02_review_twice', SQLSTATE);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
  SET LOCAL ROLE authenticated;
  r := public.admin_transition_professional_verification(p1,'approve','documents_submitted','dry run approve','{}'::jsonb);
  RESET ROLE;
  rep := rep || jsonb_build_object('e03_approve_with_evidence','ok');
  rep := rep || jsonb_build_object('e03b_profile', (SELECT jsonb_build_object('status',verification_status,'available',is_available) FROM public.professional_profiles WHERE user_id=p1),
                                   'e03c_events', (SELECT count(*) FROM public.professional_verification_events WHERE professional_id=p1 AND action='approve'));
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p6), true);
  SET LOCAL ROLE authenticated;
  r := public.submit_professional_verification();
  RESET ROLE;
  rep := rep || jsonb_build_object('i01_submit_still_works', r);
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
  SET LOCAL ROLE authenticated;
  r := public.admin_review_verification_document(d6,'rejected','Photo is unreadable.');
  RESET ROLE;
  rep := rep || jsonb_build_object('f01_reject_doc','ok');
  rep := rep || jsonb_build_object('f01b_doc', (SELECT status FROM public.professional_verification_documents WHERE id=d6));
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
  SET LOCAL ROLE authenticated;
  r := public.admin_transition_professional_verification(p4,'reactivate','suspended','dry run reactivate','{}'::jsonb);
  RESET ROLE;
  rep := rep || jsonb_build_object('g01_reactivate_no_new_evidence','ok');
  UPDATE public.professional_profiles SET verification_status='suspended' WHERE user_id=p4 AND false;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
  SET LOCAL ROLE authenticated;
  r := public.admin_transition_professional_verification(p5,'reject','pending','dry run reject','{}'::jsonb);
  RESET ROLE;
  rep := rep || jsonb_build_object('g02_reject_without_docs','ok');
  rep := rep || jsonb_build_object('g02b_status', (SELECT verification_status FROM public.professional_profiles WHERE user_id=p5),
                                   'g01b_status', (SELECT verification_status FROM public.professional_profiles WHERE user_id=p4));
  rep := rep || jsonb_build_object('h01_verified_count_unchanged_in_txn', (SELECT count(*) FROM public.professional_profiles WHERE verification_status='verified' AND display_name NOT LIKE 'SYNTHETIC%'));
  RAISE EXCEPTION 'DRYRUN_REPORT %', rep::text;
END
$dry$;
