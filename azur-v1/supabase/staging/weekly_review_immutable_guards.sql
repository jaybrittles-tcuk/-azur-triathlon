-- Historical proposals and decisions are append-only: approval must refer to a frozen draft.
create or replace function public.reject_weekly_review_mutation()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Weekly proposals and decisions are append-only; create a new revision or decision'; end; $$;
drop trigger if exists weekly_draft_append_only on public.weekly_plan_draft;
create trigger weekly_draft_append_only before update or delete on public.weekly_plan_draft
for each row execute function public.reject_weekly_review_mutation();
drop trigger if exists weekly_decision_append_only on public.weekly_plan_decision;
create trigger weekly_decision_append_only before update or delete on public.weekly_plan_decision
for each row execute function public.reject_weekly_review_mutation();
revoke all on function public.reject_weekly_review_mutation() from public,anon,authenticated;
-- A new decision is valid only for the current revision by a currently assigned coach.
create or replace function public.validate_weekly_coach_decision()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_draft public.weekly_plan_draft%rowtype;
begin
 select * into v_draft from public.weekly_plan_draft where id=new.draft_id;
 if not found then raise exception 'Draft not found'; end if;
 if exists (select 1 from public.weekly_plan_draft d where d.athlete_id=v_draft.athlete_id
  and d.week_start=v_draft.week_start and d.revision>v_draft.revision) then
  raise exception 'Superseded draft cannot be approved';
 end if;
 if not exists (select 1 from public.coach_athlete_assignment a
   where a.coach_user_id=new.coach_user_id and a.athlete_id=v_draft.athlete_id)
 then raise exception 'Coach must be assigned to the athlete'; end if;
 if not exists (select 1 from auth.users u where u.id=new.coach_user_id and u.raw_app_meta_data->>'role'='coach')
 then raise exception 'Verified coach role required'; end if;
 return new;
end; $$;
drop trigger if exists weekly_coach_decision_guard on public.weekly_plan_decision;
create trigger weekly_coach_decision_guard before insert on public.weekly_plan_decision
for each row execute function public.validate_weekly_coach_decision();
revoke all on function public.validate_weekly_coach_decision() from public,anon,authenticated;
