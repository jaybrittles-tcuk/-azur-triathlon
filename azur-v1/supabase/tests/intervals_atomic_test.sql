\set ON_ERROR_STOP on
DO $$
DECLARE a uuid := '00000000-0000-4000-8000-000000000001';
DECLARE b uuid := '00000000-0000-4000-8000-000000000002';
DECLARE r record;
BEGIN
 SELECT * INTO r FROM public.stage_intervals_activity(a,'zwift-29','2026-10-29 06:49:22+00',4026,41840,214,234,'{"name":"VO2 Into Tempo"}');
 IF r.outcome <> 'pending_review' THEN RAISE EXCEPTION 'Fresh ride should be pending review: %',r.outcome; END IF;
 SELECT * INTO r FROM public.stage_intervals_activity(a,'zwift-29','2026-10-29 06:49:22+00',4026,41840,214,234,'{}');
 IF r.outcome <> 'already_staged' THEN RAISE EXCEPTION 'Repeated ride must be idempotent'; END IF;
 IF (SELECT count(*) FROM public.intervals_import_inbox WHERE athlete_id=a AND source_activity_id='zwift-29') <> 1 THEN RAISE EXCEPTION 'Duplicate inbox rows'; END IF;
 INSERT INTO public.completed_activity(athlete_id,sport,source,source_activity_id,start_time,duration_sec,distance_m)
 VALUES(a,'bike','garmin','garmin-1','2026-10-27 08:00+00',3600,30000);
 SELECT * INTO r FROM public.stage_intervals_activity(a,'zwift-27','2026-10-27 08:01+00',3602,30040,211,225,'{}');
 IF r.outcome <> 'possible_duplicate' THEN RAISE EXCEPTION 'Garmin overlap should be flagged'; END IF;
 SELECT * INTO r FROM public.stage_intervals_activity(a,'zwift-unique','2026-10-27 16:00+00',3600,30000,211,225,'{}');
 IF r.outcome <> 'pending_review' THEN RAISE EXCEPTION 'Distinct ride should remain pending'; END IF;
 SELECT * INTO r FROM public.stage_intervals_activity(b,'zwift-29','2026-10-29 06:49:22+00',4026,41840,214,234,'{}');
 IF r.outcome <> 'pending_review' THEN RAISE EXCEPTION 'Athlete IDs must remain separated'; END IF;
 SELECT * INTO r FROM public.stage_intervals_activity(a,'zwift-29-alt','2026-10-29 06:50:00+00',4029,41850,214,234,'{}');
 IF r.outcome <> 'possible_duplicate' THEN RAISE EXCEPTION 'Overlapping staged ride with different source ID must be quarantined'; END IF;
 IF (SELECT count(*) FROM public.completed_activity) <> 1 THEN RAISE EXCEPTION 'Staging changed completed activities'; END IF;
END $$;
DO $$
DECLARE fn text:='public.stage_intervals_activity(uuid,text,timestamptz,integer,numeric,numeric,numeric,jsonb)';
BEGIN
 IF has_function_privilege('authenticated',fn,'EXECUTE') OR has_function_privilege('anon',fn,'EXECUTE') THEN
  RAISE EXCEPTION 'Client roles unexpectedly have staging RPC access';
 END IF;
 IF has_table_privilege('authenticated','public.intervals_import_inbox','INSERT')
   OR has_table_privilege('authenticated','public.intervals_import_inbox','UPDATE')
   OR has_table_privilege('anon','public.intervals_import_inbox','SELECT') THEN
  RAISE EXCEPTION 'Inbox table privileges too permissive';
 END IF;
END $$;
DO $$ BEGIN
 BEGIN
  PERFORM * FROM public.stage_intervals_activity('00000000-0000-4000-8000-000000000001','','2026-10-29 06:49+00',0,0,0,0,'{}');
  RAISE EXCEPTION 'Invalid input unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM = 'Invalid input unexpectedly accepted' THEN RAISE; END IF;
 END;
END $$;
select 'PASS: idempotency, Garmin overlap, different rides, athlete isolation, privileges, invalid data' as result;
