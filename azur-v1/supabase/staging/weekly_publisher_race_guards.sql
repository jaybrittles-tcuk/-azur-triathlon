-- Coordinate all new drafts/decisions with the publisher's per-athlete/week advisory lock.
-- This prevents an in-flight publication racing a later revision or revocation.
create or replace function public.lock_weekly_review_insert()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_athlete uuid; v_week date;
begin
 if tg_table_name='weekly_plan_draft' then
  v_athlete:=new.athlete_id; v_week:=new.week_start;
 elsif tg_table_name='weekly_plan_decision' then
  select athlete_id,week_start into v_athlete,v_week
  from public.weekly_plan_draft where id=new.draft_id;
 else raise exception 'Unexpected weekly review table';
 end if;
 if v_athlete is null or v_week is null then raise exception 'Week reference required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_athlete::text||':'||v_week::text,0));
 return new;
end;$$;
drop trigger if exists a_weekly_draft_insert_lock on public.weekly_plan_draft;
create trigger a_weekly_draft_insert_lock before insert on public.weekly_plan_draft
for each row execute function public.lock_weekly_review_insert();
drop trigger if exists a_weekly_decision_insert_lock on public.weekly_plan_decision;
create trigger a_weekly_decision_insert_lock before insert on public.weekly_plan_decision
for each row execute function public.lock_weekly_review_insert();
revoke all on function public.lock_weekly_review_insert() from public,anon,authenticated;
