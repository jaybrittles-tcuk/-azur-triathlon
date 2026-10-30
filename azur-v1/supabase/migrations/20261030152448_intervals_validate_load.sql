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
