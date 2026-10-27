# AZUR Coach Account Onboarding (Beta)

## Current guardrails
- Coach UI visibility checks server-managed `app_metadata.role === 'coach'` (not user metadata).
- `public.coach_athlete_assignment` holds coach-user / athlete-profile pairs.
- Assignment rows are **not writable** by browser `authenticated` or `anon` roles.
- RLS only lets a coach read their own assignments and corresponding priority reviews.
- Priority review approvals are disabled; `training_priority_review` has no client UPDATE permission.
- Submitting a review does not alter athlete plans.

## Onboarding the first coach
1. Independently confirm the intended coach's identity, email ownership, and consent.
2. Ensure the coach has signed up through the ordinary Supabase Auth flow; identify their existing auth user ID. Never create or disclose login passwords in documentation.
3. Use only a trusted administrator interface or privileged server-side workflow to set `app_metadata.role` to `coach` for that verified auth user. Do **not** expose the Supabase secret/service-role key to the browser, and do not use editable `user_metadata` for authorization.
4. Independently verify the athlete profile and that the athlete has authorized that coach to view their data.
5. From a trusted administrator context, create the explicit `coach_athlete_assignment` pair. Never accept arbitrary athlete IDs from a self-service coach screen.
6. Have the coach refresh their authentication session or sign out and back in so server-issued JWT claims are current.
7. Test as coach: assigned reviews visible; unassigned athlete data invisible; no approve/reject or assignment-creation actions available.
8. Test as athlete: normal training preview and review submission work; coach inbox stays hidden.
9. Record who approved the access, when, and which athlete was assigned in an admin audit process before beta rollout.

## Verification queries (read-only, execute in a trusted admin SQL console)

```sql
select
 (select count(*) from auth.users where raw_app_meta_data->>'role'='coach') as verified_coaches,
 (select count(*) from public.coach_athlete_assignment) as assignments,
 (select count(*) from public.training_priority_review) as reviews;
```

```sql
select
  has_table_privilege('authenticated','public.coach_athlete_assignment','INSERT') as can_self_assign,
  has_table_privilege('authenticated','public.training_priority_review','UPDATE') as can_self_approve,
  (select relrowsecurity from pg_class where oid='public.coach_athlete_assignment'::regclass) as assignments_rls_enabled;
```

## Not implemented yet
- Verified coach invitation / identity workflow.
- Athlete authorization and consent screen.
- Admin assignment controls and access audit trail.
- Coach approval/rejection, immutable decision history and plan application.
- Database uniqueness constraint for simultaneous pending review submissions.
