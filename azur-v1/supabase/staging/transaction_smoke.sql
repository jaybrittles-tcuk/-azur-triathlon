-- STAGING ONLY: non-destructive smoke test; synthetic rows are rolled back.
-- Uses Supabase's real auth schema and the deployed import transactions.
begin;
DO $$
declare user_a uuid:=gen_random_uuid();
declare user_b uuid:=gen_random_uuid();
declare athlete_a uuid:=gen_random_uuid();
declare athlete_b uuid:=gen_random_uuid();
declare source_id text:='staging-smoke-'||gen_random_uuid()::text;
declare staged record;
declare accepted record;
declare approved record;
declare replay record;
declare before_count bigint;
begin
 if current_setting('azur.staging_project_ref',true) is distinct from 'juvceqrzkeethontnezw' then raise exception 'Wrong staging project'; end if;
 select count(*) into before_count from public.completed_activity;
 insert into auth.users(id) values(user_a),(user_b);
 insert into public.athlete_profile(id,user_id,display_name,ftp_w) values(athlete_a,user_a,'Synthetic smoke athlete',250),(athlete_b,user_b,'Synthetic isolation athlete',250);
 select * into staged from public.stage_intervals_activity(athlete_a,source_id,now(),4026,41840,214,234,'{"synthetic":true}'::jsonb);
 if staged.outcome <> 'pending_review' then raise exception 'Unexpected staging result'; end if;
 begin
  perform * from public.accept_staged_intervals_ride(athlete_b,staged.stage_id,true);
  raise exception 'Wrong athlete was accepted';
 exception when raise_exception then if SQLERRM='Wrong athlete was accepted' then raise; end if; end;
 select * into accepted from public.accept_staged_intervals_ride(athlete_a,staged.stage_id,true);
 if accepted.outcome <> 'imported_pending_load_review' then raise exception 'Acceptance failed'; end if;
 if (select processed_metrics->>'load_status' from public.completed_activity where id=accepted.activity_id) <> 'pending_validation' then raise exception 'Premature load credit'; end if;
 select * into approved from public.validate_intervals_training_load(athlete_a,accepted.activity_id,true);
 if approved.outcome <> 'validated' or approved.training_stress <> 98 then raise exception 'Unexpected approved score'; end if;
 select * into replay from public.validate_intervals_training_load(athlete_a,accepted.activity_id,true);
 if replay.outcome <> 'already_validated' or replay.training_stress <> 98 then raise exception 'Load replay changed score'; end if;
 select * into replay from public.accept_staged_intervals_ride(athlete_a,staged.stage_id,true);
 if replay.outcome <> 'already_imported' or replay.activity_id <> accepted.activity_id then raise exception 'Acceptance replay changed activity'; end if;
 if (select count(*) from public.completed_activity) <> before_count+1 then raise exception 'More than one activity was created'; end if;
 if (select planned_session_id from public.completed_activity where id=accepted.activity_id) is not null then raise exception 'Unexpected planned-session change'; end if;
 if has_function_privilege('authenticated','public.validate_intervals_training_load(uuid,uuid,boolean)','EXECUTE') or has_function_privilege('anon','public.accept_staged_intervals_ride(uuid,uuid,boolean)','EXECUTE') then raise exception 'Browser role has privileged RPC access'; end if;
end $$;
rollback;
select 'PASS: staged, accepted, validated to 98 stress points, replayed without duplication, and rolled back all synthetic data' as result;
