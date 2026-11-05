-- Sport-aware atomic import. Service role only; never completes plans or awards load.
create or replace function public.import_intervals_endurance_activity(
 p_athlete_id uuid,p_source_id text,p_sport text,p_start timestamptz,
 p_duration integer,p_distance numeric,p_payload jsonb default '{}'::jsonb)
returns table(activity_id uuid,outcome text)
language plpgsql security definer set search_path=public as $$
declare v_existing uuid;v_inserted uuid;
begin
 if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
 if p_athlete_id is null or p_source_id is null or length(p_source_id) not between 1 and 150
  or p_sport not in ('swim','bike','run') or p_start is null or p_duration not between 1 and 86400
  or (p_distance is not null and (p_distance < 0 or p_distance > 1000000))
 then raise exception 'Invalid activity'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_athlete_id::text,17));
 select id into v_existing from public.completed_activity
 where athlete_id=p_athlete_id and source='intervals' and source_activity_id=p_source_id limit 1;
 if found then return query select v_existing,'already_imported'::text;return;end if;
 if exists(select 1 from public.completed_activity c where c.athlete_id=p_athlete_id
  and c.sport::text=p_sport and abs(extract(epoch from(c.start_time-p_start)))<=600
  and abs(c.duration_sec-p_duration)<=greatest(120,p_duration*.06)
  and (p_distance is null or c.distance_m is null or abs(c.distance_m-p_distance)<=greatest(750,p_distance*.05)))
 then return query select null::uuid,'possible_duplicate'::text;return;end if;
 insert into public.completed_activity
 (athlete_id,planned_session_id,sport,source,source_activity_id,start_time,duration_sec,distance_m,raw_payload,processed_metrics,duplicate_group_key)
 values(p_athlete_id,null,p_sport::public.sport_type,'intervals',p_source_id,p_start,p_duration,p_distance,
 coalesce(p_payload,'{}'::jsonb),jsonb_build_object('load_status','pending_validation'),'intervals:'||p_source_id)
 returning id into v_inserted;
 return query select v_inserted,'imported_pending_load_review'::text;
end;$$;
revoke all on function public.import_intervals_endurance_activity(uuid,text,text,timestamptz,integer,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.import_intervals_endurance_activity(uuid,text,text,timestamptz,integer,numeric,jsonb) to service_role;
