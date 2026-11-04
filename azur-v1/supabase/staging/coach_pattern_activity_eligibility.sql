-- Stage-only data-quality gate for longitudinal observations.
-- Run after automated_coach_session_insights.sql and coach_longitudinal_training_patterns.sql.
alter table public.coach_session_insight
 add column if not exists eligible_for_patterns boolean not null default false;

create or replace function public.sync_coach_insight_eligibility()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.coach_session_insight
 set eligible_for_patterns =
     coalesce(new.source,'') <> 'manual_test'
     and coalesce(new.processed_metrics->>'load_status','') not in ('pending_validation','rejected')
     and coalesce(new.processed_metrics->>'is_test','false') <> 'true'
     and coalesce(new.processed_metrics->>'test_fixture','false') <> 'true',
     updated_at=now()
 where activity_id=new.id;
 return new;
end $$;
-- PostgreSQL runs triggers of the same timing/event alphabetically.
-- This trigger MUST run after completed_activity_insight_refresh.
drop trigger if exists coach_insight_eligibility_refresh on public.completed_activity;
drop trigger if exists z_coach_insight_eligibility_refresh on public.completed_activity;
create trigger z_coach_insight_eligibility_refresh
after insert or update of processed_metrics,source,planned_session_id,duration_sec,start_time
on public.completed_activity for each row execute function public.sync_coach_insight_eligibility();
update public.coach_session_insight c
set eligible_for_patterns =
    coalesce(a.source,'') <> 'manual_test'
    and coalesce(a.processed_metrics->>'load_status','') not in ('pending_validation','rejected')
    and coalesce(a.processed_metrics->>'is_test','false') <> 'true'
    and coalesce(a.processed_metrics->>'test_fixture','false') <> 'true'
from public.completed_activity a where a.id=c.activity_id;

create or replace view public.coach_training_pattern
with (security_invoker = true) as
with ranked as (
 select c.athlete_id,c.planned_session_id,c.activity_id,c.observed_at,
        c.planned_minutes,c.recorded_minutes,c.duration_delta_pct,c.evidence_level,
        c.eligible_for_patterns,
        row_number() over (
          partition by c.athlete_id,c.planned_session_id
          order by c.observed_at desc,c.activity_id desc
        ) as rn
 from public.coach_session_insight c
 where c.planned_session_id is not null
   and c.observed_at >= now() - interval '21 days'
   and c.observed_at <= now()
), eligible as (
 select * from ranked where rn=1 and eligible_for_patterns
), summary as (
 select athlete_id,
  count(*)::integer as linked_sessions,
  count(*) filter(where duration_delta_pct <= -10)::integer as short_sessions,
  count(*) filter(where duration_delta_pct >= 30)::integer as long_sessions,
  count(*) filter(where evidence_level='athlete_reported')::integer as reported_sessions,
  count(*) filter(where evidence_level='device_recorded')::integer as device_sessions,
  sum(planned_minutes)::numeric as planned_minutes,
  sum(recorded_minutes)::numeric as recorded_minutes,
  max(observed_at) as latest_observed_at,
  (array_agg(activity_id order by observed_at desc,activity_id desc))[1] as latest_activity_id
 from eligible group by athlete_id
), signals as (
 select athlete_id,'repeated_short_duration'::text as signal_type,linked_sessions,
 short_sessions as affected_sessions,reported_sessions,device_sessions,
 planned_minutes,recorded_minutes,latest_observed_at,latest_activity_id
 from summary where linked_sessions>=3 and short_sessions>=2 and short_sessions*2>=linked_sessions
 union all
 select athlete_id,'repeated_long_duration'::text as signal_type,linked_sessions,
 long_sessions as affected_sessions,reported_sessions,device_sessions,
 planned_minutes,recorded_minutes,latest_observed_at,latest_activity_id
 from summary where linked_sessions>=3 and long_sessions>=2 and long_sessions*2>=linked_sessions
)
select athlete_id,signal_type,linked_sessions,affected_sessions,reported_sessions,
 device_sessions,planned_minutes,recorded_minutes,latest_observed_at,latest_activity_id,
 case when signal_type='repeated_short_duration' then 'Repeated shorter-than-prescribed sessions in the last 21 days.'
 else 'Repeated longer-than-prescribed sessions in the last 21 days.' end as observation,
 case when signal_type='repeated_short_duration' then 'Discuss whether time, recovery, illness, or schedule affected training. Do not add missed duration automatically.'
 else 'Check whether additional duration was planned and whether recovery remains appropriate. Do not automatically reduce or extend sessions.' end as coach_interpretation,
 'Coach review required before any substantial calendar adjustment.'::text as proposed_action,
 true as coach_approval_required
from signals;
select pg_notify('pgrst','reload schema');
