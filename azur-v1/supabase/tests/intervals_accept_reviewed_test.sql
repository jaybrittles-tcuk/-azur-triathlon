\set ON_ERROR_STOP on
DO $$
DECLARE a uuid:='00000000-0000-4000-8000-000000000001';
DECLARE b uuid:='00000000-0000-4000-8000-000000000002';
DECLARE staged uuid;
DECLARE imported uuid;
DECLARE r record;
BEGIN
 select id into staged from public.intervals_import_inbox where athlete_id=a and source_activity_id='zwift-29';
 if staged is null then raise exception 'Fixture staged ride missing'; end if;
 begin
  perform * from public.accept_staged_intervals_ride(a,staged);
  raise exception 'Unreviewed ride unexpectedly imported';
 exception when raise_exception then
  if SQLERRM = 'Unreviewed ride unexpectedly imported' then raise; end if;
 end;
 begin
  perform * from public.accept_staged_intervals_ride(b,staged);
  raise exception 'Wrong athlete imported a ride';
 exception when raise_exception then
  if SQLERRM = 'Wrong athlete imported a ride' then raise; end if;
 end;
 update public.intervals_import_inbox set status='reviewed',reviewed_at=now() where id=staged;
 select * into r from public.accept_staged_intervals_ride(a,staged);
 if r.outcome <> 'imported_pending_load_review' then raise exception 'First reviewed acceptance failed'; end if;
 imported:=r.activity_id;
 select * into r from public.accept_staged_intervals_ride(a,staged);
 if r.outcome <> 'already_imported' or r.activity_id <> imported then raise exception 'Repeated acceptance not idempotent'; end if;
 if (select count(*) from public.completed_activity where source='intervals' and source_activity_id='zwift-29')<>1 then raise exception 'Duplicate imported ride'; end if;
 if (select planned_session_id from public.completed_activity where id=imported) is not null then raise exception 'Planned session was auto linked'; end if;
 if (select processed_metrics->>'load_status' from public.completed_activity where id=imported) <> 'pending_validation' then raise exception 'Training load was unexpectedly eligible'; end if;
end $$;
select 'PASS: manual acceptance, replay, athlete isolation and load quarantine' as result;
