import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {assessSessionEffortReview} from '../lib/calculations/sessionEffortReview';

type Signal={id:string;athleteId:string;source:string;reportedRpe:number;reason:string;date:string;athleteName:string;workoutTitle:string};
export default function CoachRecoverySignals(){
 const [signals,setSignals]=useState<Signal[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [count,setCount]=useState(0);
 async function refresh(){
  setLoading(true);setError('');
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user||user.app_metadata?.role!=='coach')throw Error('Verified coach sign-in required');
   const {data:assign,error:assignError}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
   if(assignError)throw assignError;
   const ids=[...new Set((assign||[]).map(a=>a.athlete_id))];
   setCount(ids.length);
   if(!ids.length){setSignals([]);return;}
   const [feedback,activities]=await Promise.all([
    supabase.from('session_feedback').select('id,athlete_id,planned_session_id,session_rpe,created_at').in('athlete_id',ids).order('created_at',{ascending:false}).limit(100),
    supabase.from('completed_activity').select('id,athlete_id,planned_session_id,session_rpe,created_at,source').in('athlete_id',ids).not('session_rpe','is',null).order('created_at',{ascending:false}).limit(100)
   ]);
   if(feedback.error||activities.error)throw Error(feedback.error?.message||activities.error?.message||'Unable to load recovery evidence');
   const sessionIds=[...new Set([...(feedback.data||[]),...(activities.data||[])].map(r=>r.planned_session_id).filter((id):id is string=>typeof id==='string'))];
   const [profiles,sessions]=await Promise.all([
    supabase.from('athlete_profile').select('id,display_name').in('id',ids),
    sessionIds.length?supabase.from('planned_session').select('id,athlete_id,title').in('id',sessionIds):Promise.resolve({data:[],error:null})
   ]);
   if(profiles.error||sessions.error)throw Error(profiles.error?.message||sessions.error?.message||'Unable to load athlete and workout context');
   const names=new Map((profiles.data||[]).map(p=>[p.id,p.display_name||'Assigned athlete']));
   const titles=new Map((sessions.data||[]).map(p=>[p.id+':'+p.athlete_id,p.title||'Workout title unavailable']));
   const seen=new Set<string>();const result:Signal[]=[];
   // Prefer feedback for a session when both tables have a reported RPE.
   for(const [rows,source] of [[feedback.data||[],'athlete feedback'],[activities.data||[],'recorded activity']] as const){
    for(const row of rows){
     const key=row.athlete_id+':'+(row.planned_session_id||source+':'+row.id);
     if(seen.has(key))continue;
     seen.add(key);
     const assessment=assessSessionEffortReview({reportedRpe:row.session_rpe,source:source==='athlete feedback'?'manual':'unknown'});
     if(assessment.requiresCoachReview)result.push({id:source+row.id,athleteId:row.athlete_id,source,reportedRpe:row.session_rpe,reason:assessment.reason,date:row.created_at,athleteName:names.get(row.athlete_id)||'Assigned athlete',workoutTitle:row.planned_session_id?titles.get(row.planned_session_id+':'+row.athlete_id)||'Workout details unavailable':'Unlinked activity / feedback'});
    }
   }
   setSignals(result.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,25));
  }catch(e){setError(e instanceof Error?e.message:'Recovery review unavailable');setSignals([]);}
  finally{setLoading(false)}
 }
 useEffect(()=>{void refresh()},[]);
 return <details style={{margin:'12px 0',padding:14,border:'1px solid #385875',borderRadius:12}}>
  <summary><strong>Recovery review signals</strong> · {loading?'loading':signals.length+' high-effort report'+(signals.length===1?'':'s')}</summary>
  <p style={{fontSize:13,opacity:.85}}>Read-only signals from saved session feedback and activity reports for assigned athletes. No changes to training are made.</p>
  <button type="button" onClick={()=>void refresh()} disabled={loading}>Refresh recovery signals</button>
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&count===0&&<p>No assigned athletes.</p>}
  {!loading&&!error&&count>0&&signals.length===0&&<p>No high-effort RPE reports found in the latest available records. This does not confirm recovery readiness.</p>}
  {signals.map(s=><article key={s.id} style={{padding:10,marginTop:10,border:'1px solid #46617a',borderRadius:8}}>
   <strong>Review recovery · RPE {s.reportedRpe}/10</strong>
   <p style={{fontSize:12,opacity:.8}}>{s.athleteName} · {s.workoutTitle} · {s.source} · {new Date(s.date).toLocaleDateString('en-GB')}</p>
   <p>{s.reason}</p>
  </article>)}
 </details>;
}
