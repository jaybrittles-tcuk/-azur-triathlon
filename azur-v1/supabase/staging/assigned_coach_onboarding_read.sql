-- Staging only. Coaches see onboarding readiness only for athletes who accepted an invitation.
-- This does not allow coaches to edit athlete-provided values.
drop policy if exists staging_assigned_coach_setup_read on public.athlete_onboarding;
create policy staging_assigned_coach_setup_read on public.athlete_onboarding
for select to authenticated
using (
  ((select auth.jwt())->'app_metadata'->>'role')='coach'
  and exists (
    select 1 from public.athlete_profile p
    join public.coach_athlete_assignment a on a.athlete_id=p.id
    where p.user_id=athlete_onboarding.user_id and a.coach_user_id=(select auth.uid())
  )
);
