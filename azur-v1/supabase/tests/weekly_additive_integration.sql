-- Disposable Postgres only: create existing 25-minute swim then add a 35-minute run.
insert into auth.users(id,raw_app_meta_data) values ('11111111-1111-1111-1111-111111111111','{"role":"coach"}'::jsonb);
insert into public.athlete_profile(id,user_id,normal_weekly_hours) values ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',1);
insert into public.coach_athlete_assignment values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
insert into public.season_week(athlete_id,week_start,phase,target_hours) values
('22222222-2222-2222-2222-222222222222','2026-11-09','base',1);
insert into public.planned_session(season_week_id,athlete_id,planned_date,sport,title,session_class,priority,duration_min,targets,prescription,status,locked,version,is_active_version)
select id,athlete_id,'2026-11-09','swim','Original swim','easy',2,25,'{}','{"blocks":[{"distance":100}]}','planned',false,1,true from public.season_week;
insert into public.weekly_plan_draft(athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_by)
values ('22222222-2222-2222-2222-222222222222','2026-11-09',1,'base',
'[{"date":"2026-11-11","session":{"sport":"run","title":"Approved easy run","sessionClass":"endurance","priority":2,"durationMin":35,"targets":{},"prescription":{"steps":[{"durationMin":35,"target":"easy"}]}}}]','test-snapshot','11111111-1111-1111-1111-111111111111');
select public.capture_weekly_additive_baseline(id) from public.weekly_plan_draft;
insert into public.weekly_plan_decision(draft_id,coach_user_id,decision) select id,'11111111-1111-1111-1111-111111111111','approved' from public.weekly_plan_draft;
do $$ declare d uuid; x jsonb;begin
 select id into d from public.weekly_plan_draft limit 1;
 x:=public.publish_verified_additive_week(d);
 if x->>'status'<>'published_additions' or (x->>'added')::int<>1 then raise exception 'Additive publication failed';end if;
 if (select count(*) from public.planned_session)<>2 then raise exception 'Original not preserved';end if;
 if (select count(*) from public.planned_session where title='Original swim')<>1 then raise exception 'Existing swim altered';end if;
 begin perform public.publish_verified_additive_week(d);raise exception 'Duplicate publication accepted';
 exception when others then if sqlerrm<>'Existing week changed since coach review' then raise;end if;end;
end$$;
select 'PASS: approved additive publication preserves existing and rejects duplicates' as result;

-- Changing an original session after baseline capture must abort publication.
insert into public.season_week(athlete_id,week_start,phase,target_hours)
values ('22222222-2222-2222-2222-222222222222','2026-11-16','base',1);
insert into public.planned_session(season_week_id,athlete_id,planned_date,sport,title,session_class,priority,duration_min,targets,prescription,status,locked,version,is_active_version)
select id,athlete_id,'2026-11-16','swim','Original swim','easy',2,25,'{}','{"blocks":[{"distance":100}]}','planned',false,1,true from public.season_week where week_start='2026-11-16';
insert into public.weekly_plan_draft(athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_by)
values ('22222222-2222-2222-2222-222222222222','2026-11-16',1,'base',
'[{"date":"2026-11-18","session":{"sport":"run","title":"Approved easy run","sessionClass":"endurance","priority":2,"durationMin":35,"targets":{},"prescription":{"steps":[{"durationMin":35,"target":"easy"}]}}}]','test-changed','11111111-1111-1111-1111-111111111111');
select public.capture_weekly_additive_baseline(id) from public.weekly_plan_draft where week_start='2026-11-16';
insert into public.weekly_plan_decision(draft_id,coach_user_id,decision) select id,'11111111-1111-1111-1111-111111111111','approved' from public.weekly_plan_draft where week_start='2026-11-16';
update public.planned_session set duration_min=30 where planned_date='2026-11-16';
do $$ declare d uuid;begin
 select id into d from public.weekly_plan_draft where week_start='2026-11-16';
 begin perform public.publish_verified_additive_week(d);raise exception 'Changed baseline accepted';
 exception when others then if sqlerrm<>'Existing week changed since coach review' then raise;end if;end;
end$$;
-- Unapproved additions can never be published.
insert into public.season_week(athlete_id,week_start,phase,target_hours)
values ('22222222-2222-2222-2222-222222222222','2026-11-23','base',1);
insert into public.planned_session(season_week_id,athlete_id,planned_date,sport,title,session_class,priority,duration_min,targets,prescription,status,locked,version,is_active_version)
select id,athlete_id,'2026-11-23','swim','Original swim','easy',2,25,'{}','{"blocks":[{"distance":100}]}','planned',false,1,true from public.season_week where week_start='2026-11-23';
insert into public.weekly_plan_draft(athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_by)
values ('22222222-2222-2222-2222-222222222222','2026-11-23',1,'base',
'[{"date":"2026-11-25","session":{"sport":"run","title":"Unapproved run","sessionClass":"endurance","priority":2,"durationMin":35,"targets":{},"prescription":{"steps":[{"durationMin":35,"target":"easy"}]}}}]','test-unapproved','11111111-1111-1111-1111-111111111111');
select public.capture_weekly_additive_baseline(id) from public.weekly_plan_draft where week_start='2026-11-23';
do $$ declare d uuid;begin
 select id into d from public.weekly_plan_draft where week_start='2026-11-23';
 begin perform public.publish_verified_additive_week(d);raise exception 'Unapproved addition accepted';
 exception when others then if sqlerrm<>'Latest coach approval required' then raise;end if;end;
end$$;
select 'PASS: changed baseline and unapproved proposals rejected' as result;
