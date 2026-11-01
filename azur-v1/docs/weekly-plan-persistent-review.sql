-- AZUR weekly draft and coach decision audit trail. Staging first.
-- A draft is immutable: change it by inserting a new revision.
create table if not exists public.weekly_plan_draft (
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 week_start date not null,
 revision integer not null check (revision>0),
 phase text not null,
 sessions jsonb not null check (jsonb_typeof(sessions)='array' and jsonb_array_length(sessions) between 1 and 21),
 proposal_fingerprint text not null check (length(proposal_fingerprint)=64),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(athlete_id,week_start,revision),
 check(extract(isodow from week_start)=1)
);
create table if not exists public.weekly_plan_decision (
 id uuid primary key default gen_random_uuid(),
 draft_id uuid not null references public.weekly_plan_draft(id) on delete cascade,
 coach_user_id uuid not null references auth.users(id),
 decision text not null check(decision in ('approved','rejected','revoked')),
 reason text,
 decided_at timestamptz not null default now()
);
create index if not exists weekly_plan_decision_latest_idx on public.weekly_plan_decision(draft_id,decided_at desc,id desc);
alter table public.weekly_plan_draft enable row level security;
alter table public.weekly_plan_decision enable row level security;
revoke all on public.weekly_plan_draft,public.weekly_plan_decision from anon;
grant select,insert on public.weekly_plan_draft,public.weekly_plan_decision to authenticated;
grant all on public.weekly_plan_draft,public.weekly_plan_decision to service_role;
create policy weekly_draft_coach_read on public.weekly_plan_draft for select to authenticated using (
 exists(select 1 from public.coach_athlete_assignment a where a.athlete_id=weekly_plan_draft.athlete_id and a.coach_user_id=(select auth.uid()))
);
create policy weekly_draft_coach_insert on public.weekly_plan_draft for insert to authenticated with check (
 created_by=(select auth.uid()) and
 (select coalesce(auth.jwt()->'app_metadata'->>'role',''))='coach' and
 exists(select 1 from public.coach_athlete_assignment a where a.athlete_id=weekly_plan_draft.athlete_id and a.coach_user_id=(select auth.uid()))
);
create policy weekly_decision_coach_read on public.weekly_plan_decision for select to authenticated using (
 exists(select 1 from public.weekly_plan_draft d join public.coach_athlete_assignment a on a.athlete_id=d.athlete_id
 where d.id=weekly_plan_decision.draft_id and a.coach_user_id=(select auth.uid()))
);
create policy weekly_decision_coach_insert on public.weekly_plan_decision for insert to authenticated with check (
 coach_user_id=(select auth.uid()) and
 (select coalesce(auth.jwt()->'app_metadata'->>'role',''))='coach' and
 exists(select 1 from public.weekly_plan_draft d join public.coach_athlete_assignment a on a.athlete_id=d.athlete_id
 where d.id=weekly_plan_decision.draft_id and a.coach_user_id=(select auth.uid()))
);
-- No authenticated UPDATE or DELETE policies: past drafts and decisions remain auditable.
-- CRITICAL: publisher must look up newest decision on newest revision, match
-- SHA-256 to canonical sessions server-side, and reject stale or revoked approvals.
