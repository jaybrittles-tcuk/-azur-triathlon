-- Run after installing the pilot-flow migration.
-- Synthetic users and every mutation must be rolled back by the caller.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
values
 ('b3700000-0000-4000-8000-000000000001','pilot-coach-a@example.invalid',now(),'{"role":"coach"}'),
 ('b3700000-0000-4000-8000-000000000002','pilot-coach-b@example.invalid',now(),'{"role":"coach"}'),
 ('b3700000-0000-4000-8000-000000000003','pilot-athlete@example.invalid',now(),'{}'),
 ('b3700000-0000-4000-8000-000000000004','pilot-other@example.invalid',now(),'{}');
insert into public.athlete_profile(id,user_id,display_name,ftp_w) values
 ('b3710000-0000-4000-8000-000000000003','b3700000-0000-4000-8000-000000000003','Synthetic pilot athlete',250),
 ('b3710000-0000-4000-8000-000000000004','b3700000-0000-4000-8000-000000000004','Synthetic unassigned athlete',250);
create temporary table pilot_template as
 select workout_id,workout_version,duration_min,jsonb_build_object(
 'source','azur-workout-library','workoutId',workout_id,'workoutVersion',workout_version,
 'coachApproved',true,'ftpAtPrescription',250,'resolvedSteps','[]'::jsonb,
 'azurWorkout',jsonb_build_object('steps',canonical_steps)
 ) as prescription
 from azur_private.bike_template_canonical
 where duration_min=trunc(duration_min) and duration_min between 15 and 120
 order by workout_id limit 1;
grant select on pilot_template to authenticated;
insert into public.coach_workout_approval_event(workout_id,workout_version,level,phases,decision,decided_by,decided_at)
 select workout_id,workout_version,1,array['base'],'approved','b3700000-0000-4000-8000-000000000001',now()+interval '1 minute' from pilot_template;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b3700000-0000-4000-8000-000000000001","email":"pilot-coach-a@example.invalid","role":"authenticated","app_metadata":{"role":"coach"}}',true);
insert into public.coach_athlete_invitation(id,coach_user_id,invitee_email)
 values('b3720000-0000-4000-8000-000000000001','b3700000-0000-4000-8000-000000000001','pilot-athlete@example.invalid');
select set_config('request.jwt.claims','{"sub":"b3700000-0000-4000-8000-000000000004","email":"pilot-other@example.invalid","role":"authenticated","app_metadata":{}}',true);
do $$ declare n integer; begin
 update public.coach_athlete_invitation set accepted_at=now(),accepted_by=auth.uid() where id='b3720000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Other athlete accepted invitation';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"b3700000-0000-4000-8000-000000000003","email":"pilot-athlete@example.invalid","role":"authenticated","app_metadata":{}}',true);
update public.coach_athlete_invitation set accepted_at=now(),accepted_by=auth.uid() where id='b3720000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims','{"sub":"b3700000-0000-4000-8000-000000000001","email":"pilot-coach-a@example.invalid","role":"authenticated","app_metadata":{"role":"coach"}}',true);
do $$ declare t record; denied boolean:=false; begin
 if not exists(select 1 from public.coach_athlete_assignment where athlete_id='b3710000-0000-4000-8000-000000000003') then raise exception 'Acceptance did not assign coach';end if;
 select * into strict t from pilot_template;
 begin
  perform public.coach_schedule_bike_with_week('b3710000-0000-4000-8000-000000000004',current_date,t.workout_id,t.workout_version,'Synthetic pilot workout',t.duration_min::integer,t.prescription,'Synthetic test','base',8);
 exception when others then if sqlerrm not like '%not assigned%' then raise;end if;denied:=true;end;
 if not denied then raise exception 'Unassigned scheduling allowed';end if;
 perform public.coach_schedule_bike_with_week('b3710000-0000-4000-8000-000000000003',current_date,t.workout_id,t.workout_version,'Synthetic pilot workout',t.duration_min::integer,t.prescription,'Synthetic test','base',8);
 denied:=false;
 begin
  perform public.coach_schedule_bike_with_week('b3710000-0000-4000-8000-000000000003',current_date,t.workout_id,t.workout_version,'Synthetic pilot workout',t.duration_min::integer,t.prescription,'Synthetic test','base',8);
 exception when others then if sqlerrm not like '%already has%' then raise;end if;denied:=true;end;
 if not denied then raise exception 'Duplicate schedule allowed';end if;
end $$;

select set_config('request.jwt.claims','{"sub":"b3700000-0000-4000-8000-000000000003","email":"pilot-athlete@example.invalid","role":"authenticated","app_metadata":{}}',true);
do $$ declare s uuid; begin
 select id into strict s from public.planned_session where athlete_id='b3710000-0000-4000-8000-000000000003' and planned_date=current_date;
 perform public.athlete_record_manual_completion(s,45,20,4,'Initial notes');
 perform public.athlete_save_session_feedback(s,6,'Updated effort and notes');
 if not exists(select 1 from public.completed_activity where planned_session_id=s and session_rpe=6 and notes='Updated effort and notes') then raise exception 'Manual effort not synchronized';end if;
 perform public.athlete_edit_manual_completion(s,50,22,5,'Edited manual workout');
end $$;
select set_config('request.jwt.claims','{"sub":"b3700000-0000-4000-8000-000000000001","email":"pilot-coach-a@example.invalid","role":"authenticated","app_metadata":{"role":"coach"}}',true);
do $$ begin
 if not exists(select 1 from public.session_feedback where athlete_id='b3710000-0000-4000-8000-000000000003' and session_rpe=5 and notes='Edited manual workout') then raise exception 'Assigned coach cannot see latest feedback';end if;
 if not exists(select 1 from public.completed_activity where athlete_id='b3710000-0000-4000-8000-000000000003' and duration_sec=3000 and distance_m=22000 and session_rpe=5) then raise exception 'Assigned coach cannot see latest actuals';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"b3700000-0000-4000-8000-000000000002","email":"pilot-coach-b@example.invalid","role":"authenticated","app_metadata":{"role":"coach"}}',true);
do $$ begin
 if exists(select 1 from public.session_feedback where athlete_id='b3710000-0000-4000-8000-000000000003') then raise exception 'Unassigned coach can read feedback';end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.coach_schedule_bike_with_week(uuid,date,text,integer,text,integer,jsonb,text,text,numeric)','execute')
 or has_function_privilege('anon','public.athlete_save_session_feedback(uuid,integer,text)','execute')
 then raise exception 'Anonymous write access';end if;
end $$;
select 'PASS invitation ownership, acceptance, new-week scheduling, replay rejection, completion, feedback edits, assigned coach visibility and unassigned denial' as result;

rollback;
