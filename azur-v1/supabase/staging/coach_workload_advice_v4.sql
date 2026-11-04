-- Read-only decision-support policy: never automatically increase load.
-- Coach assignment and role are enforced by the underlying evidence RPC.
create or replace function public.coach_foundation_workload_advice(p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp
as $advice$
declare
 v_evidence jsonb;
 v_proposal numeric;
 v_reported numeric;
 v_observed numeric;
 v_available numeric;
 v_history text;
 v_weeks jsonb;
 v_low numeric;
 v_high numeric;
 v_recent numeric;
 v_prev numeric;
 v_recommended numeric;
 v_reason text;
 v_disposition text;
 v_sports jsonb;
 v_swim numeric;
 v_bike numeric;
 v_run numeric;
begin
 v_evidence:=public.coach_foundation_training_evidence(p_request_id);
 v_proposal:=coalesce((v_evidence->>'proposed_weekly_hours')::numeric,0);
 v_reported:=(v_evidence->>'reported_weekly_hours')::numeric;
 v_observed:=coalesce((v_evidence->>'verified_weekly_average_hours')::numeric,0);
 v_history:=v_evidence->>'history_adequacy';
 v_weeks:=v_evidence->'weekly_validated_load';
 v_sports:=v_evidence->'sport_distribution';

 -- This evidence is partial by definition. "Insufficient" is not zero fitness.
 if v_history is distinct from 'moderate_validated_coverage' then
   return jsonb_build_object(
     'disposition','coach_evidence_review',
     'confidence','insufficient',
     'suggested_weekly_hours',null,
     'suggested_range_hours',null,
     'proposed_weekly_hours',v_proposal,
     'observed_weekly_hours',v_observed,
     'recommendation','Do not automatically increase or intensify training. Obtain adequate recent activity records, discuss reported training and readiness, then have the coach decide.',
     'workout_guidance','Remain with approved easy aerobic and technique sessions. No threshold, FTP, CSS or high-intensity progression from incomplete records.',
     'sport_guidance','Training gaps cannot be inferred reliably from missing device activities.',
     'evidence_basis',v_evidence);
 end if;

 -- Four weekly buckets may contain partial calendar weeks. Use a deliberately
 -- bounded range instead of a jump based on one active week.
 select max((w.value->>'validated_hours')::numeric),
        min((w.value->>'validated_hours')::numeric)
 into v_high,v_low from jsonb_array_elements(v_weeks) w;
 v_recommended:=round(least(v_proposal,v_observed*1.05,8)::numeric*2)/2;
 v_recommended:=greatest(v_recommended,0);
 if v_observed=0 or v_high>greatest(v_low*2,2) then
   v_disposition:='coach_evidence_review';
   v_reason:='Validated weekly volume is uneven or incomplete; reconcile activity consistency before progression.';
 elsif v_reported is not null and v_observed<v_reported*0.6 then
   v_disposition:='coach_evidence_review';
   v_reason:='Reported training and validated device history differ substantially; check missing integrations before progression.';
 elsif v_proposal>v_recommended+0.5 then
   v_disposition:='reduce_or_justify';
   v_reason:='Proposed volume exceeds the conservative observed-training reference. Coach should reduce it or document other verified capacity evidence.';
 else
   v_disposition:='maintain_easy';
   v_reason:='The proposed easy-training volume is broadly consistent with observed validated sessions; confirm readiness before approving.';
 end if;
 return jsonb_build_object(
   'disposition',v_disposition,
   'confidence','limited_validated',
   'suggested_weekly_hours',v_recommended,
   'suggested_range_hours',jsonb_build_array(
      greatest(0,round(v_recommended*0.9*2)/2),
      v_recommended),
   'observed_weekly_hours',v_observed,
   'proposed_weekly_hours',v_proposal,
   'recommendation',v_reason,
   'workout_guidance','Preserve easy aerobic/technique and approved benchmark-independent library work. Increase difficulty only after readiness checks, thresholds and coach review.',
   'sport_guidance','Inspect verified swim/bike/run coverage against athlete availability and event goals. Missing sport activity is not proof of a weakness.',
   'evidence_basis',v_evidence
 );
end;
$advice$;

revoke all on function public.coach_foundation_workload_advice(uuid) from public,anon;
grant execute on function public.coach_foundation_workload_advice(uuid) to authenticated;
