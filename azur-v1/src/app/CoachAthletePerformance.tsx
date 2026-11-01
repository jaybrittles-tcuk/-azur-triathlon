import CoachTrainingLoadTrend from './CoachTrainingLoadTrend';
import { coachAttentionSignals } from '../lib/calculations/coachAttention';
import type { CoachAttention } from '../lib/calculations/coachAttention';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AssignedAthlete } from './CoachAthleteRoster';

type SessionReview={id:string;title:string;sport:string;planned_date:string;duration_min:number;status:string};
type RecordedReview={id:string;duration_sec:number;distance_m:number|null;source:string;session_rpe:number|null;notes:string|null;planned_session_id:string|null};
type FeedbackReview={planned_session_id:string;session_rpe:number|null;notes:string|null;updated_at:string};
type Baseline={strongest_sport:string|null;development_sport:string|null;weekly_hours:number|null;sessions_per_week:number|null;confirmed_at:string|null};
type TrainingSummary={planned:number;completed:number;completedHours:number;start:string;end:string};
function localDate(day:Date){return [day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');}
export default function CoachAthletePerformance({ athlete }: { athlete:AssignedAthlete|null }) {
 const [refreshKey,setRefreshKey]=useState(0);
 const [reviews,setReviews]=useState<Array<{session:SessionReview;activities:RecordedReview[];feedback:FeedbackReview|undefined}>>([]);
 const [baseline,setBaseline]=useState<Baseline|null>(null);
 const [summary,setSummary]=useState<TrainingSummary|null>(null);
 const [loading,setLoading]=useState(false);
 const [alerts,setAlerts]=useState<CoachAttention[]>([]);
 const [error,setError]=useState('');
 useEffect(()=>{
  let cancelled=false;
  setBaseline(null);setSummary(null);setAlerts([]);setReviews([]);setError('');
  if(!athlete)return;
  setLoading(true);
  async function load(){
   try{
    const {data:{user}}=await supabase.auth.getUser();
    if(user?.app_metadata?.role!=='coach')throw new Error('Verified coach access required');
    const {data:assignment,error:assignmentError}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id).eq('athlete_id',athlete!.id).maybeSingle();
    if(assignmentError||!assignment)throw new Error('Athlete is not assigned to this coach');
    const end=new Date();end.setHours(23,59,59,999);const start=new Date();start.setDate(end.getDate()-27);start.setHours(0,0,0,0);
    const [base,plans,activities,feedback]=await Promise.all([
      supabase.from('athlete_training_baseline').select('strongest_sport,development_sport,weekly_hours,sessions_per_week,confirmed_at').eq('athlete_id',athlete!.id).maybeSingle(),
      supabase.from('planned_session').select('id,title,sport,duration_min,planned_date,priority,session_class,status').eq('athlete_id',athlete!.id).eq('is_active_version',true).gte('planned_date',localDate(start)).lte('planned_date',localDate(end)),
      supabase.from('completed_activity').select('id,duration_sec,distance_m,source,session_rpe,notes,start_time,planned_session_id').eq('athlete_id',athlete!.id).gte('start_time',start.toISOString()).lte('start_time',end.toISOString()),
      supabase.from('session_feedback').select('planned_session_id,session_rpe,notes,updated_at').eq('athlete_id',athlete!.id).order('updated_at',{ascending:false}).limit(100)
    ]);
    if(base.error||plans.error||activities.error||feedback.error)throw new Error(base.error?.message||plans.error?.message||activities.error?.message||feedback.error?.message);
    if(!cancelled){
      setReviews((plans.data??[]).filter(session=>session.status==='completed'||(feedback.data??[]).some(item=>item.planned_session_id===session.id))
        .sort((a,b)=>b.planned_date.localeCompare(a.planned_date)).map(session=>({
          session,activities:(activities.data??[]).filter(item=>item.planned_session_id===session.id),
          feedback:(feedback.data??[]).find(item=>item.planned_session_id===session.id)
        })));
      setBaseline(base.data??null);
      setAlerts(coachAttentionSignals(plans.data??[],activities.data??[],localDate(end)));
      setSummary({planned:plans.data?.length??0,completed:activities.data?.length??0,
        completedHours:Math.round((activities.data??[]).reduce((sum,a)=>sum+(Math.max(0,a.duration_sec??0)),0)/360)/10,
        start:localDate(start),end:localDate(end)});
    }
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Unable to load athlete performance');}
   finally{if(!cancelled)setLoading(false);}
  }void load();return()=>{cancelled=true;};
 },[athlete?.id,refreshKey]);
 return <section className="panel coach-cycling-review">
  <header><h3>Training intelligence</h3><p>Recorded training and athlete feedback · last 28 days</p></header>
  {athlete&&<button type="button" disabled={loading} onClick={()=>setRefreshKey(key=>key+1)}>Refresh athlete records</button>}
  {!athlete&&<p>Select an assigned athlete above to view their performance.</p>}
  {loading&&<p>Loading performance…</p>}
  {error&&<p role="alert">{error}</p>}
  {athlete&&!loading&&!error&&<>
   <h4>{athlete.display_name||'Unnamed athlete'}</h4>
   {summary&&<div className="azur-training-facts">
     <div><small>ACTIVITIES LOGGED</small><strong>{summary.completed}</strong></div>
     <div><small>TRAINING HOURS</small><strong>{summary.completedHours} h</strong></div>
     <div><small>PLANNED SESSIONS</small><strong>{summary.planned}</strong></div>
   </div>}
   {summary?.completed===0&&<p className="azur-training-data-note">No completed activities have been recorded for the last 28 days. This is not a recovery or adherence judgement.</p>}
   <details className="azur-training-context"><summary>Training baseline and discipline focus</summary>
    <p>Development focus: <strong>{baseline?.development_sport||'Not assessed'}</strong> · Strongest discipline: <strong>{baseline?.strongest_sport||'Not assessed'}</strong></p>
    <p>Confirmed baseline: {baseline?.weekly_hours!=null?`${baseline.weekly_hours} h/week`:'Not recorded'} · {baseline?.sessions_per_week!=null?`${baseline.sessions_per_week} sessions/week`:'Sessions not recorded'}</p>
   </details>
   <section className="coach-workout-reviews" aria-label="Workout completion and feedback">
    <h4>Workout feedback</h4>
    {reviews.length===0?<p>No completed sessions or feedback in this period.</p>:reviews.map(({session,activities,feedback})=><article key={session.id}>
      <h5>{session.title}</h5><p>{session.planned_date} · {session.sport} · {session.duration_min} min planned</p>
      {activities.map(activity=><p key={activity.id}><strong>{Math.round(activity.duration_sec/60*10)/10} min recorded</strong>{activity.distance_m!=null?' · '+(Number(activity.distance_m)/1000).toFixed(2)+' km':''} · {activity.source==='manual'?'Athlete-reported':activity.source}</p>)}
      {activities.length===0&&<p>No linked activity recorded.</p>}
      <p>Reported effort · {feedback?.session_rpe!=null?feedback.session_rpe+'/10':'Not supplied'}</p>
      <p className="coach-feedback-notes">{feedback?.notes||'No athlete notes supplied.'}</p>
      {feedback&&<small>Feedback saved {new Date(feedback.updated_at).toLocaleString('en-GB')}</small>}
    </article>)}
   </section>
   <CoachTrainingLoadTrend key={athlete.id} athlete={athlete} />
   <h5>Coach attention signals</h5>
   {alerts.length===0?<p>No attention signals identified from available records. This does not indicate recovery readiness.</p>:<ul>{alerts.map(a=><li key={a.code}><strong>{a.severity==='review'?'Review':'Information'}:</strong> {a.description}</li>)}</ul>}
   <small>Activity count is not a completion percentage. Race focus, adherence and training load are not inferred from incomplete records. Read-only.</small>
  </>}
 </section>;
}
