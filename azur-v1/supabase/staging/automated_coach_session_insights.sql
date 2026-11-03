-- Staging-only first milestone: deterministic, evidence-labelled duration observations.
-- No plan writes or adaptive rescheduling. Run in an authorized staging environment.
create table if not exists public.coach_session_insight (
 activity_id uuid primary key references public.completed_activity(id) on delete cascade,
 athlete_id uuid not null,
 planned_session_id uuid,
 observed_at timestamptz not null,
 planned_minutes integer not null,
 recorded_minutes numeric not null,
 duration_delta_pct numeric not null,
 evidence_source text not null,
 evidence_level text not null check(evidence_level in ('athlete_reported','device_recorded')),
 severity text not null check(severity in ('routine','review','high')),
 observation text not null,
 coach_guidance text not null,
 updated_at timestamptz not null default now()
);
create index if not exists coach_session_insight_priority_idx on public.coach_session_insight(severity,observed_at desc);
alter table public.coach_session_insight enable row level security;
drop policy if exists coach_reads_assigned_insights on public.coach_session_insight;
create policy coach_reads_assigned_insights on public.coach_session_insight for select to authenticated
 using ((select auth.jwt()->'app_metadata'->>'role')='coach' and exists
 (select 1 from public.coach_athlete_assignment a where a.athlete_id=coach_session_insight.athlete_id and a.coach_user_id=(select auth.uid())));
revoke all on public.coach_session_insight from anon,authenticated;
grant select on public.coach_session_insight to authenticated;
create or replace function public.refresh_coach_session_insight(p_activity uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.completed_activity%rowtype; p public.planned_session%rowtype;
 v_minutes numeric; v_delta numeric; v_level text; v_severity text;
begin
 select * into a from public.completed_activity where id=p_activity;
 if not found or a.planned_session_id is null or a.duration_sec is null or a.duration_sec<=0 then
  delete from public.coach_session_insight where activity_id=p_activity; return;
 end if;
 select * into p from public.planned_session where id=a.planned_session_id and athlete_id=a.athlete_id;
 if not found or p.duration_min<=0 then
  delete from public.coach_session_insight where activity_id=p_activity; return;
 end if;
 v_minutes:=round(a.duration_sec::numeric/60,1);
 v_delta:=round((v_minutes/p.duration_min-1)*100,1);
 v_level:=case when a.source='manual' then 'athlete_reported' else 'device_recorded' end;
 v_severity:=case when v_delta<=-25 or v_delta>=50 then 'high'
  when v_delta<=-10 or v_delta>=30 then 'review' else 'routine' end;
 insert into public.coach_session_insight(activity_id,athlete_id,planned_session_id,observed_at,planned_minutes,recorded_minutes,duration_delta_pct,evidence_source,evidence_level,severity,observation,coach_guidance)
 values(a.id,a.athlete_id,a.planned_session_id,coalesce(a.start_time,a.created_at,now()),p.duration_min,v_minutes,v_delta,coalesce(a.source,'unknown'),v_level,v_severity,
 format('%s duration: %s minutes recorded versus %s minutes prescribed (%s%%).',case when v_level='athlete_reported' then 'Athlete-reported' else 'Device-recorded' end,v_minutes,p.duration_min,case when v_delta>0 then '+'||v_delta::text else v_delta::text end),
 case when v_severity='routine' then 'No duration exception. Intensity compliance cannot be inferred from duration alone.'
 else 'Check athlete context and reasons for deviation. Do not automatically add missed minutes or change training.' end)
 on conflict(activity_id) do update set athlete_id=excluded.athlete_id,planned_session_id=excluded.planned_session_id,observed_at=excluded.observed_at,planned_minutes=excluded.planned_minutes,recorded_minutes=excluded.recorded_minutes,duration_delta_pct=excluded.duration_delta_pct,evidence_source=excluded.evidence_source,evidence_level=excluded.evidence_level,severity=excluded.severity,observation=excluded.observation,coach_guidance=excluded.coach_guidance,updated_at=now();
end $$;
revoke all on function public.refresh_coach_session_insight(uuid) from public,anon,authenticated;
create or replace function public.after_completed_activity_insight()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.refresh_coach_session_insight(new.id); return new; end $$;
drop trigger if exists completed_activity_insight_refresh on public.completed_activity;
create trigger completed_activity_insight_refresh after insert or update of planned_session_id,duration_sec,source,start_time
on public.completed_activity for each row execute function public.after_completed_activity_insight();
do $$ declare r record; begin
 for r in select id from public.completed_activity where planned_session_id is not null
 loop perform public.refresh_coach_session_insight(r.id); end loop;
end $$;
