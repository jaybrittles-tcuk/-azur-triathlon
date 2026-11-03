-- Read-only, assigned-coach-scoped validated Intervals cycling evidence.
-- No raw imported payloads, no approval writes, no calendar mutations.
create policy coach_assigned_completed_activity_read on public.completed_activity
for select to authenticated using (
 (select auth.jwt()->'app_metadata'->>'role')='coach'
 and exists(select 1 from public.coach_athlete_assignment ca
 where ca.athlete_id=completed_activity.athlete_id
 and ca.coach_user_id=(select auth.uid()))
);
create or replace view public.coach_validated_bike_evidence
with (security_invoker=true) as
select id as activity_id,athlete_id,planned_session_id,start_time,
       source,processed_metrics->>'load_status' as load_status,
       processed_metrics
from public.completed_activity
where source='intervals'
 and sport::text='bike'
 and processed_metrics->>'load_status'='validated'
 and processed_metrics->>'load_validation_version'='1'
 and coalesce(processed_metrics->>'is_test','false') <> 'true'
 and coalesce(processed_metrics->>'test_fixture','false') <> 'true';
revoke all on public.coach_validated_bike_evidence from public,anon;
grant select on public.coach_validated_bike_evidence to authenticated;
select pg_notify('pgrst','reload schema');
