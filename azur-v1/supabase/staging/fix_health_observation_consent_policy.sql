-- Correct health consent subject binding. No coach access is granted here.
drop policy if exists own_health_observation_select on public.athlete_health_observation;
create policy own_health_observation_select on public.athlete_health_observation
for select to authenticated using (
 exists (
  select 1 from public.athlete_profile p
  where p.id=athlete_health_observation.athlete_id and p.user_id=(select auth.uid())
 )
 and exists (
  select 1 from public.athlete_health_consent c
  where c.athlete_id=athlete_health_observation.athlete_id
    and c.metric=athlete_health_observation.metric
    and c.enabled is true
 )
);
