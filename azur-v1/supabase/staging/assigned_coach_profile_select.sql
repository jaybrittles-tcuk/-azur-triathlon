-- Staging-only: allow verified coaches to read profiles of their assigned athletes.
-- Do not deploy to production without independently reviewing the production RLS model.
create policy "staging_assigned_coach_profile_select"
on public.athlete_profile for select to authenticated
using (
  (select auth.jwt()->'app_metadata'->>'role') = 'coach'
  and exists (
    select 1 from public.coach_athlete_assignment ca
    where ca.athlete_id = athlete_profile.id
      and ca.coach_user_id = (select auth.uid())
  )
);
