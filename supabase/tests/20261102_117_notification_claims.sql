-- Local-only test for 20261102_117 (disposable Postgres; stubs roles and the table). Raises on failure.
-- Usage: psql -v ON_ERROR_STOP=1 testdb -f setup stub -f migration -f this file.
DO $$
DECLARE w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); r record; n int; ok boolean; fresh uuid;
BEGIN
  TRUNCATE notification_logs;
  INSERT INTO notification_logs(customer_id, notification_type, channel_attempted) VALUES (gen_random_uuid(), 'arrived', 'whatsapp') RETURNING id INTO fresh;

  -- claim once; a second worker gets nothing
  SELECT count(*) INTO n FROM claim_notifications(w1); IF n <> 1 THEN RAISE EXCEPTION 'claim: expected 1, got %', n; END IF;
  SELECT count(*) INTO n FROM claim_notifications(w2); IF n <> 0 THEN RAISE EXCEPTION 'double claim: %', n; END IF;

  -- wrong worker cannot complete
  SELECT complete_notification(fresh, w2, 'sent', 'whatsapp', 'x', NULL) INTO ok; IF ok THEN RAISE EXCEPTION 'foreign worker completed'; END IF;

  -- retryable failure goes back to pending with a delay, not claimable until due
  SELECT complete_notification(fresh, w1, 'retry', NULL, NULL, 'HTTP 503', 600) INTO ok; IF NOT ok THEN RAISE EXCEPTION 'retry not recorded'; END IF;
  SELECT count(*) INTO n FROM claim_notifications(w2); IF n <> 0 THEN RAISE EXCEPTION 'claimed before backoff elapsed'; END IF;
  UPDATE notification_logs SET next_attempt_at = now() - interval '1 second' WHERE id = fresh;
  SELECT count(*) INTO n FROM claim_notifications(w2); IF n <> 1 THEN RAISE EXCEPTION 'not reclaimable after backoff'; END IF;
  SELECT attempts INTO n FROM notification_logs WHERE id = fresh; IF n <> 2 THEN RAISE EXCEPTION 'attempts=%', n; END IF;

  -- success
  SELECT complete_notification(fresh, w2, 'sent', 'whatsapp', 'prov-1', NULL) INTO ok;
  SELECT * INTO r FROM notification_logs WHERE id = fresh;
  IF NOT ok OR r.status <> 'sent' OR r.provider_message_id <> 'prov-1' OR r.sent_at IS NULL THEN RAISE EXCEPTION 'sent not recorded'; END IF;
  SELECT count(*) INTO n FROM claim_notifications(w1); IF n <> 0 THEN RAISE EXCEPTION 'sent row reclaimed'; END IF;

  -- retry limit: attempts reach the cap, row becomes failed and is never claimed again
  UPDATE notification_logs SET status = 'pending', attempts = 5, next_attempt_at = NULL, error_message = 'HTTP 503' WHERE id = fresh;
  SELECT count(*) INTO n FROM claim_notifications(w1, 20, interval '6 hours', interval '5 minutes', 5); IF n <> 0 THEN RAISE EXCEPTION 'claimed past limit'; END IF;
  IF (SELECT status FROM notification_logs WHERE id = fresh) <> 'failed' THEN RAISE EXCEPTION 'limit not terminal'; END IF;

  -- abandoned claim: not resent, marked failed; a late worker can still correct it to sent
  UPDATE notification_logs SET status = 'pending', attempts = 0, claimed_by = NULL, error_message = NULL WHERE id = fresh;
  PERFORM 1 FROM claim_notifications(w1);
  UPDATE notification_logs SET claimed_at = now() - interval '10 minutes' WHERE id = fresh;
  SELECT count(*) INTO n FROM claim_notifications(w2); IF n <> 0 THEN RAISE EXCEPTION 'abandoned claim was handed out again'; END IF;
  SELECT * INTO r FROM notification_logs WHERE id = fresh;
  IF r.status <> 'failed' OR r.error_message NOT LIKE 'abandoned:%' THEN RAISE EXCEPTION 'abandoned not recorded: %', r.status; END IF;
  SELECT complete_notification(fresh, w1, 'sent', 'whatsapp', 'late-1', NULL) INTO ok;
  IF NOT ok OR (SELECT status FROM notification_logs WHERE id = fresh) <> 'sent' THEN RAISE EXCEPTION 'late success not corrected'; END IF;

  -- dispatcher functions are not callable by ordinary roles
  IF has_function_privilege('authenticated', 'claim_notifications(uuid,int,interval,interval,int)', 'EXECUTE')
     OR has_function_privilege('anon', 'complete_notification(uuid,uuid,text,text,text,text,int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'dispatch functions exposed to client roles';
  END IF;
  RAISE NOTICE 'notification claim tests passed';
END $$;
