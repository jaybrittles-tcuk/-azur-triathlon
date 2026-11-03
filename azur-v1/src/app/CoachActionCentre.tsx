import {useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';
import {assessAdaptiveDecision} from '../lib/calculations/adaptiveDecision';
import type {DurationObservation,DurationPattern,Decision} from '../lib/calculations/adaptiveDecision';

type Assignment = {athlete_id:string};
type Profile = {id:string;display_name:string|null};
type Seen = {item_key:string};
type CoachRow = {athlete:Profile;decision:Decision;key:string;reviewed:boolean};
const LIMIT=1000;
const keyFor=(d:Decision, observations:DurationObservation[],patterns:DurationPattern[])=>{
 const latestObservation=observations.filter(o=>o.athlete_id===d.athlete_id)
   .sort((a,b)=>b.observed_at.localeCompare(a.observed_at))[0];
 const latestPattern=patterns.filter(p=>p.athlete_id===d.athlete_id)
   .sort((a,b)=>b.latest_observed_at.localeCompare(a.latest_observed_at))[0];
 return ['adaptive-v3',d.action,d.priority,latestObservation?.activity_id||'none',
   latestObservation?.duration_delta_pct??'none',latestPattern?.latest_observed_at||'none',
   latestPattern?.signal_type||'none'].join(':');
};

export default function CoachActionCentre(){
 const [rows,setRows]=useState<CoachRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [coachId,setCoachId]=useState('');
 const [busy,setBusy]=useState('');
 const [showAll,setShowAll]=useState(false);
 const [truncated,setTruncated]=useState(false);
 const [reload,setReload]=useState(0);
 useEffect(()=>{let active=true;(async()=>{
  setLoading(true);setError('');
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach login required');
   const {data:assigned,error:assignmentError}=await supabase.from('coach_athlete_assignment')
    .select('athlete_id').eq('coach_user_id',user.id).limit(LIMIT+1);
   if(assignmentError)throw assignmentError;
   if((assigned??[]).length>LIMIT)throw new Error('More than 1000 assigned athletes: pagination required before showing complete roster.');
   const ids=((assigned??[]) as Assignment[]).map(x=>x.athlete_id);
   if(!ids.length){if(active){setRows([]);setCoachId(user.id)}return;}
   // Only the two evidence tables and athlete display names are needed for triage.
   // Database policies restrict insights and patterns to assigned coaches.
   const [profiles,insights,patterns,reviewed]=await Promise.all([
    supabase.from('athlete_profile').select('id,display_name').in('id',ids).limit(LIMIT+1),
    supabase.from('coach_session_insight')
      .select('activity_id,athlete_id,duration_delta_pct,evidence_level,severity,observed_at')
      .in('athlete_id',ids).eq('eligible_for_patterns',true)
      .order('observed_at',{ascending:false}).limit(LIMIT+1),
    supabase.from('coach_training_pattern')
      .select('athlete_id,signal_type,linked_sessions,affected_sessions,reported_sessions,device_sessions,latest_observed_at')
      .in('athlete_id',ids).order('latest_observed_at',{ascending:false}).limit(LIMIT+1),
    supabase.from('coach_monitoring_review').select('item_key')
      .eq('coach_user_id',user.id).like('item_key','adaptive-v3:%').limit(LIMIT+1)
   ]);
   const issue=[profiles.error,insights.error,patterns.error,reviewed.error].find(Boolean);
   if(issue)throw issue;
   const incomplete=[profiles.data,insights.data,patterns.data,reviewed.data].some(result=>(result??[]).length>LIMIT);
   if(incomplete)throw new Error('Evidence or review history exceeds current 1000-row limit. Unable to safely rank the full roster.');
   const observations=(insights.data??[]) as DurationObservation[];
   const repeating=(patterns.data??[]) as DurationPattern[];
   const reviewedKeys=new Set(((reviewed.data??[]) as Seen[]).map(x=>x.item_key));
   const athleteById=new Map(((profiles.data??[]) as Profile[]).map(p=>[p.id,p]));
   // Missing or inaccessible athlete profiles are not silently dropped.
   if(ids.some(id=>!athleteById.has(id)))throw new Error('One or more assigned athlete profiles could not be read.');
   const decisions=ids.map(id=>{
     const decision=assessAdaptiveDecision(id,observations,repeating);
     const key=keyFor(decision,observations,repeating);
     return {athlete:athleteById.get(id)!,decision,key,reviewed:reviewedKeys.has(key)};
   });
   const weight=(r:CoachRow)=>r.decision.priority==='high'?0:r.decision.priority==='review'?1:r.decision.action==='insufficient_data'?2:3;
   decisions.sort((a,b)=>weight(a)-weight(b)||a.athlete.display_name!.localeCompare(b.athlete.display_name!));
   if(active){setRows(decisions);setCoachId(user.id);setTruncated(false)}
  }catch(e){if(active){setRows([]);setError(e instanceof Error?e.message:'Unable to assess assigned athletes')}}
  finally{if(active)setLoading(false)}
 })();return()=>{active=false}},[reload]);
 const pending=useMemo(()=>rows.filter(r=>r.decision.action==='coach_review'&&!r.reviewed),[rows]);
 const high=pending.filter(r=>r.decision.priority==='high').length;
 const limited=rows.filter(r=>r.decision.action==='insufficient_data').length;
 const displayed=showAll?rows:pending;
 async function acknowledge(row:CoachRow){
  setBusy(row.key);setError('');
  try{
   if(!coachId||row.decision.action!=='coach_review')return;
   const {error:writeError}=await supabase.from('coach_monitoring_review')
    .insert({coach_user_id:coachId,athlete_id:row.athlete.id,item_key:row.key});
   if(writeError&&writeError.code!=='23505')throw writeError;
   setRows(old=>old.map(r=>r.key===row.key?{...r,reviewed:true}:r));
  }catch(e){setError(e instanceof Error?e.message:'Could not mark action reviewed')}
  finally{setBusy('')}
 }
 return <section className="coach-attention-v2" aria-label="AZUR coach action centre">
  <header className="coach-attention-heading"><div><h3>AZUR Action Centre</h3>
    <p>Evidence-based triage across assigned athletes. Advisory only: no calendar edits or automatic training prescriptions.</p></div>
    <button type="button" onClick={()=>setReload(x=>x+1)} disabled={loading}>↻ Refresh</button>
  </header>
  <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
    <strong>{loading?'Assessing roster…':pending.length+' coach actions'}</strong>
    {!loading&&<span>{high} high priority · {limited} insufficient data · {rows.length} athletes assessed</span>}
    <label style={{display:'flex',gap:6,alignItems:'center'}}><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/> All athletes</label>
  </div>
  {error&&<p role="alert">{error}</p>}
  {truncated&&<p>Not all athlete evidence was loaded. Do not rely on this queue for full-roster review.</p>}
  {!loading&&!error&&displayed.length===0&&<p>No outstanding coach actions. This does not establish that all athletes are recovered or training optimally; use All athletes to inspect evidence gaps.</p>}
  {!loading&&!error&&displayed.map(row=><article className="coach-attention-row" key={row.athlete.id} style={{marginBottom:12}}>
   <div>
    <strong>{row.athlete.display_name||'Assigned athlete'} · {row.decision.priority==='high'?'High priority':row.decision.priority==='review'?'Needs review':row.decision.action==='insufficient_data'?'Insufficient data':'Continue monitoring'}</strong>
    <p>{row.decision.rationale}</p>
    <p><b>Evidence:</b> {row.decision.evidence.join(' · ')}</p>
    <p><b>Suggested coach action:</b> {row.decision.suggested_next_step}</p>
    <small>{row.decision.confidence} evidence confidence · {row.decision.coach_approval_required?'Any significant change requires coach approval':'No training change proposed'}</small>
   </div>
   {row.decision.action==='coach_review'&&<button type="button" disabled={Boolean(busy)||row.reviewed} onClick={()=>void acknowledge(row)}>
     {row.reviewed?'Reviewed':busy===row.key?'Saving…':'Mark reviewed'}
   </button>}
  </article>)}
 </section>;
}
