-- Staging: safe, meaningful foundation workout structure for existing and newly generated starter weeks.
-- Athlete-owned, re-entrant, future-only. No VO2, FTP, CSS, faster paces or volume changes.
create or replace function public.athlete_enrich_foundation_sessions()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp
as $enrich$
declare
 v_user uuid:=auth.uid();
 v_athlete uuid;
 v_setup public.athlete_onboarding%rowtype;
 v_today date:=(now() at time zone 'Europe/London')::date;
 v_s record;
 v_sport text;
 v_duration int;
 v_variant int;
 v_seen_bike int:=0;
 v_seen_swim int:=0;
 v_seen_run int:=0;
 v_remain int;
 v_warm int;
 v_cool int;
 v_work int;
 v_n int;
 v_steps jsonb;
 v_target_steps jsonb;
 v_segments jsonb;
 v_step jsonb;
 v_type text;
 v_min_rpe int;
 v_max_rpe int;
 v_title text;
 v_why text;
 v_focus text;
 v_count int:=0;
 v_unchanged int:=0;
 v_original int;
 v_check int;
begin
 if v_user is null or auth.jwt()->'app_metadata'->>'role'='coach'
 then raise exception 'An authenticated athlete is required';end if;
 perform pg_advisory_xact_lock(hashtext(v_user::text),55103);
 select * into v_setup from public.athlete_onboarding where user_id=v_user and onboarding_step=3;
 if not found then raise exception 'Complete athlete onboarding first';end if;
 if coalesce(v_setup.current_training_concern,'unsure')<>'none' then
  return jsonb_build_object('status','review_required',
   'reason','Training concerns must be reviewed before modifying workouts',
   'calendar_changed',false);
 end if;
 select id into v_athlete from public.athlete_profile where user_id=v_user;
 if v_athlete is null then raise exception 'Athlete profile unavailable';end if;
 if (select count(*) from public.athlete_profile where user_id=v_user)>1 then
  raise exception 'Multiple athlete profiles require coach support review';end if;
 -- The plan's existing progression and current athlete readiness are untouched.
 for v_s in
   select p.id,p.sport::text sport,p.duration_min,p.title,p.prescription,
     p.planned_date,p.targets
   from public.planned_session p
   join public.season_week w on w.id=p.season_week_id
   where p.athlete_id=v_athlete and p.is_active_version
     and p.planned_date>=v_today and p.planned_date<v_today+14
     and p.status='planned' and p.session_class='easy' and not p.locked
     and w.phase='Foundation' and not w.locked
     and p.targets->>'generation_source'='onboarding_foundation'
   order by p.planned_date,p.id
   for update of p
 loop
  v_sport:=v_s.sport;v_duration:=v_s.duration_min;
  -- Count previously enriched sessions too, preserving two distinct
  -- objectives if only the SECOND bike was shortened and reset for re-enrichment.
  if coalesce(v_s.targets->>'enhanced_rpe_structure_v1','')='true' then
    if v_sport='bike' then v_seen_bike:=v_seen_bike+1;
    elsif v_sport='swim' then v_seen_swim:=v_seen_swim+1;
    elsif v_sport='run' then v_seen_run:=v_seen_run+1;
    end if;
    continue;
  end if;
  -- Do not alter coach-edited or malformed workouts.
  if v_duration<20 or v_duration>180 or
    jsonb_typeof(v_s.prescription->'steps') is distinct from 'array' or
    (select count(*) from jsonb_array_elements(v_s.prescription->'steps'))<>3 or
    (select coalesce(sum((j.value->>'durationMin')::int),0)
       from jsonb_array_elements(v_s.prescription->'steps') j)<>v_duration
  then
    v_unchanged:=v_unchanged+1;continue;
  end if;
  if v_sport='swim' and v_setup.can_swim_200m is distinct from true then
    v_unchanged:=v_unchanged+1;continue;
  end if;
  v_steps:='[]'::jsonb;v_target_steps:='[]'::jsonb;v_segments:='[]'::jsonb;
  v_warm:=case when v_duration>=75 then 15 when v_duration>=40 then 10 else 5 end;
  v_cool:=case when v_duration>=75 then 10 else 5 end;
  if v_sport='bike' then
    v_variant:=v_seen_bike%2;v_seen_bike:=v_seen_bike+1;
    if v_variant=0 then
      -- Aerobic development: rhythm and repeatability, without FTP assumptions.
      v_title:='Aerobic development · controlled repeats';
      v_focus:='Five relaxed aerobic efforts separated by genuinely easy recovery';
      v_why:='Why today matters: repeatable easy aerobic work develops pacing discipline and comfort on the bike without threshold stress. Stay conversational; this is not a race or maximal test.';
      v_n:=case when v_duration>=75 then 5 else 3 end;
      v_work:=case when v_duration>=75 then 8 else 6 end;
      v_remain:=v_duration-v_warm-v_cool-v_n*v_work-(v_n-1)*2;
      if v_remain<0 then raise exception 'Aerobic interval schedule longer than the original workout';end if;
      v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',v_warm,'target','Warm-up: gradually build from RPE 1-2 to easy aerobic RPE 3. Smooth pedalling.'));
      v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','warmup','durationMin',v_warm,'targetType','rpe','targetLow',1,'targetHigh',3));
      for v_check in 1..v_n loop
       v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',v_work,
        'target','Effort '||v_check||'/'||v_n||': steady conversational aerobic riding, RPE 3-4. Hold smooth cadence throughout.'));
       v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','work','durationMin',v_work,'targetType','rpe','targetLow',3,'targetHigh',4));
       if v_check<v_n then
        v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',2,
         'target','Recovery: pedal very easily, RPE 1-2; regain comfortable breathing.'));
        v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','recovery','durationMin',2,'targetType','rpe','targetLow',1,'targetHigh',2));
       end if;
      end loop;
      if v_remain>0 then
       v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',v_remain,
        'target','Easy aerobic endurance, RPE 3; practise consistent pedalling and fuelling.'));
       v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','work','durationMin',v_remain,'targetType','rpe','targetLow',2,'targetHigh',3));
      end if;
    else
      -- Distinct second bike session: cadence skill, not hard VO2.
      v_title:='Aerobic technique · cadence control';
      v_focus:='Pedalling economy and steady aerobic endurance';
      v_why:='Why today matters: brief, relaxed cadence variations help coordination while preserving aerobic recovery. Do not sprint or grind high torque; this prepares technique for later coach-approved quality work.';
      v_n:=case when v_duration>=75 then 6 else 3 end;
      v_work:=3;
      v_remain:=v_duration-v_warm-v_cool-v_n*3-(v_n-1)*2;
      if v_remain<0 then raise exception 'Cadence session longer than approved duration';end if;
      v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',v_warm,
       'target','Warm-up: easy spin progressing gradually to RPE 3; no hard surges.'));
      v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','warmup','durationMin',v_warm,'targetType','rpe','targetLow',1,'targetHigh',3));
      for v_check in 1..v_n loop
       v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',3,
        'target','Cadence drill '||v_check||'/'||v_n||': light gearing and slightly quicker, smooth pedalling. Stay RPE 2-3; never bounce or sprint.'));
       v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','work','durationMin',3,'targetType','rpe','targetLow',2,'targetHigh',3));
       if v_check<v_n then
        v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',2,
         'target','Recover at comfortable natural cadence, very easy RPE 1-2.'));
        v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','recovery','durationMin',2,'targetType','rpe','targetLow',1,'targetHigh',2));
       end if;
      end loop;
      if v_remain>0 then
       v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',v_remain,
        'target','Easy aerobic endurance at natural cadence, RPE 3. Keep fuelling and posture comfortable.'));
       v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','work','durationMin',v_remain,'targetType','rpe','targetLow',2,'targetHigh',3));
      end if;
    end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',v_cool,'target','Cool down with very easy spinning, RPE 1-2.'));
    v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','cooldown','durationMin',v_cool,'targetType','rpe','targetLow',1,'targetHigh',2));
  elsif v_sport='run' then
    v_variant:=v_seen_run%2;v_seen_run:=v_seen_run+1;
    v_title:=case when v_variant=0 then 'Easy run · rhythm and form'
      else 'Easy run · relaxed endurance' end;
    v_focus:=case when v_variant=0 then 'Pacing and relaxed running mechanics'
      else 'Comfortable, sustainable endurance' end;
    v_why:=case when v_variant=0 then
      'Why today matters: short easy running blocks and recovery walks build repeatable movement quality. Keep the effort low and focus on form, not pace.'
      else 'Why today matters: comfortable continuous endurance improves consistency and leaves room to recover for the next swim or bike. Walk when needed.' end;
    v_warm:=5;v_cool:=5;
    if v_variant=0 and v_duration>=35 then
      v_n:=3;v_work:=5;
      v_remain:=v_duration-10-15-4;
      v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',5,'target','Warm-up with a brisk, comfortable walk, RPE 1-2.'));
      v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','warmup','durationMin',5,'targetType','rpe','targetLow',1,'targetHigh',2));
      for v_check in 1..3 loop
       v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',5,
         'target','Easy running block '||v_check||'/3: conversational RPE 2-3, tall relaxed posture.'));
       v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','work','durationMin',5,'targetType','rpe','targetLow',2,'targetHigh',3));
       if v_check<3 then
        v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',2,'target','Walk and reset your breathing, RPE 1-2.'));
        v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','recovery','durationMin',2,'targetType','rpe','targetLow',1,'targetHigh',2));
       end if;
      end loop;
      v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',v_remain,'target','Finish with relaxed easy running, RPE 2-3; walk when needed.'));
      v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','work','durationMin',v_remain,'targetType','rpe','targetLow',2,'targetHigh',3));
    else
      v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',5,'target','Warm-up walk and gentle jog, RPE 1-2.'));
      v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','warmup','durationMin',5,'targetType','rpe','targetLow',1,'targetHigh',2));
      v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',v_duration-10,
       'target','Easy conversational running, RPE 2-3. Break into walk-run as needed; maintain relaxed stride.'));
      v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','work','durationMin',v_duration-10,'targetType','rpe','targetLow',2,'targetHigh',3));
    end if;
    v_steps:=v_steps||jsonb_build_array(jsonb_build_object('durationMin',5,'target','Cool down walking and let breathing settle, RPE 1.'));
    v_target_steps:=v_target_steps||jsonb_build_array(jsonb_build_object('type','cooldown','durationMin',5,'targetType','rpe','targetLow',1,'targetHigh',2));
  elsif v_sport='swim' then
    v_variant:=v_seen_swim%2;v_seen_swim:=v_seen_swim+1;
    v_title:=case when v_variant=0 then 'Swim technique · relaxed repeatability'
      else 'Swim endurance · steady repeats' end;
    v_focus:=case when v_variant=0 then 'Breathing and efficient stroke mechanics'
      else 'Comfortable aerobic repeatability with controlled rest' end;
    v_why:=case when v_variant=0 then
      'Why today matters: short relaxed repeats with planned rest make space to practise body position, breathing and consistency. Choose drills you can perform safely.'
      else 'Why today matters: modest repeat distances and consistent rest develop aerobic swimming without turning the session into a CSS test or race-pace effort.' end;
    v_steps:=jsonb_build_array(
      jsonb_build_object('durationMin',5,'target','Warm up with easy swimming and plenty of breathing time, RPE 1-2.'),
      jsonb_build_object('durationMin',v_duration-10,'target',case when v_variant=0
        then 'Technique block: 4×50m relaxed catch/breathing drills (20s rest), then 4×100m easy swimming (20-30s rest). Use any remaining time for gentle skill practice; shorten repetitions if needed.'
        else 'Endurance block: 4×100m or 4×200m comfortable swimming according to your ability, 20-30s rest between. Keep RPE 2-3; use remaining time for easy technique.'
        end),
      jsonb_build_object('durationMin',5,'target','Very easy cool-down and rest, RPE 1.'));
    v_target_steps:=jsonb_build_array(
      jsonb_build_object('type','warmup','durationMin',5,'targetType','rpe','targetLow',1,'targetHigh',2),
      jsonb_build_object('type','work','durationMin',v_duration-10,'targetType','rpe','targetLow',2,'targetHigh',3),
      jsonb_build_object('type','cooldown','durationMin',5,'targetType','rpe','targetLow',1,'targetHigh',2));
    if v_variant=0 then
      v_segments:=jsonb_build_array(
       jsonb_build_object('repeats',4,'distanceMeters',50,'restSeconds',20,'purpose','technique','target','Easy breathing/body-position drill, RPE 2'),
       jsonb_build_object('repeats',4,'distanceMeters',100,'restSeconds',25,'purpose','aerobic','target','Relaxed strokes, RPE 2-3; shorten reps if needed'));
    else
      v_segments:=jsonb_build_array(
       jsonb_build_object('repeats',4,'distanceMeters',100,'restSeconds',25,'purpose','endurance','target','Controlled, comfortable easy RPE 2-3'),
       jsonb_build_object('repeats',4,'distanceMeters',50,'restSeconds',20,'purpose','technique','target','Smooth strokes and gentle breathing'));
    end if;
  else
    v_unchanged:=v_unchanged+1;continue;
  end if;
  select coalesce(sum((j.value->>'durationMin')::int),0)
   into v_original from jsonb_array_elements(v_steps) j;
  if v_original<>v_duration or jsonb_array_length(v_steps)>25 then
    raise exception 'Structured foundation blocks do not equal the existing planned session';
  end if;
  -- Interval summary uses bounded RPE, not a self-reported FTP/CSS target.
  update public.planned_session p set
   title=v_title,
   prescription=jsonb_build_object(
    'focus',v_focus,'why_today_matters',v_why,'steps',v_steps,
    'poolSegments',v_segments,
    'azurWorkout',jsonb_build_object('steps',v_target_steps),
    'durationMin',v_duration,
    'safe_intensity_policy','easy_RPE_only_no_unverified_thresholds',
    'swim_duration_note',case when v_sport='swim'
       then 'The time budget includes planned rests and additional relaxed swimming; distances are adjustable if necessary.' else null end),
   rationale=v_why,
   targets=coalesce(p.targets,'{}'::jsonb)||jsonb_build_object(
    'enhanced_rpe_structure_v1',true,'intensity_verified',false,
    'progression_requires_coach',true,'workout_purpose',v_focus),
   updated_at=now()
  where p.id=v_s.id and p.status='planned' and not p.locked
    and p.is_active_version and p.duration_min=v_duration
    and p.targets->>'generation_source'='onboarding_foundation';
  if not found then raise exception 'Foundation session changed while enhancing';end if;
  v_count:=v_count+1;
 end loop;
 return jsonb_build_object('status','updated','sessions_enriched',v_count,
  'sessions_unchanged',v_unchanged,'calendar_changed',v_count>0,
  'intensity_policy','easy_RPE_only','coach_required_for_VO2',true,
  'note','Upcoming unlocked easy starter sessions gained structured variety; dates, duration and sport stay unchanged.');
end;
$enrich$;
revoke all on function public.athlete_enrich_foundation_sessions() from public,anon;
grant execute on function public.athlete_enrich_foundation_sessions() to authenticated;
