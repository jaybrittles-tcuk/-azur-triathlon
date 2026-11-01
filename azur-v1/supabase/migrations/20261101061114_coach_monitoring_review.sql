create table public.coach_monitoring_review (
  coach_user_id uuid not null,
  athlete_id uuid not null,
  item_key text not null check (length(item_key) between 1 and 200),
  reviewed_at timestamptz not null default now(),
  primary key (coach_user_id,athlete_id,item_key),
  foreign key (coach_user_id,athlete_id) references public.coach_athlete_assignment(coach_user_id,athlete_id) on delete cascade
);
alter table public.coach_monitoring_review enable row level security;
revoke all on public.coach_monitoring_review from public,anon,authenticated;
grant select,insert on public.coach_monitoring_review to authenticated;
create policy "Coach reads own monitoring reviews" on public.coach_monitoring_review
for select to authenticated using (
 coach_user_id=(select auth.uid()) and (auth.jwt()->'app_metadata'->>'role')='coach'
 and exists(select 1 from public.coach_athlete_assignment a where a.coach_user_id=(select auth.uid()) and a.athlete_id=coach_monitoring_review.athlete_id)
);
create policy "Coach records own monitoring reviews" on public.coach_monitoring_review
for insert to authenticated with check (
 coach_user_id=(select auth.uid()) and (auth.jwt()->'app_metadata'->>'role')='coach'
 and exists(select 1 from public.coach_athlete_assignment a where a.coach_user_id=(select auth.uid()) and a.athlete_id=coach_monitoring_review.athlete_id)
);
