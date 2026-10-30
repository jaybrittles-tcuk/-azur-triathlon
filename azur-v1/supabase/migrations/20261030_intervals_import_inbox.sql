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
