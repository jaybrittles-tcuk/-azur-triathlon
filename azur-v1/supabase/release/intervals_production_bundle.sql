-- AZUR production release bundle. Run only after release approval.
-- Execute the WHOLE file in a single session; errors must abort execution.
-- No baseline, staging-only tables, athlete records or credentials are included.
begin;
DO $$ BEGIN
 if current_setting('azur.release_project_ref',true) is distinct from 'tdjxqinhlmlfowqjuvzo' then
  raise exception 'Set the verified production project reference before applying';
 end if;
 if to_regclass('public.intervals_import_inbox') is not null then
  raise exception 'Import schema already exists; inspect installed history before retrying';
 end if;
END $$;

-- Source: 20261030152435_intervals_import_inbox.sql
-- Staged migration ONLY. Do not apply before review and replay testing.
-- Intervals imports are quarantined from completed_activity and training load.
create table if not exists public.intervals_import_inbox (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
  source_activity_id text not null check (length(trim(source_activity_id)) > 0),
  start_time timestamptz not null,
  duration_sec integer not null check (duration_sec > 0),
  distance_m numeric check (distance_m is null or distance_m >= 0),
  avg_power_w numeric check (avg_power_w is null or avg_power_w >= 0),
  normalized_power_w numeric check (normalized_power_w is null or normalized_power_w >= 0),
  source_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending_review' check (status in ('pending_review','possible_duplicate','rejected','reviewed')),
  review_reason text not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (athlete_id, source_activity_id)
);
create index if not exists intervals_import_inbox_athlete_start_idx
  on public.intervals_import_inbox (athlete_id, start_time desc);
alter table public.intervals_import_inbox enable row level security;
revoke all on public.intervals_import_inbox from public, anon, authenticated;
-- Read-only per-athlete access for signed-in users; writes remain server-only.
grant select on public.intervals_import_inbox to authenticated;
grant select, insert, update on public.intervals_import_inbox to service_role;
create policy "athletes can read their own inbox" on public.intervals_import_inbox
  for select to authenticated using (
    exists (select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=auth.uid())
  );

-- Caller is server-side service_role only. The server must re-fetch Intervals
-- and validate the user's explicit consent, account ownership and source.
create or replace function public.stage_intervals_activity(
  p_athlete_id uuid,
  p_source_id text,
  p_start timestamptz,
  p_duration integer,
  p_distance numeric,
  p_avg_power numeric,
  p_normalized_power numeric,
  p_source_payload jsonb
) returns table(stage_id uuid, outcome text)
language plpgsql security invoker set search_path=public
as $$
declare
  v_id uuid;
  v_duplicate boolean;
begin
  if p_athlete_id is null or length(trim(coalesce(p_source_id,''))) = 0
    or p_start is null or p_duration is null or p_duration <= 0
    or (p_distance is not null and p_distance < 0)
    or (p_avg_power is not null and p_avg_power < 0)
    or (p_normalized_power is not null and p_normalized_power < 0)
  then raise exception 'Invalid staged activity'; end if;
  -- Serialise all imports for this athlete to prevent concurrent cross-source races.
  perform pg_advisory_xact_lock(hashtextextended(p_athlete_id::text, 17));
  select i.id into v_id from public.intervals_import_inbox i
    where i.athlete_id=p_athlete_id and i.source_activity_id=p_source_id;
  if found then
    return query select v_id, 'already_staged'::text;
    return;
  end if;
  select exists(
    select 1 from public.completed_activity c
    where c.athlete_id=p_athlete_id
      and ( (c.source='intervals' and c.source_activity_id=p_source_id)
        or (c.sport='bike' and abs(extract(epoch from (c.start_time-p_start))) <= 600
          and abs(c.duration_sec-p_duration) <= greatest(120,p_duration*.06)
          and (p_distance is null or c.distance_m is null
            or abs(c.distance_m-p_distance) <= greatest(750,p_distance*.05))) )
  ) into v_duplicate;
  -- Distinct Intervals IDs may represent the same underlying Zwift/Garmin ride.
  -- Quarantine overlapping inbox records instead of treating either as load eligible.
  if not v_duplicate then
    select exists(
      select 1 from public.intervals_import_inbox i
      where i.athlete_id=p_athlete_id
        and abs(extract(epoch from (i.start_time-p_start))) <= 600
        and abs(i.duration_sec-p_duration) <= greatest(120,p_duration*.06)
        and (p_distance is null or i.distance_m is null
          or abs(i.distance_m-p_distance) <= greatest(750,p_distance*.05))
    ) into v_duplicate;
  end if;
  insert into public.intervals_import_inbox
    (athlete_id,source_activity_id,start_time,duration_sec,distance_m,avg_power_w,normalized_power_w,source_payload,status,review_reason)
  values
    (p_athlete_id,p_source_id,p_start,p_duration,p_distance,p_avg_power,p_normalized_power,
      coalesce(p_source_payload,'{}'::jsonb),
      case when v_duplicate then 'possible_duplicate' else 'pending_review' end,
      case when v_duplicate then 'Overlapping completed activity or existing source'
        else 'Requires explicit review; not a completed activity' end)
  returning id into v_id;
  return query select v_id, case when v_duplicate then 'possible_duplicate' else 'pending_review' end::text;
end;
$$;
revoke all on function public.stage_intervals_activity(uuid,text,timestamptz,integer,numeric,numeric,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.stage_intervals_activity(uuid,text,timestamptz,integer,numeric,numeric,numeric,jsonb) to service_role;
-- IMPORTANT: This function NEVER INSERTS INTO completed_activity,
-- changes planned_session, or calculates/awards training stress.


-- Source: 20261030152441_intervals_accept_reviewed.sql
-- Isolated acceptance step. Server service-role only; no session auto-completion.
-- Must be applied after 20261030152435_intervals_import_inbox.sql.
create or replace function public.accept_staged_intervals_ride(p_athlete_id uuid,p_stage_id uuid,p_confirm boolean default false)
returns table(activity_id uuid,outcome text)
language plpgsql security invoker set search_path=public
as $$
declare v public.intervals_import_inbox%rowtype;
declare existing_id uuid;
declare inserted_id uuid;
begin
 if p_athlete_id is null or p_stage_id is null then raise exception 'Invalid confirmation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_athlete_id::text,17));
 select * into v from public.intervals_import_inbox where id=p_stage_id and athlete_id=p_athlete_id for update;
 if not found then raise exception 'Staged ride not found'; end if;
 select id into existing_id from public.completed_activity
 where athlete_id=p_athlete_id and source='intervals' and source_activity_id=v.source_activity_id;
 if found then return query select existing_id,'already_imported'::text; return; end if;
 if p_confirm is true and v.status='pending_review' then
  update public.intervals_import_inbox set status='reviewed',reviewed_at=now(),review_reason='Explicit athlete confirmation' where id=v.id;
  v.status:='reviewed';
 end if;
 if v.status <> 'reviewed' then raise exception 'Explicit human review required'; end if;
 if exists(select 1 from public.completed_activity c where c.athlete_id=p_athlete_id
   and c.sport='bike' and abs(extract(epoch from(c.start_time-v.start_time))) <= 600
   and abs(c.duration_sec-v.duration_sec) <= greatest(120,v.duration_sec*.06)
   and (v.distance_m is null or c.distance_m is null
   or abs(c.distance_m-v.distance_m) <= greatest(750,v.distance_m*.05)))
 then raise exception 'Overlapping completed ride requires review'; end if;
 insert into public.completed_activity
 (athlete_id,planned_session_id,sport,source,source_activity_id,start_time,duration_sec,distance_m,raw_payload,processed_metrics,duplicate_group_key)
 values (p_athlete_id,null,'bike','intervals',v.source_activity_id,v.start_time,v.duration_sec,v.distance_m,
 v.source_payload,jsonb_build_object('average_watts',v.avg_power_w,'normalized_watts',v.normalized_power_w,'normalized_power',v.normalized_power_w,
 'load_status','pending_validation'),'intervals:'||v.source_activity_id)
 returning id into inserted_id;
 -- Crucially does NOT set workout completed or award calculated stress.
 return query select inserted_id,'imported_pending_load_review'::text;
end;
$$;
revoke all on function public.accept_staged_intervals_ride(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.accept_staged_intervals_ride(uuid,uuid,boolean) to service_role;


-- Source: 20261030152448_intervals_validate_load.sql
-- Development only. Apply AFTER the staged inbox and acceptance migrations.
-- This updates the existing activity; it never adds a second load-credit row.
create or replace function public.validate_intervals_training_load(p_athlete_id uuid,p_activity_id uuid,p_confirm boolean)
returns table(activity_id uuid,outcome text,training_stress numeric)
language plpgsql security invoker set search_path=public
as $$
declare v public.completed_activity%rowtype;
declare staged public.intervals_import_inbox%rowtype;
declare ftp numeric;
declare stress numeric;
declare intensity numeric;
begin
 if p_athlete_id is null or p_activity_id is null or p_confirm is distinct from true then raise exception 'Explicit load confirmation required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_athlete_id::text,17));
 select * into v from public.completed_activity where id=p_activity_id and athlete_id=p_athlete_id for update;
 if not found or v.source <> 'intervals' or v.sport <> 'bike' then raise exception 'Imported bike activity not found'; end if;
 if v.processed_metrics->>'load_status'='validated' then
  if v.processed_metrics->>'load_validation_version' is distinct from '1' or not (v.processed_metrics ? 'training_stress') then raise exception 'Unrecognised validation record'; end if;
  return query select v.id,'already_validated'::text,(v.processed_metrics->>'training_stress')::numeric; return;
 end if;
 if v.processed_metrics->>'load_status' is distinct from 'pending_validation'
 or v.processed_metrics @> '{"is_test":true}'::jsonb or v.processed_metrics @> '{"test_fixture":true}'::jsonb
 then raise exception 'Activity is not eligible for load validation'; end if;
 select * into staged from public.intervals_import_inbox
 where athlete_id=p_athlete_id and source_activity_id=v.source_activity_id for update;
 if not found or staged.status <> 'reviewed' or staged.reviewed_at is null
 or staged.duration_sec is distinct from v.duration_sec or staged.start_time is distinct from v.start_time
 or staged.distance_m is distinct from v.distance_m then raise exception 'Reviewed source provenance required'; end if;
 if staged.normalized_power_w is null or staged.normalized_power_w <= 0
 or staged.normalized_power_w::text in ('NaN','Infinity','-Infinity') then raise exception 'Valid normalised power required'; end if;
 -- Never substitute average power for normalised power or trust client FTP.
 select ftp_w into ftp from public.athlete_profile where id=p_athlete_id;
 if ftp is null or ftp <= 0 or ftp::text in ('NaN','Infinity','-Infinity') then raise exception 'Valid athlete FTP required'; end if;
 if exists(select 1 from public.completed_activity c where c.athlete_id=p_athlete_id and c.id<>v.id
 and ( (c.source='intervals' and c.source_activity_id=v.source_activity_id)
 or (c.sport='bike' and abs(extract(epoch from(c.start_time-v.start_time))) <= 600
 and abs(c.duration_sec-v.duration_sec) <= greatest(120,v.duration_sec*.06)
 and (v.distance_m is null or c.distance_m is null or abs(c.distance_m-v.distance_m) <= greatest(750,v.distance_m*.05)))))
 then raise exception 'Overlapping recorded ride requires review'; end if;
 intensity:=staged.normalized_power_w/ftp;
 stress:=round((v.duration_sec::numeric/3600)*power(intensity,2)*100);
 update public.completed_activity set processed_metrics=coalesce(v.processed_metrics,'{}'::jsonb)||jsonb_build_object(
 'normalized_power',staged.normalized_power_w,'ftp_w_at_validation',ftp,
 'training_stress',stress,'intensity_factor',intensity,
 'load_status','validated','load_validation_version',1,'load_validated_at',now()) where id=v.id;
 return query select v.id,'validated'::text,stress;
end;
$$;
revoke all on function public.validate_intervals_training_load(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.validate_intervals_training_load(uuid,uuid,boolean) to service_role;

grant select,update on public.completed_activity to service_role;
grant select on public.athlete_profile to service_role;


-- Source: 20261030152454_protect_intervals_activity_writes.sql
-- Development only: layer restrictions over the existing athlete ownership policies.
-- Permissive ownership rules alone must not allow imported-ride validation bypass.
alter table public.completed_activity enable row level security;
create policy intervals_activity_server_insert on public.completed_activity
 as restrictive for insert to authenticated
 with check (lower(btrim(source)) <> 'intervals');
create policy intervals_activity_server_update on public.completed_activity
 as restrictive for update to authenticated
 using (lower(btrim(source)) <> 'intervals')
 with check (lower(btrim(source)) <> 'intervals');
create policy intervals_activity_server_delete on public.completed_activity
 as restrictive for delete to authenticated
 using (lower(btrim(source)) <> 'intervals');
-- SELECT policies, manual writes, and service-role transactions are unchanged.


commit;
