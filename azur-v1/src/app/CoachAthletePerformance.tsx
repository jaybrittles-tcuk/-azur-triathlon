import CoachTrainingLoadTrend from './CoachTrainingLoadTrend';
import { coachAttentionSignals } from '../lib/calculations/coachAttention';
import type { CoachAttention } from '../lib/calculations/coachAttention';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AssignedAthlete } from './CoachAthleteRoster';

type Baseline={strongest_sport:string|null;development_sport:string|null;weekly_hours:number|null;sessions_per_week:number|null;confirmed_at:string|null};
type TrainingSummary={planned:number;completed:number;completedHours:number;start:string;end:string};
function localDate(day:Date){return [day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');}
export default function CoachAthletePerformance({ athlete }: { athlete:AssignedAthlete|null }) {
 const [baseline,setBaseline]=useState<Baseline|null>(null);
 const [summary,setSummary]=useState<TrainingSummary|null>(null);
 const [loading,setLoading]=useState(false);
 const [alerts,setAlerts]=useState<CoachAttention[]>([]);
 const [error,setError]=useState('');
 useEffect(()=>{
  let cancelled=false;
  setBaseline(null);setSummary(null);setAlerts([]);setError('');
  if(!athlete)return;
  setLoading(true);
  async function load(){
   try{
    const {data:{user}}=await supabase.auth.getUser();
    if(user?.app_metadata?.role!=='coach')throw new Error('Verified coach access required');
    const {data:assignment,error:assignmentError}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id).eq('athlete_id',athlete!.id).maybeSingle();
    if(assignmentError||!assignment)throw new Error('Athlete is not assigned to this coach');
    const end=new Date();const start=new Date();start.setDate(end.getDate()-27);
    const [base,plans,activities]=await Promise.all([
      supabase.from('athlete_training_baseline').select('strongest_sport,development_sport,weekly_hours,sessions_per_week,confirmed_at').eq('athlete_id',athlete!.id).maybeSingle(),
      supabase.from('planned_session').select('id,planned_date,priority,session_class,status').eq('athlete_id',athlete!.id).eq('is_active_version',true).gte('planned_date',localDate(start)).lte('planned_date',localDate(end)),
      supabase.from('completed_activity').select('id,duration_sec,start_time,planned_session_id').eq('athlete_id',athlete!.id).gte('start_time',start.toISOString()).lte('start_time',end.toISOString())
    ]);
    if(base.error||plans.error||activities.error)throw new Error(base.error?.message||plans.error?.message||activities.error?.message);
    if(!cancelled){
      setBaseline(base.data??null);
      setAlerts(coachAttentionSignals(plans.data??[],activities.data??[],localDate(end)));
      setSummary({planned:plans.data?.length??0,completed:activities.data?.length??0,
        completedHours:Math.round((activities.data??[]).reduce((sum,a)=>sum+(Math.max(0,a.duration_sec??0)),0)/360)/10,
        start:localDate(start),end:localDate(end)});
    }
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Unable to load athlete performance');}
   finally{if(!cancelled)setLoading(false);}
  }void load();return()=>{cancelled=true;};
 },[athlete?.id]);
 return <section className="panel coach-cycling-review">
  <header><h3>Athlete Performance</h3><p>Assigned athlete · verified benchmarks and last 28 days</p></header>
  {!athlete&&<p>Select an assigned athlete above to view their performance.</p>}
  {loading&&<p>Loading performance…</p>}
  {error&&<p role="alert">{error}</p>}
  {athlete&&!loading&&!error&&<>
   <h4>{athlete.display_name||'Unnamed athlete'}</h4>
   <div className="coach-performance-grid">
    <div><small>Bike FTP</small><strong>{athlete.ftp_w!=null?`${athlete.ftp_w} W`:'Not recorded'}</strong></div>
    <div><small>Run threshold</small><strong>{athlete.run_threshold_sec_per_km!=null?`${athlete.run_threshold_sec_per_km} s/km`:'Not recorded'}</strong></div>
    <div><small>Swim CSS</small><strong>{athlete.swim_threshold_sec_per_100m!=null?`${athlete.swim_threshold_sec_per_100m} s/100m`:'Not recorded'}</strong></div>
    <div><small>Weekly availability</small><strong>{athlete.normal_weekly_hours!=null?`${athlete.normal_weekly_hours} hours`:'Not recorded'}</strong></div>
   </div>
   <p>Development focus: <strong>{baseline?.development_sport||'Not assessed'}</strong> · Strongest discipline: <strong>{baseline?.strongest_sport||'Not assessed'}</strong></p>
   <p>Baseline target: {baseline?.weekly_hours!=null?`${baseline.weekly_hours} hr/week`:'Not recorded'} · {baseline?.sessions_per_week!=null?`${baseline.sessions_per_week} sessions/week`:'Sessions not recorded'}</p>
   <CoachTrainingLoadTrend key={athlete.id} athlete={athlete} />
   <h5>Coach attention signals</h5>
   {alerts.length===0?<p>No attention signals identified from available records. This does not indicate recovery readiness.</p>:<ul>{alerts.map(a=><li key={a.code}><strong>{a.severity==='review'?'Review':'Information'}:</strong> {a.description}</li>)}</ul>}
   <h5>Recent training (28 days)</h5>
   {summary&&<p>{summary.completed} recorded activities · {summary.completedHours} hours completed · {summary.planned} active planned sessions in the same period</p>}
   <small>Activity count is not a completion percentage. Race focus, adherence and training load are not inferred from incomplete records. Read-only.</small>
  </>}
 </section>;
}
