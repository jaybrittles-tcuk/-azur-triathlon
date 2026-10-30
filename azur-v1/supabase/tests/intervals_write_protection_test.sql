\set ON_ERROR_STOP on
-- Test with permissive athlete ownership policies already present, as in live AZUR.
-- Add a permissive delete policy to prove the restriction survives future grants.
create policy synthetic_athlete_delete on public.completed_activity for delete to authenticated
 using (exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid())));
insert into public.completed_activity(athlete_id,sport,source,source_activity_id,start_time,duration_sec)
 values('00000000-0000-4000-8000-000000000002','run','manual','other-athlete-isolation',now(),1200);
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000011';
DO $$
declare ride uuid;
declare manual uuid;
declare count_rows integer;
declare before_metrics jsonb;
declare variant text;
begin
 select id,processed_metrics into ride,before_metrics from public.completed_activity where source='intervals' and source_activity_id='zwift-29';
 if ride is null then raise exception 'Own imported activity should remain readable'; end if;
 update public.completed_activity set processed_metrics='{"load_status":"validated","training_stress":9999}'::jsonb where id=ride;
 get diagnostics count_rows=row_count;
 if count_rows <> 0 then raise exception 'Athlete forged imported load validation'; end if;
 update public.completed_activity set source='manual' where id=ride;
 get diagnostics count_rows=row_count;
 if count_rows <> 0 then raise exception 'Athlete relabelled an imported activity'; end if;
 delete from public.completed_activity where id=ride;
 get diagnostics count_rows=row_count;
 if count_rows <> 0 then raise exception 'Athlete deleted an imported activity'; end if;
 if (select processed_metrics from public.completed_activity where id=ride) is distinct from before_metrics then raise exception 'Imported score changed'; end if;
 foreach variant in array array['intervals','INTERVALS',' intervals '] loop
  begin
   insert into public.completed_activity(athlete_id,sport,source,source_activity_id,start_time,duration_sec)
   values('00000000-0000-4000-8000-000000000001','bike',variant,'forged-import',now(),3600);
   raise exception 'Athlete inserted forged imported activity';
  exception when insufficient_privilege then null;
  end;
 end loop;
 insert into public.completed_activity(athlete_id,sport,source,source_activity_id,start_time,duration_sec)
 values('00000000-0000-4000-8000-000000000001','run','manual','manual-regression',now(),1800) returning id into manual;
 update public.completed_activity set duration_sec=1900 where id=manual;
 get diagnostics count_rows=row_count;
 if count_rows <> 1 then raise exception 'Manual activity edit regressed'; end if;
 begin
  update public.completed_activity set source='intervals' where id=manual;
  raise exception 'Athlete promoted manual activity into imported source';
 exception when insufficient_privilege then null;
 end;
 if exists(select 1 from public.completed_activity where athlete_id <> '00000000-0000-4000-8000-000000000001') then raise exception 'Another athlete activity exposed'; end if;
 delete from public.completed_activity where id=manual;
 get diagnostics count_rows=row_count;
 if count_rows <> 1 then raise exception 'Manual activity delete restriction leaked beyond imports'; end if;
end $$;
reset role;
delete from public.completed_activity where source_activity_id='other-athlete-isolation';
drop policy synthetic_athlete_delete on public.completed_activity;
select 'PASS: imported writes blocked under permissive owner policies; manual logging and reads preserved' as result;
