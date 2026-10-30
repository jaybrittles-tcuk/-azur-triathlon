\set ON_ERROR_STOP on
DO $$
declare a uuid:='00000000-0000-4000-8000-000000000001';
declare b uuid:='00000000-0000-4000-8000-000000000002';
declare ride uuid;
declare r record;
declare before_metrics jsonb;
declare before_count integer;
begin
 select id,processed_metrics into ride,before_metrics from public.completed_activity where athlete_id=a and source_activity_id='zwift-29';
 select count(*) into before_count from public.completed_activity;
 begin
  perform * from public.validate_intervals_training_load(a,ride,true);
  raise exception 'Missing FTP unexpectedly allowed';
 exception when raise_exception then if SQLERRM='Missing FTP unexpectedly allowed' then raise; end if; end;
 if (select processed_metrics from public.completed_activity where id=ride) is distinct from before_metrics then raise exception 'Failed validation changed metrics'; end if;
 update public.athlete_profile set ftp_w=250 where id=a;
 begin
  perform * from public.validate_intervals_training_load(b,ride,true);
  raise exception 'Wrong athlete unexpectedly allowed';
 exception when raise_exception then if SQLERRM='Wrong athlete unexpectedly allowed' then raise; end if; end;
 begin
  perform * from public.validate_intervals_training_load(a,ride,false);
  raise exception 'Missing consent unexpectedly allowed';
 exception when raise_exception then if SQLERRM='Missing consent unexpectedly allowed' then raise; end if; end;
 -- A second platform record arriving between acceptance and validation blocks credit.
 insert into public.completed_activity(athlete_id,sport,source,source_activity_id,start_time,duration_sec,distance_m)
 values(a,'bike','garmin','late-overlap','2026-10-29 06:49:30+00',4026,41840);
 begin
  perform * from public.validate_intervals_training_load(a,ride,true);
  raise exception 'Late duplicate unexpectedly allowed';
 exception when raise_exception then if SQLERRM='Late duplicate unexpectedly allowed' then raise; end if; end;
 delete from public.completed_activity where source_activity_id='late-overlap';
 -- Missing NP cannot be replaced by average power.
 update public.intervals_import_inbox set normalized_power_w=null where athlete_id=a and source_activity_id='zwift-29';
 begin
  perform * from public.validate_intervals_training_load(a,ride,true);
  raise exception 'Missing NP unexpectedly allowed';
 exception when raise_exception then if SQLERRM='Missing NP unexpectedly allowed' then raise; end if; end;
 update public.intervals_import_inbox set normalized_power_w=234 where athlete_id=a and source_activity_id='zwift-29';
 update public.completed_activity set processed_metrics=processed_metrics||'{"is_test":true}'::jsonb where id=ride;
 begin
  perform * from public.validate_intervals_training_load(a,ride,true);
  raise exception 'Test ride unexpectedly allowed';
 exception when raise_exception then if SQLERRM='Test ride unexpectedly allowed' then raise; end if; end;
 update public.completed_activity set processed_metrics=before_metrics where id=ride;
 select * into r from public.validate_intervals_training_load(a,ride,true);
 if r.outcome <> 'validated' or r.training_stress <> 98 then raise exception 'Wrong validated score: %',r; end if;
 select processed_metrics into before_metrics from public.completed_activity where id=ride;
 if before_metrics->>'ftp_w_at_validation' <> '250' or before_metrics->>'normalized_power' <> '234' then raise exception 'Power/FTP snapshot missing'; end if;
 update public.athlete_profile set ftp_w=350 where id=a;
 select * into r from public.validate_intervals_training_load(a,ride,true);
 if r.outcome <> 'already_validated' or r.training_stress <> 98 then raise exception 'Repeated validation changed score'; end if;
 if (select processed_metrics from public.completed_activity where id=ride) is distinct from before_metrics then raise exception 'Replay rewrote validation'; end if;
 if (select count(*) from public.completed_activity) <> before_count then raise exception 'Validation inserted extra activity'; end if;
 if (select planned_session_id from public.completed_activity where id=ride) is not null then raise exception 'Validation linked a planned session'; end if;
 if has_function_privilege('authenticated','public.validate_intervals_training_load(uuid,uuid,boolean)','EXECUTE')
 or has_function_privilege('anon','public.validate_intervals_training_load(uuid,uuid,boolean)','EXECUTE') then raise exception 'Client role can approve load'; end if;
end $$;
-- Exercise the deployed server grants with another accepted activity.
set role service_role;
select * from public.validate_intervals_training_load('00000000-0000-4000-8000-000000000001',
 (select id from public.completed_activity where source='intervals' and source_activity_id='zwift-unique'),true);
reset role;
select 'PASS: load consent, FTP/NP, ownership, late duplicates, test exclusion, score snapshot and idempotence' as result;
