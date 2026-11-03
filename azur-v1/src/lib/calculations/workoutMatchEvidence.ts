/**
 * Advisory-only matching: never writes planned_session_id, never claims interval
 * execution compliance, and excludes unresolved/import-test records.
 */
export type RecordedWorkout={
 id:string;athlete_id:string;sport:string;source:string;start_time:string;
 duration_sec:number;planned_session_id:string|null;
 processed_metrics?:Record<string,unknown>|null;
};
export type PlannedWorkout={
 id:string;athlete_id:string;sport:string;planned_date:string;
 duration_min:number;title:string;
};
export type MatchProposal={
 activity_id:string;athlete_id:string;planned_session_id:string|null;
 status:'linked'|'candidate_review'|'ambiguous'|'unmatched'|'excluded';
 confidence:'high'|'moderate'|'none';rationale:string;
};
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'));
const utcDay=(s:string)=>Number.isFinite(Date.parse(s))?new Date(s).toISOString().slice(0,10):'';
export function proposeWorkoutMatch(activity:RecordedWorkout,planned:PlannedWorkout[]):MatchProposal{
 const blank=(status:MatchProposal['status'],rationale:string):MatchProposal=>({
  activity_id:activity.id,athlete_id:activity.athlete_id,planned_session_id:null,status,
  confidence:'none',rationale
 });
 const metrics=activity.processed_metrics||{};
 if(activity.source==='manual'||activity.source==='manual_test')
  return blank('excluded','Manual workouts already follow the athlete-reported completion workflow.');
 if(metrics.is_test===true||metrics.test_fixture===true||
    metrics.load_status==='pending_validation'||metrics.load_status==='rejected')
  return blank('excluded','Workout has not passed the device-import evidence gate.');
 if(!activity.id||!activity.athlete_id||!Number.isFinite(Date.parse(activity.start_time))||
    !Number.isFinite(activity.duration_sec)||activity.duration_sec<=0)
  return blank('excluded','Incomplete or invalid recorded workout evidence.');
 if(activity.planned_session_id) {
  const connected=planned.find(p=>p.id===activity.planned_session_id&&p.athlete_id===activity.athlete_id);
  return connected?{activity_id:activity.id,athlete_id:activity.athlete_id,planned_session_id:connected.id,
     status:'linked',confidence:'high',rationale:'Previously linked; this does not establish interval or intensity compliance.'}
   :blank('unmatched','Existing link could not be confirmed in the visible planned sessions. No relinking permitted.');
 }
 const date=utcDay(activity.start_time);
 const sameDay=planned.filter(p=>p.athlete_id===activity.athlete_id &&
    p.sport===activity.sport&&p.planned_date===date&&validDate(p.planned_date)&&p.duration_min>0);
 if(!sameDay.length)return blank('unmatched','No planned workout for the same athlete, sport and UTC calendar date.');
 // Multiple workouts of the same sport are intrinsically ambiguous; do not guess.
 if(sameDay.length!==1)return blank('ambiguous','Multiple sessions of this sport are planned on the activity date; coach review required.');
 const plan=sameDay[0];
 const durationDiff=(activity.duration_sec/60-plan.duration_min)/plan.duration_min;
 if(!Number.isFinite(durationDiff)||Math.abs(durationDiff)>0.25)
  return blank('unmatched','Recorded duration differs by more than 25% from the only planned workout; no automatic association.');
 return {activity_id:activity.id,athlete_id:activity.athlete_id,planned_session_id:plan.id,
  status:'candidate_review',confidence:'moderate',
  rationale:'Same athlete, sport, UTC date and duration within 25%. Candidate only: coach must confirm, and intensity compliance remains unverified.'};
}
