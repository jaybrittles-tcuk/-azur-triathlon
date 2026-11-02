import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {reviewWeekTarget} from '../lib/calculations/weeklyPlanSafety';
type Row={athleteId:string;athleteName:string;weekStart:string;targetHours:number;plannedMinutes:number;shortfall:number;status:string;reasons:string[];sessions:number};
function currentMonday(){const d=new Date();const n=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10)}
export default function CoachWeekReconciliationPreview(){
 const [rows,setRows]=useState<Row[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
 async function inspect(){
  setLoading(true);setError('');
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach account required');
   const {data:assigned,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
   if(ae)throw ae;const ids=(assigned??[]).map(x=>x.athlete_id);if(!ids.length){setRows([]);return}
   const monday=currentMonday();const sunday=new Date(monday+'T12:00:00Z');sunday.setUTCDate(sunday.getUTCDate()+6);
   const [profiles,weeks,planned]=await Promise.all([
    supabase.from('athlete_profile').select('id,display_name').in('id',ids),
    supabase.from('season_week').select('athlete_id,week_start,target_hours').in('athlete_id',ids).eq('week_start',monday),
    supabase.from('planned_session').select('id,athlete_id,planned_date,duration_min,status,is_active_version,locked').in('athlete_id',ids).gte('planned_date',monday).lte('planned_date',sunday.toISOString().slice(0,10))
   ]);
   if(profiles.error||weeks.error||planned.error)throw new Error(profiles.error?.message||weeks.error?.message||planned.error?.message);
   const names=new Map((profiles.data??[]).map(p=>[p.id,p.display_name||'Assigned athlete']));
   setRows((weeks.data??[]).map(w=>{
    const sessions=(planned.data??[]).filter(s=>s.athlete_id===w.athlete_id);
    const v=reviewWeekTarget({weekStart:w.week_start,targetHours:Number(w.target_hours),sessions});
    return {athleteId:w.athlete_id,athleteName:names.get(w.athlete_id)||'Assigned athlete',weekStart:w.week_start,targetHours:Number(w.target_hours),plannedMinutes:v.scheduledMinutes,shortfall:v.shortfallMinutes,status:v.state,reasons:v.reasons,sessions:sessions.filter(s=>s.is_active_version&&s.status!=='cancelled').length}
   }));
  }catch(e){setError(e instanceof Error?e.message:'Unable to inspect training week');}finally{setLoading(false)}
 }
 useEffect(()=>{void inspect()},[]);
 return <section className="coach-attention-group"><header className="coach-attention-heading"><div><h4>Weekly completeness inspection</h4><p>Read-only training target reconciliation; never changes the athlete calendar.</p></div><button type="button" disabled={loading} onClick={()=>void inspect()}>Refresh</button></header>
 {error&&<p role="alert">{error}</p>}{loading?<p>Checking planned training…</p>:rows.length?rows.map(r=><article key={r.athleteId} className="coach-attention-row"><div><strong>{r.athleteName} · {r.weekStart} · {r.status}</strong><p>{r.sessions} sessions · {r.plannedMinutes} of {Math.round(r.targetHours*60)} planned minutes · shortfall {r.shortfall} min</p>{r.reasons.map(x=><p key={x}>{x}</p>)}<small>Additional sessions require approved library coverage and a separate coach-reviewed proposal.</small></div></article>):<p>No assigned athlete has a weekly target record for the current week.</p>}
 </section>;
}
