-- Staging additive publisher. Baselines are captured before approval and immutable.
create table if not exists public.weekly_additive_baseline(
 draft_id uuid primary key references public.weekly_plan_draft(id),
 existing_sessions jsonb not null check(jsonb_typeof(existing_sessions)='array'),
 captured_at timestamptz not null default now()
);
alter table public.weekly_additive_baseline enable row level security;
revoke all on public.weekly_additive_baseline from anon,authenticated;
grant select,insert on public.weekly_additive_baseline to service_role;
drop trigger if exists additive_baseline_immutable on public.weekly_additive_baseline;
create trigger additive_baseline_immutable before update or delete on public.weekly_additive_baseline
for each row execute function public.reject_weekly_review_mutation();

create or replace function public.capture_weekly_additive_baseline(p_draft_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.weekly_plan_draft%rowtype; v_snapshot jsonb;
begin
 select * into d from public.weekly_plan_draft where id=p_draft_id;
 if not found then raise exception 'Draft not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(d.athlete_id::text||':'||d.week_start::text,0));
 if exists(select 1 from public.weekly_plan_decision where draft_id=p_draft_id)
 then raise exception 'Capture baseline before any review decision'; end if;
 if exists(select 1 from public.weekly_additive_baseline where draft_id=p_draft_id)
 then raise exception 'Baseline already captured'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'date',planned_date,'sport',sport,'title',title,'sessionClass',session_class,
 'priority',priority,'durationMin',duration_min,'targets',targets,'prescription',prescription,
 'rationale',rationale,'terrain',terrain,'status',status,'locked',locked,'version',version
 ) order by id),'[]'::jsonb)
 into v_snapshot from public.planned_session
 where athlete_id=d.athlete_id and planned_date between d.week_start and d.week_start+6 and is_active_version;
 if v_snapshot='[]'::jsonb then raise exception 'Additive plan requires existing active sessions'; end if;
 insert into public.weekly_additive_baseline(draft_id,existing_sessions) values(p_draft_id,v_snapshot);
 return jsonb_build_object('status','captured','existing',jsonb_array_length(v_snapshot));
end;$$;
revoke all on function public.capture_weekly_additive_baseline(uuid) from public,anon,authenticated;
grant execute on function public.capture_weekly_additive_baseline(uuid) to service_role;
