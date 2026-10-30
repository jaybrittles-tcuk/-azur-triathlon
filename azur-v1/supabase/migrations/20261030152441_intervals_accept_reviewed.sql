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
