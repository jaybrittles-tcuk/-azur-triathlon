-- Executed only in GitHub Actions disposable Postgres service.
insert into auth.users(id,raw_app_meta_data) values
 ('11111111-1111-1111-1111-111111111111','{"role":"coach"}'::jsonb),
 ('44444444-4444-4444-4444-444444444444','{}'::jsonb);
insert into public.athlete_profile(id,user_id,normal_weekly_hours)
values ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',1);
insert into public.coach_athlete_assignment(coach_user_id,athlete_id)
values ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222'),
 ('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222');
insert into public.season_week(athlete_id,week_start,phase,target_hours)
select '22222222-2222-2222-2222-222222222222',x::date,'base',1
from generate_series('2026-11-09'::timestamp,'2026-12-07'::timestamp,interval '7 days') x;
create temporary table test_session(sessions jsonb not null);
insert into test_session values ('[{"date":"2026-11-09","session":{"sport":"run","title":"Approved easy run","sessionClass":"endurance","priority":1,"durationMin":60,"targets":{},"prescription":{"steps":[{"durationMin":60,"target":"easy aerobic"}]},"rationale":"Base aerobic training"}}]'::jsonb);
insert into public.weekly_plan_draft(athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_by)
select '22222222-2222-2222-2222-222222222222','2026-11-09',1,'base',sessions,'fixture-fingerprint',
'11111111-1111-1111-1111-111111111111' from test_session;
insert into public.weekly_plan_decision(draft_id,coach_user_id,decision)
select id,'11111111-1111-1111-1111-111111111111','approved'
from public.weekly_plan_draft where week_start='2026-11-09';
do $$ declare d uuid; r jsonb; begin
 select id into d from public.weekly_plan_draft where week_start='2026-11-09';
 r:=public.publish_verified_weekly_draft(d);
 if r->>'status'<>'published_verified' or (r->>'sessions')::integer<>1 or (r->>'minutes')::integer<>60
 then raise exception 'Approved draft publishing failed'; end if;
 if (select count(*) from public.planned_session where planned_date='2026-11-09')<>1
 then raise exception 'Calendar readback mismatch'; end if;
 begin
  perform public.publish_verified_weekly_draft(d);
  raise exception 'Duplicate publication was accepted';
 exception when others then
  if sqlerrm<>'Existing active sessions require reconciliation; no overwrite' then raise; end if;
 end;
 if (select count(*) from public.planned_session where planned_date='2026-11-09')<>1
 then raise exception 'Duplicate calendar row created'; end if;
end $$;
-- Previously approved revision must become invalid when a later draft exists.
insert into public.weekly_plan_draft(athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_by)
select '22222222-2222-2222-2222-222222222222','2026-11-16',1,'base',
jsonb_set(sessions,'{0,date}','"2026-11-16"'::jsonb),'fixture-old',
'11111111-1111-1111-1111-111111111111' from test_session;
insert into public.weekly_plan_decision(draft_id,coach_user_id,decision)
select id,'11111111-1111-1111-1111-111111111111','approved'
from public.weekly_plan_draft where week_start='2026-11-16' and revision=1;
insert into public.weekly_plan_draft(athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_by)
select athlete_id,week_start,2,phase,sessions,'fixture-new',created_by
from public.weekly_plan_draft where week_start='2026-11-16' and revision=1;
do $$ declare d uuid; begin
 select id into d from public.weekly_plan_draft where week_start='2026-11-16' and revision=1;
 begin
  perform public.publish_verified_weekly_draft(d);
  raise exception 'Superseded revision was published';
 exception when others then
  if sqlerrm<>'Superseded draft cannot publish' then raise; end if;
 end;
end $$;
-- Revoked approval must block publication.
insert into public.weekly_plan_draft(athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_by)
select '22222222-2222-2222-2222-222222222222','2026-11-23',1,'base',
jsonb_set(sessions,'{0,date}','"2026-11-23"'::jsonb),'fixture-revoke',
'11111111-1111-1111-1111-111111111111' from test_session;
insert into public.weekly_plan_decision(draft_id,coach_user_id,decision,decided_at)
select id,'11111111-1111-1111-1111-111111111111','approved',now()
from public.weekly_plan_draft where week_start='2026-11-23';
insert into public.weekly_plan_decision(draft_id,coach_user_id,decision,decided_at)
select id,'11111111-1111-1111-1111-111111111111','rejected',now()+interval '1 second'
from public.weekly_plan_draft where week_start='2026-11-23';
do $$ declare d uuid; begin
 select id into d from public.weekly_plan_draft where week_start='2026-11-23';
 begin
  perform public.publish_verified_weekly_draft(d);
  raise exception 'Revoked approval was published';
 exception when others then
  if sqlerrm<>'Current draft lacks latest coach approval' then raise; end if;
 end;
end $$;
-- Empty approval and non-coach decision rejection.
insert into public.weekly_plan_draft(athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_by)
select '22222222-2222-2222-2222-222222222222','2026-11-30',1,'base',
jsonb_set(sessions,'{0,date}','"2026-11-30"'::jsonb),'fixture-unapproved',
'11111111-1111-1111-1111-111111111111' from test_session;
do $$ declare d uuid; begin
 select id into d from public.weekly_plan_draft where week_start='2026-11-30';
 begin
  perform public.publish_verified_weekly_draft(d);
  raise exception 'Unapproved draft was published';
 exception when others then
  if sqlerrm<>'Current draft lacks latest coach approval' then raise; end if;
 end;
 begin
  insert into public.weekly_plan_decision(draft_id,coach_user_id,decision)
  values (d,'44444444-4444-4444-4444-444444444444','approved');
  raise exception 'Noncoach approval was accepted';
 exception when others then
  if sqlerrm<>'Verified coach role required' then raise; end if;
 end;
end $$;
do $$ begin
 if has_function_privilege('authenticated','public.publish_verified_weekly_draft(uuid)','execute') then
  raise exception 'Browser users can invoke publisher'; end if;
 if not has_function_privilege('service_role','public.publish_verified_weekly_draft(uuid)','execute') then
  raise exception 'Service role cannot invoke publisher'; end if;
 if has_function_privilege('service_role','public.publish_approved_training_week(uuid,date,jsonb,text)','execute') then
  raise exception 'Legacy publisher still callable'; end if;
end $$;
select 'PASS: verified publish, readback, duplicate, superseded, revoked, unapproved, role and permissions' as result;
