import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {proposeWorkoutMatch} from '../lib/calculations/workoutMatchEvidence';
import type {RecordedWorkout,PlannedWorkout,MatchProposal} from '../lib/calculations/workoutMatchEvidence';
type Item={proposal:MatchProposal;date:string;source:string; sport:string};
const LIMIT=500;
export default function CoachWorkoutMatchReview(){
 const [items,setItems]=useState<Item[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;(async()=>{
  setLoading(true);setError('');
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach login required');
   const {data:assignments,error:assignmentError}=await supabase.from('coach_athlete_assignment')
    .select('athlete_id').eq('coach_user_id',user.id).limit(LIMIT+1);
   if(assignmentError)throw assignmentError;
   if((assignments??[]).length>LIMIT)throw new Error('Athlete roster exceeds preview limit; pagination is required.');
   const ids=(assignments??[]).map(a=>a.athlete_id);
   if(!ids.length){if(active)setItems([]);return;}
   const since=new Date(Date.now()-21*86400000).toISOString();
   const fromDay=since.slice(0,10);
   const [activities,sessions]=await Promise.all([
    supabase.from('completed_activity')
      .select('id,athlete_id,sport,source,start_time,duration_sec,planned_session_id,processed_metrics')
      .in('athlete_id',ids).neq('source','manual').gte('start_time',since)
      .order('start_time',{ascending:false}).limit(LIMIT+1),
    supabase.from('planned_session')
      .select('id,athlete_id,sport,planned_date,duration_min,title')
      .in('athlete_id',ids).gte('planned_date',fromDay)
      .order('planned_date',{ascending:false}).limit(LIMIT+1)
   ]);
   if(activities.error||sessions.error)throw new Error(activities.error?.message||sessions.error?.message||'Unable to load workout matching data');
   if((activities.data??[]).length>LIMIT||(sessions.data??[]).length>LIMIT)
     throw new Error('Too many recent activities or planned sessions for complete matching. Pagination required.');
   const plans=(sessions.data??[]) as PlannedWorkout[];
   const proposed=((activities.data??[]) as RecordedWorkout[]).map(activity=>({
    proposal:proposeWorkoutMatch(activity,plans),
    date:activity.start_time,source:activity.source,sport:activity.sport
   })).filter(row=>row.proposal.status!=='excluded');
   if(active)setItems(proposed);
  }catch(e){if(active){setItems([]);setError(e instanceof Error?e.message:'Could not assess imports')}}
  finally{if(active)setLoading(false)}
 })();return()=>{active=false}},[revision]);
 const candidate=items.filter(item=>item.proposal.status==='candidate_review').length;
 return <section className="coach-attention-v2" aria-label="Workout association review">
  <header className="coach-attention-heading">
   <div><h3>Workout matching evidence</h3>
    <p>Read-only comparison of imported activity with planned sessions. No automatic linking, completion or calendar edits.</p></div>
   <button type="button" disabled={loading} onClick={()=>setRevision(v=>v+1)}>↻ Refresh matches</button>
  </header>
  <p>{loading?'Checking imported activity…':candidate+' suggested matches for coach verification · '+items.length+' recent recorded activities evaluated'}</p>
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&items.length===0&&<p>No eligible recent device activities to assess. This is not evidence of missing training.</p>}
  {!loading&&!error&&items.map(item=><article className="coach-attention-row" key={item.proposal.activity_id} style={{marginBottom:10}}>
   <div>
    <strong>{item.sport.toUpperCase()} · {item.proposal.status==='candidate_review'?'Candidate — coach confirmation needed':item.proposal.status==='linked'?'Linked (not compliance-verified)':item.proposal.status==='ambiguous'?'Ambiguous':'Unmatched'}</strong>
    <p>{new Date(item.date).toLocaleDateString('en-GB')} · {item.source}</p>
    <p>{item.proposal.rationale}</p>
    <small>Activity: {item.proposal.activity_id.slice(0,8)} · Suggested session: {item.proposal.planned_session_id?.slice(0,8)||'None'}. No writes permitted.</small>
   </div>
  </article>)}
 </section>;
}
