-- AZUR V8 (staging): benchmark provenance and first verified workout prescription.
-- Athlete-submitted benchmark_history is NEVER itself coach verification.
create table if not exists public.coach_benchmark_verification(
 benchmark_id uuid primary key references public.athlete_benchmark_history(id) on delete cascade,
 athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 coach_user_id uuid not null,
 decision text not null check(decision in ('verified','rejected')),
 rationale text not null check(length(trim(rationale)) between 15 and 1000),
 verified_at timestamptz not null default now()
);
alter table public.coach_benchmark_verification enable row level security;
revoke all on public.coach_benchmark_verification from anon,authenticated;
grant select on public.coach_benchmark_verification to authenticated;
drop policy if exists benchmark_verification_read_assigned on public.coach_benchmark_verification;
create policy benchmark_verification_read_assigned on public.coach_benchmark_verification
for select to authenticated using(
  (auth.jwt()->'app_metadata'->>'role'='coach' and coach_user_id=auth.uid()
   and exists(select 1 from public.coach_athlete_assignment a
      where a.athlete_id=coach_benchmark_verification.athlete_id
      and a.coach_user_id=auth.uid()))
  or exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=auth.uid())
);

create or replace function public.coach_review_benchmark(p_benchmark_id uuid,
 p_decision text,p_rationale text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $review$
declare v_coach uuid:=auth.uid();v_b public.athlete_benchmark_history%rowtype;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
 then raise exception 'Verified coach account required';end if;
 if p_decision not in ('verified','rejected') or length(trim(coalesce(p_rationale,''))) not between 15 and 1000
 then raise exception 'Verification/rejection and 15–1000 character coaching rationale required';end if;
 select * into v_b from public.athlete_benchmark_history where id=p_benchmark_id for update;
 if not found then raise exception 'Benchmark entry not found';end if;
 if not exists(select 1 from public.coach_athlete_assignment a
   where a.athlete_id=v_b.athlete_id and a.coach_user_id=v_coach)
 then raise exception 'You are not assigned to the athlete';end if;
 if exists(select 1 from public.coach_benchmark_verification where benchmark_id=p_benchmark_id)
 then raise exception 'This benchmark was already reviewed';end if;
 if v_b.assessed_on> (now() at time zone 'Europe/London')::date
 then raise exception 'Future dated test is not eligible';end if;
 if v_b.assessed_on< (now() at time zone 'Europe/London')::date-120
   and p_decision='verified' then raise exception 'Stale test: repeat the assessment';end if;
 if p_decision='verified' and v_b.source not in ('structured_test','coach_assessed','race')
 then raise exception 'A structured test, documented race effort or coach assessment is required; device estimates and manual entries need a new supported assessment';end if;
 if p_decision='verified' and length(trim(coalesce(v_b.source_note,'')))<8
 then raise exception 'Evidence notes are required to substantiate a verified benchmark';end if;
 insert into public.coach_benchmark_verification
  (benchmark_id,athlete_id,coach_user_id,decision,rationale)
 values(p_benchmark_id,v_b.athlete_id,v_coach,p_decision,trim(p_rationale));
 return jsonb_build_object('status',p_decision,'metric',v_b.metric,
   'benchmark_id',p_benchmark_id,'calendar_changed',false);
end;
$review$;
revoke all on function public.coach_review_benchmark(uuid,text,text) from public,anon;
grant execute on function public.coach_review_benchmark(uuid,text,text) to authenticated;

create or replace function public.coach_benchmark_review_queue(p_athlete_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $queue$
declare v_coach uuid:=auth.uid();v_rows jsonb;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
 or not exists(select 1 from public.coach_athlete_assignment a where a.coach_user_id=v_coach and a.athlete_id=p_athlete_id)
 then raise exception 'Assigned coach required';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',b.id,'metric',b.metric,'value',b.value,'assessed_on',b.assessed_on,
 'source',b.source,'source_note',b.source_note,'verification',v.decision,
 'verified_at',v.verified_at,'rationale',v.rationale)
 order by b.assessed_on desc,b.recorded_at desc),'[]'::jsonb)
 into v_rows from public.athlete_benchmark_history b
 left join public.coach_benchmark_verification v on v.benchmark_id=b.id
 where b.athlete_id=p_athlete_id;
 return jsonb_build_object('benchmarks',v_rows,'coach_review_required',true);
end;
$queue$;
revoke all on function public.coach_benchmark_review_queue(uuid) from public,anon;
grant execute on function public.coach_benchmark_review_queue(uuid) to authenticated;

create or replace function public.coach_verified_workout_preview(p_athlete_id uuid,p_workout_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $workout$
declare
 v_coach uuid:=auth.uid();
 v_lib public.coach_workout_library%rowtype;
 v_metric text;v_value numeric;v_date date;v_approved uuid;
 v_steps jsonb:='[]'::jsonb;v_pool jsonb:='[]'::jsonb;
 v_s jsonb;v_pctlow numeric;v_pcthigh numeric;v_floor int;v_ceil int;
 v_css int;v_pace_start int;v_pace_end int;
 v_meter int;v_reps int;v_rest int;v_total int:=0;v_seconds int:=0;
 v_sport text;v_required text;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
 or not exists(select 1 from public.coach_athlete_assignment a
 where a.athlete_id=p_athlete_id and a.coach_user_id=v_coach)
 then raise exception 'Assigned coach required';end if;
 if p_workout_key not in ('azur-bike-aerobic-base-90','azur-bike-tempo-base-75',
  'azur-swim-aerobic-base-55','azur-swim-technique-base-45',
  'azur-run-easy-base-45','azur-run-steady-base-60')
 then raise exception 'Workout has no validated individual-target prescription policy';end if;
 select * into v_lib from public.coach_workout_library
 where workout_key=p_workout_key and approved=true and level=1;
 if not found then raise exception 'Approved coach workout not available';end if;
 v_sport:=v_lib.sport;
 v_metric:=case when v_sport='bike' then 'bike_ftp_w'
  when v_sport='swim' then 'swim_css_sec_100m'
  else null end;
 if v_metric is not null then
   select b.value,b.assessed_on,b.id into v_value,v_date,v_approved
   from public.athlete_benchmark_history b
   join public.coach_benchmark_verification v on v.benchmark_id=b.id
   where b.athlete_id=p_athlete_id and b.metric=v_metric
     and v.decision='verified' and b.assessed_on <= (now() at time zone 'Europe/London')::date
     and b.assessed_on >= (now() at time zone 'Europe/London')::date-120
   order by b.assessed_on desc,v.verified_at desc,b.id desc limit 1;
   if v_value is null then
     return jsonb_build_object('status','benchmark_required','workout_key',p_workout_key,
      'required_metric',v_metric,'reason','No current coach-verified benchmark; use RPE-led aerobic training until an appropriate assessment.',
      'calendar_changed',false);
   end if;
 end if;
 if v_sport='bike' then
   if jsonb_array_length(v_lib.prescription->'steps')<>3
     or v_lib.duration_min not in (75,90) then raise exception 'Bike template has changed; review policy';end if;
   if p_workout_key='azur-bike-aerobic-base-90' then
     v_steps:=jsonb_build_array(
       jsonb_build_object('duration_min',15,'power_min_w',round(v_value*0.50),'power_max_w',round(v_value*0.60),'target','Easy spin'),
       jsonb_build_object('duration_min',65,'power_min_w',round(v_value*0.65),'power_max_w',round(v_value*0.75),'target','Steady aerobic endurance'),
       jsonb_build_object('duration_min',10,'power_min_w',null,'power_max_w',round(v_value*0.55),'target','Easy cooldown'));
   else
     -- Explicit 2 x 18 minutes with a single 4 minute easy recovery.
     -- The 40-minute main block is not 40 minutes of uninterrupted tempo.
     v_steps:=jsonb_build_array(
       jsonb_build_object('duration_min',15,'power_min_w',round(v_value*0.50),'power_max_w',round(v_value*0.70),'target','Warm-up'),
       jsonb_build_object('duration_min',18,'power_min_w',round(v_value*0.78),'power_max_w',round(v_value*0.85),'target','Tempo interval 1'),
       jsonb_build_object('duration_min',4,'power_min_w',null,'power_max_w',round(v_value*0.60),'target','Easy recovery'),
       jsonb_build_object('duration_min',18,'power_min_w',round(v_value*0.78),'power_max_w',round(v_value*0.85),'target','Tempo interval 2'),
       jsonb_build_object('duration_min',20,'power_min_w',round(v_value*0.55),'power_max_w',round(v_value*0.65),'target','Easy endurance and cooldown'));
   end if;
 elsif v_sport='swim' then
   if jsonb_typeof(v_lib.prescription->'poolSegments')<>'array'
    then raise exception 'Approved swim template missing structured pool segments';end if;
   v_css:=round(v_value)::int;
   for v_s in select value from jsonb_array_elements(v_lib.prescription->'poolSegments') loop
     v_reps:=(v_s->>'repeats')::int;
     v_meter:=(v_s->>'distanceMeters')::int;
     v_rest:=(v_s->>'restSeconds')::int;
     if v_reps not between 1 and 20 or v_meter not between 25 and 800
       or v_rest not between 0 and 120 then raise exception 'Unsafe pool prescription block';end if;
     v_total:=v_total+v_reps*v_meter;
     if v_s->>'target' like 'CSS + 8-15%' then
       v_pace_start:=v_css+8;v_pace_end:=v_css+15;
     elsif v_s->>'target' like 'CSS + 12-18%' then
       v_pace_start:=v_css+12;v_pace_end:=v_css+18;
     else
       v_pace_start:=null;v_pace_end:=null;
     end if;
     v_pool:=v_pool||jsonb_build_array(jsonb_build_object(
       'repeats',v_reps,'distance_m',v_meter,'rest_seconds',v_rest,
       'purpose',v_s->>'purpose','pace_min_seconds_per_100m',v_pace_start,
       'pace_max_seconds_per_100m',v_pace_end,
       'target',case when v_pace_start is null then v_s->>'target'
         else 'Verified CSS + specified aerobic margin' end));
   end loop;
 else
   if jsonb_typeof(v_lib.prescription->'steps')<>'array' then raise exception 'Run steps missing';end if;
   for v_s in select value from jsonb_array_elements(v_lib.prescription->'steps') loop
     v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
       'duration_min',(v_s->>'durationMin')::int,'target',v_s->>'target',
       'intensity_basis','RPE/conversational'));
   end loop;
 end if;
 if v_sport<>'swim' then
   select coalesce(sum((s.value->>'duration_min')::int),0) into v_seconds
   from jsonb_array_elements(v_steps) s;
   if v_seconds<>v_lib.duration_min then raise exception 'Workout blocks do not add up to approved session duration';end if;
 end if;
 return jsonb_build_object(
   'status','ready_for_coach_review','workout_key',p_workout_key,
   'title',v_lib.title,'sport',v_lib.sport,'duration_min',v_lib.duration_min,
   'benchmark_metric',v_metric,'benchmark_value',v_value,
   'benchmark_assessed_on',v_date,'verified_benchmark_id',v_approved,
   'steps',v_steps,'pool_segments',v_pool,'swim_total_distance_m',case when v_sport='swim' then v_total else null end,
   'approved_library_version',v_lib.id,'coach_review_required',true,
   'publication_allowed',false,'calendar_changed',false,
   'note','Individual targets are a preview of an approved workout, not a published or medically validated prescription. Verify readiness and sport-specific load before scheduling.');
end;
$workout$;
revoke all on function public.coach_verified_workout_preview(uuid,text) from public,anon;
grant execute on function public.coach_verified_workout_preview(uuid,text) to authenticated;
