-- Staging: athlete read access is restricted to approved introductory base-phase templates.
-- No access to unapproved or coach-only workouts is granted.
drop policy if exists staging_approved_aerobic_run_read on public.coach_workout_library;
drop policy if exists staging_approved_intro_library_read on public.coach_workout_library;
create policy staging_approved_intro_library_read on public.coach_workout_library
for select to authenticated
using (
 approved is true
 and level=1
 and 'base'=any(phases)
 and (
   (sport='swim' and family='technique')
   or (sport='bike' and family='aerobic_endurance')
   or (sport='run' and family='aerobic_endurance')
 )
);
