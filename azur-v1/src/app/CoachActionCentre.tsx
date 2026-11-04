import {useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';
import {assessAdaptiveDecision} from '../lib/calculations/adaptiveDecision';
import {assessBikeEvidence} from '../lib/calculations/validatedBikeEvidence';
import type {ValidatedBikeRow} from '../lib/calculations/validatedBikeEvidence';
import type {DurationObservation,DurationPattern,Decision} from '../lib/calculations/adaptiveDecision';

type Assignment = {athlete_id:string};
type Profile = {id:string;display_name:string|null};
type Seen = {item_key:string};
type CoachRow = {athlete:Profile;decision:Decision;key:string;reviewed:boolean};
const PERFORMANCE_WINDOW_DAYS=21;
const LIMIT=1000;
const keyFor=(d:Decision, observations:DurationObservation[],patterns:DurationPattern[], latestPowerId:string|null)=>{
 const latestObservation=observations.filter(o=>o.athlete_id===d.athlete_id)
   .sort((a,b)=>b.observed_at.localeCompare(a.observed_at))[0];
 const latestPattern=patterns.filter(p=>p.athlete_id===d.athlete_id)
   .sort((a,b)=>b.latest_observed_at.localeCompare(a.latest_observed_at))[0];
 return ['adaptive-v3',d.action,d.priority,latestObservation?.activity_id||'none',
   latestObservation?.duration_delta_pct??'none',latestPattern?.latest_observed_at||'none',
   latestPattern?.signal_type||'none',latestPowerId||'no-power'].join(':');
};

export default function CoachActionCentre(){
 const [rows,setRows]=useState<CoachRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [coachId,setCoachId]=useState('');
 const [busy,setBusy]=useState('');
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
   const [profiles,insights,patterns,power,reviewed]=await Promise.all([
    supabase.from('athlete_profile').select('id,display_name').in('id',ids).limit(LIMIT+1),
    supabase.from('coach_session_insight')
      .select('activity_id,athlete_id,duration_delta_pct,evidence_level,severity,observed_at')
      .in('athlete_id',ids).eq('eligible_for_patterns',true)
      .order('observed_at',{ascending:false}).limit(LIMIT+1),
    supabase.from('coach_training_pattern')
      .select('athlete_id,signal_type,linked_sessions,affected_sessions,reported_sessions,device_sessions,latest_observed_at')
      .in('athlete_id',ids).order('latest_observed_at',{ascending:false}).limit(LIMIT+1),
    supabase.from('coach_validated_bike_evidence')
      .select('activity_id,athlete_id,planned_session_id,start_time,source,processed_metrics')
      .in('athlete_id',ids)
      .gte('start_time',new Date(Date.now()-PERFORMANCE_WINDOW_DAYS*86400000).toISOString())
      .order('start_time',{ascending:false}).limit(LIMIT+1),
    supabase.from('coach_monitoring_review').select('item_key')
      .eq('coach_user_id',user.id).like('item_key','adaptive-v3:%').limit(LIMIT+1)
   ]);
   const issue=[profiles.error,insights.error,patterns.error,power.error,reviewed.error].find(Boolean);
   if(issue)throw issue;
   const incomplete=[profiles.data,insights.data,patterns.data,power.data,reviewed.data].some(result=>(result??[]).length>LIMIT);
   if(incomplete)throw new Error('Evidence or review history exceeds current 1000-row limit. Unable to safely rank the full roster.');
   const observations=(insights.data??[]) as DurationObservation[];
   const repeating=(patterns.data??[]) as DurationPattern[];
   const validatedPower=(power.data??[]) as ValidatedBikeRow[];
   const reviewedKeys=new Set(((reviewed.data??[]) as Seen[]).map(x=>x.item_key));
   const athleteById=new Map(((profiles.data??[]) as Profile[]).map(p=>[p.id,p]));
   // Missing or inaccessible athlete profiles are not silently dropped.
   if(ids.some(id=>!athleteById.has(id)))throw new Error('One or more assigned athlete profiles could not be read.');
   const decisions=ids.map(id=>{
     const base=assessAdaptiveDecision(id,observations,repeating);
     const powerEvidence=assessBikeEvidence(id,validatedPower);
     const powerContext=powerEvidence.count
       ? [`Validated Intervals.icu bike: ${powerEvidence.count} ride(s) in 21 days`,
          `Latest approved cycling stress ${powerEvidence.latest_stress}, IF ${powerEvidence.latest_intensity_factor?.toFixed(2)}, FTP snapshot ${powerEvidence.ftp_at_validation} W`,
          'Separate activity evidence: not proof that any particular planned session was completed as prescribed.',
          ...powerEvidence.notes]
       : ['No recent validated cycling power evidence available'];
     const spike=powerEvidence.load_spike_review;
     const decision:Decision=spike
       ? {...base,action:'coach_review',priority:'high',confidence:'moderate',
          rationale:base.action==='coach_review' ? base.rationale+' A separate validated cycling load spike also needs context.'
            : 'Recent validated cycling training stress is substantially higher than the preceding two rides.',
          evidence:[...base.evidence,...powerContext,`Previous rides median stress ${powerEvidence.prior_median_stress}`],
          suggested_next_step:'Review why the validated cycling load rose and assess athlete context before any plan adjustment.',
          coach_approval_required:true}
       : {...base,evidence:[...base.evidence,...powerContext]};
     const key=keyFor(decision,observations,repeating,powerEvidence.latest_activity_id);
     return {athlete:athleteById.get(id)!,decision,key,reviewed:reviewedKeys.has(key)};
   });
   const weight=(r:CoachRow)=>r.decision.priority==='high'?0:r.decision.priority==='review'?1:r.decision.action==='insufficient_data'?2:3;
   decisions.sort((a,b)=>weight(a)-weight(b)||(a.athlete.display_name||'Assigned athlete').localeCompare(b.athlete.display_name||'Assigned athlete'));
   if(active){setRows(decisions);setCoachId(user.id);setTruncated(false)}
  }catch(e){if(active){setRows([]);setError(e instanceof Error?e.message:'Unable to assess assigned athletes')}}
  finally{if(active)setLoading(false)}
 })();return()=>{active=false}},[reload]);
 const pending=useMemo(()=>rows.filter(r=>r.decision.action==='coach_review'&&!r.reviewed),[rows]);
 const high=pending.filter(r=>r.decision.priority==='high').length;
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
 const humanIssue=(row:CoachRow)=>{
  const d=row.decision;
  if(d.rationale.includes('substantial duration discrepancy'))return 'Workout shorter or longer than planned';
  if(d.rationale.includes('Multiple distinct sessions'))return 'Repeated workout deviations';
  if(d.rationale.includes('training stress'))return 'Unusual cycling training load';
  if(d.action==='insufficient_data')return 'Not enough training history yet';
  if(d.action==='monitor')return 'No duration issues detected';
  return 'Training needs a closer look';
 };
 const shortReason=(row:CoachRow)=>{
  const percentage=row.decision.evidence.find(x=>x.startsWith('Duration difference'));
  if(percentage)return percentage.replace('Duration difference','Difference from plan:');
  if(row.decision.rationale.includes('Multiple distinct sessions'))return 'Several recent workouts differ from the plan';
  return row.decision.rationale;
 };
 return <section className="coach-attention-v2" aria-label="AZUR coach action centre" style={{padding:'16px',minWidth:0}}>
  <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:12}}>
   <div style={{minWidth:0}}><h3 style={{fontSize:20,margin:0,color:'#f3f9ff'}}>Needs your review</h3>
    <p style={{fontSize:12,color:'#97b4c9',margin:'4px 0 0'}}>Only the decisions that need your attention</p></div>
   <button type="button" onClick={()=>setReload(x=>x+1)} disabled={loading}
    style={{flexShrink:0,minHeight:42,padding:'8px 12px',borderRadius:10,border:'1px solid #366989',background:'#153a56',color:'#deefff'}}>Refresh</button>
  </header>
  <div style={{display:'flex',gap:8,alignItems:'baseline',flexWrap:'wrap',marginBottom:13}}>
   <strong style={{fontSize:26,color:'#fff'}}>{loading?'…':pending.length}</strong>
   <span style={{fontSize:13,color:'#b3cadd'}}>to review</span>
   {!loading&&high>0&&<span style={{fontSize:12,fontWeight:700,color:'#ffd08c',padding:'4px 8px',background:'rgba(211,137,34,.12)',borderRadius:20}}>{high} priority</span>}
  </div>
  {error&&<p role="alert">{error}</p>}
  {truncated&&<p role="alert">The full roster could not be assessed. Do not rely on this queue.</p>}
  {!loading&&!error&&pending.length===0&&<p style={{color:'#abc5d6',fontSize:14}}>No coaching decisions waiting. This is not a recovery assessment.</p>}
  {!loading&&!error&&pending.map(row=><article key={row.athlete.id} style={{
   background:'#15364f',border:'1px solid #315b76',borderRadius:14,
   padding:'14px',marginBottom:10,minWidth:0}}>
    <div style={{display:'flex',alignItems:'center',gap:9,justifyContent:'space-between'}}>
     <strong style={{fontSize:15,color:'#f4faff',minWidth:0,overflowWrap:'anywhere'}}>{row.athlete.display_name||'Assigned athlete'}</strong>
     <span style={{fontSize:11,fontWeight:700,whiteSpace:'nowrap',color:row.decision.priority==='high'?'#ffd08c':'#b9ddfa'}}>{row.decision.priority==='high'?'PRIORITY':'REVIEW'}</span>
    </div>
    <p style={{fontSize:15,fontWeight:700,color:'#fff',lineHeight:1.35,margin:'12px 0 5px'}}>{humanIssue(row)}</p>
    <p style={{fontSize:13,color:'#b5cede',margin:'0 0 10px'}}>{shortReason(row)}</p>
    <p style={{fontSize:13,lineHeight:1.45,margin:'0 0 10px',color:'#e4f2ff'}}><strong>Next step:</strong> {row.decision.rationale.includes('substantial duration discrepancy')?'Ask why the workout differed from the plan before changing training.':row.decision.suggested_next_step}</p>
    <details style={{marginBottom:12,padding:'8px 0',borderTop:'1px solid #315773'}}>
     <summary style={{cursor:'pointer',fontSize:13,color:'#8ad2ff',minHeight:28}}>Why AZUR flagged this</summary>
     <div style={{padding:'9px 0',fontSize:12,color:'#b6cad9',lineHeight:1.6}}>
      <p>{row.decision.rationale}</p>
      <ul style={{margin:'8px 0',paddingLeft:19}}>{row.decision.evidence.map((e,i)=><li key={i}>{e}</li>)}</ul>
      <p>Evidence confidence: {row.decision.confidence}. {row.decision.coach_approval_required?'Significant changes require your approval.':'No training change proposed.'}</p>
      <p>AZUR has not inferred fatigue or confirmed interval execution from this evidence.</p>
     </div>
    </details>
    <button type="button" onClick={()=>void acknowledge(row)} disabled={Boolean(busy)}
     style={{width:'100%',minHeight:44,borderRadius:10,border:'1px solid #48b5eb',background:'#1174ab',color:'#fff',fontWeight:700}}>
     {busy===row.key?'Saving…':'Mark reviewed'}</button>
   </article>)}
  <details style={{marginTop:12}}>
   <summary style={{cursor:'pointer',fontSize:13,color:'#a9c8dc',padding:'8px 2px',minHeight:36}}>All athletes and reviewed decisions ({rows.length})</summary>
   <div style={{marginTop:8}}>
    {rows.map(row=><div key={row.key} style={{padding:'11px 0',borderBottom:'1px solid #294b64'}}>
      <strong style={{fontSize:13,color:'#e3f3ff'}}>{row.athlete.display_name||'Assigned athlete'}</strong>
      <p style={{fontSize:12,color:'#adc4d4',margin:'4px 0'}}>{humanIssue(row)} · {row.reviewed?'Reviewed':row.decision.action==='coach_review'?'Needs review':row.decision.action==='insufficient_data'?'Need more data':'Monitoring'}</p>
    </div>)}
   </div>
  </details>
 </section>;
}
