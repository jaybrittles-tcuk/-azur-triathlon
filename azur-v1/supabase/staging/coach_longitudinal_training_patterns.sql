-- Stage-only longitudinal monitoring; no training modifications or automatic rescheduling.
-- A qualifying pattern requires 3 distinct linked training sessions within 21 days.
-- At least 2 must deviate, and at least half of the eligible sessions must be affected.
-- Per-session data come only from duration observations, not inferred power or recovery.
create or replace view public.coach_training_pattern
with (security_invoker = true) as
with ranked as (
 select c.athlete_id,c.planned_session_id,c.activity_id,c.observed_at,
        c.planned_minutes,c.recorded_minutes,c.duration_delta_pct,c.evidence_level,
        row_number() over (
          partition by c.athlete_id,c.planned_session_id
          order by c.observed_at desc,c.activity_id desc
        ) as rn
 from public.coach_session_insight c
 where c.planned_session_id is not null
   and c.observed_at >= now() - interval '21 days'
   and c.observed_at <= now() + interval '1 day'
), eligible as (
 select * from ranked where rn=1
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
 from eligible
 group by athlete_id
), signals as (
 select athlete_id, 'repeated_short_duration'::text as signal_type,
 linked_sessions,short_sessions as affected_sessions,reported_sessions,device_sessions,
 planned_minutes,recorded_minutes,latest_observed_at,latest_activity_id
 from summary where linked_sessions>=3 and short_sessions>=2
 and short_sessions*2>=linked_sessions
 union all
 select athlete_id,'repeated_long_duration'::text as signal_type,
 linked_sessions,long_sessions as affected_sessions,reported_sessions,device_sessions,
 planned_minutes,recorded_minutes,latest_observed_at,latest_activity_id
 from summary where linked_sessions>=3 and long_sessions>=2
 and long_sessions*2>=linked_sessions
)
select athlete_id,signal_type,linked_sessions,affected_sessions,reported_sessions,
 device_sessions,planned_minutes,recorded_minutes,latest_observed_at,latest_activity_id,
 case when signal_type='repeated_short_duration'
 then 'Repeated shorter-than-prescribed sessions in the last 21 days.'
 else 'Repeated longer-than-prescribed sessions in the last 21 days.' end as observation,
 case when signal_type='repeated_short_duration'
 then 'Discuss whether time, recovery, illness, or schedule affected training. Do not add missed duration automatically.'
 else 'Check whether additional duration was planned and whether recovery remains appropriate. Do not automatically reduce or extend sessions.' end as coach_interpretation,
 'Coach review required before any substantial calendar adjustment.'::text as proposed_action,
 true as coach_approval_required
from signals;
revoke all on public.coach_training_pattern from public,anon;
grant select on public.coach_training_pattern to authenticated;
select pg_notify('pgrst','reload schema');
