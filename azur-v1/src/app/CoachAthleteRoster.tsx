import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { allBikeWorkouts } from '../domain/bikeWorkoutCatalog';
import { resolveCurrentBikeApprovals } from '../lib/calculations/coachApprovalResolver';
import { auditAthleteInstructions, classifyPrescriptionException } from '../lib/calculations/prescriptionAudit';

export type AssignedAthlete = {
 id: string; display_name: string | null; ftp_w: number | null;
 run_threshold_sec_per_km: number | null; swim_threshold_sec_per_100m: number | null;
 normal_weekly_hours: number | null; user_id?:string|null;
};

export default function CoachAthleteRoster({ onSelect, selectedAthleteId }: { onSelect: (athlete: AssignedAthlete | null) => void; selectedAthleteId?: string | null }) {
 const [athletes,setAthletes]=useState<AssignedAthlete[]>([]);
 const [selectedId,setSelectedId]=useState('');
 const [onboarding,setOnboarding]=useState<Record<string,{race_distance:string;weekly_hours:number;device:string}>>({});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [prescriptionReviews,setPrescriptionReviews]=useState<Array<{id:string;title:string;sport:string;planned_date:string;gaps:string[];decision:'routine'|'review'|'blocked';reasons:string[]}>>([]);
 const [reviewError,setReviewError]=useState('');
 const [reviewLoading,setReviewLoading]=useState(false);
 useEffect(()=>{let cancelled=false;setPrescriptionReviews([]);setReviewError('');if(!selectedAthleteId)return;
  setReviewLoading(true);void (async()=>{try{const {data:{user}}=await supabase.auth.getUser();if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach access required');
  const {data:assignment,error:assignmentError}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id).eq('athlete_id',selectedAthleteId).limit(1);
  if(assignmentError||!assignment?.length)throw new Error('No current coach assignment');
  const {data,error}=await supabase.from('planned_session').select('id,title,sport,planned_date,prescription').eq('athlete_id',selectedAthleteId).eq('is_active_version',true).gte('planned_date',new Date().toISOString().slice(0,10)).order('planned_date',{ascending:true}).limit(40);
  if(error)throw error;
  const {data:profiles,error:profileError}=await supabase.from('athlete_profile')
    .select('id,ftp_w,run_threshold_sec_per_km,swim_threshold_sec_per_100m')
    .eq('id',selectedAthleteId).limit(1);
  if(profileError || !profiles?.length)throw new Error('Assigned athlete benchmarks unavailable');
  const profile=profiles[0];
  const {data:approvals,error:approvalError}=await supabase.from('coach_workout_approval_event')
    .select('id,workout_id,workout_version,decision,level,phases,decided_at')
    .order('decided_at',{ascending:false}).limit(500);
  if(approvalError)throw approvalError;
  const approvedBikeIds=new Set(resolveCurrentBikeApprovals(approvals??[]).map(w=>w.id));
  const approvedBikeVersions=new Map(allBikeWorkouts.filter(w=>approvedBikeIds.has(w.id)).map(w=>[w.id,w.version]));
  if(!cancelled)setPrescriptionReviews((data??[]).map(item=>({id:item.id,title:item.title,sport:item.sport,planned_date:item.planned_date,gaps:(()=>{const audit=auditAthleteInstructions(item.prescription);return audit.blockCount===0?['Structured prescription missing']:audit.gaps.map(g=>`${g.section} block ${g.block}: ${g.missing.replaceAll('_',' ')}`)})(),...(()=>{const decision=classifyPrescriptionException({sport:item.sport,prescription:item.prescription,templateApproved:item.sport==='bike' && typeof item.prescription?.workoutId==='string' && approvedBikeIds.has(item.prescription.workoutId) && approvedBikeVersions.get(item.prescription.workoutId)===item.prescription?.workoutVersion && item.prescription?.coachApproved===true,hasValidBenchmark:item.sport==='bike' ? typeof profile.ftp_w==='number' && profile.ftp_w>0 : item.sport==='run' ? typeof profile.run_threshold_sec_per_km==='number' && profile.run_threshold_sec_per_km>0 : item.sport==='swim' ? typeof profile.swim_threshold_sec_per_100m==='number' && profile.swim_threshold_sec_per_100m>0 : false});return {decision:decision.status,reasons:decision.reasons}})()})).filter(item=>item.gaps.length));
  }catch(e){if(!cancelled)setReviewError(e instanceof Error?e.message:'Could not audit assigned sessions');}finally{if(!cancelled)setReviewLoading(false);}})();return()=>{cancelled=true};
 },[selectedAthleteId]);
 useEffect(()=>{
  let cancelled=false;
  const load=async()=>{
   try {
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError || !user || user.app_metadata?.role!=='coach') throw new Error('Verified coach access required');
    const {data:assignments,error:assignmentError}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
    if(assignmentError) throw assignmentError;
    const ids=(assignments??[]).map(a=>a.athlete_id);
    if(!ids.length){if(!cancelled)setAthletes([]);return;}
    const {data,error:profilesError}=await supabase.from('athlete_profile')
      .select('id,user_id,display_name,ftp_w,run_threshold_sec_per_km,swim_threshold_sec_per_100m,normal_weekly_hours')
      .in('id',ids);
    if(profilesError) throw profilesError;
    const idsForSetup=(data??[]).map(a=>a.user_id).filter((v):v is string=>typeof v==='string');
    if(idsForSetup.length){const {data:setupRows}=await supabase.from('athlete_onboarding').select('user_id,race_distance,weekly_hours,device').in('user_id',idsForSetup);
     if(!cancelled)setOnboarding(Object.fromEntries((setupRows??[]).map(row=>[row.user_id,row])));}
    if(!cancelled)setAthletes((data??[]).sort((a,b)=>(a.display_name??'').localeCompare(b.display_name??'')));
   } catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Unable to load assigned athletes');}
   finally{if(!cancelled)setLoading(false);}
  }; void load();return()=>{cancelled=true;};
 },[]);
 const selected=athletes.find(a=>a.id===(selectedAthleteId ?? selectedId));
 return <section className="azur-roster-v3" aria-label="Assigned athletes">
  <div className="azur-roster-head"><div><span className="azur-coach-eyebrow">YOUR SQUAD</span><h3>Assigned athletes</h3><p>Verified coach assignments · select an athlete to review</p></div><strong className="azur-roster-total">{loading?'—':athletes.length} <small>athletes</small></strong></div>
  {loading&&<p className="azur-roster-state">Loading assigned athletes…</p>}
  {error&&<p role="alert" className="azur-roster-state">{error}</p>}
  {!loading&&!error&&athletes.length===0&&<p className="azur-roster-state">No athletes assigned yet. Use Invitations to invite your first athlete.</p>}
  {athletes.length>0&&<>
   <div className="azur-roster-grid">{athletes.map(a=>{
    const complete=[a.ftp_w,a.run_threshold_sec_per_km,a.swim_threshold_sec_per_100m].filter(v=>typeof v==='number'&&v>0).length;
    const active=(selectedAthleteId??selectedId)===a.id;
    const setup=a.user_id?onboarding[a.user_id]:null;
    return <button type="button" key={a.id} aria-pressed={active} className={'azur-athlete-tile'+(active?' is-selected':'')} onClick={()=>{setSelectedId(a.id);onSelect(a)}}>
      <span className="azur-athlete-avatar" aria-hidden="true">{(a.display_name||'A').trim().slice(0,1).toUpperCase()}</span>
      <span className="azur-athlete-info"><strong>{a.display_name||'Unnamed athlete'}</strong><small>{setup?`${setup.race_distance.toUpperCase()} · ${setup.weekly_hours} h/week`:(complete===3?'Benchmarks recorded':'Baseline tests pending')}</small></span>
      <span className={'azur-athlete-chip'+(complete===3?' is-ready':'')}>{complete}/3 tests</span>
      <span className="azur-athlete-chevron" aria-hidden="true">›</span>
    </button>
   })}</div>
   {selected&&<div className="azur-athlete-summary">
    <div className="azur-athlete-summary-title"><div><span className="azur-coach-eyebrow">ATHLETE SNAPSHOT</span><h4>{selected.display_name||'Athlete profile'}</h4></div><span className="azur-summary-note">Read-only</span></div>
    {selected.user_id&&onboarding[selected.user_id]&&<div className="azur-athlete-goal"><span>GOAL <strong>{onboarding[selected.user_id].race_distance.toUpperCase()}</strong></span><span>AVAILABLE <strong>{onboarding[selected.user_id].weekly_hours} h/week</strong></span><span>DEVICE <strong>{onboarding[selected.user_id].device==='none'?'Manual':onboarding[selected.user_id].device.toUpperCase()}</strong></span></div>}
    <div className="azur-benchmark-heading"><strong>Benchmark readiness</strong><span>{[selected.ftp_w,selected.run_threshold_sec_per_km,selected.swim_threshold_sec_per_100m].filter(v=>typeof v==='number'&&v>0).length}/3 complete</span></div>
    <div className="azur-benchmark-track"><span style={{width:String([selected.ftp_w,selected.run_threshold_sec_per_km,selected.swim_threshold_sec_per_100m].filter(v=>typeof v==='number'&&v>0).length/3*100)+'%'}}/></div>
    <details className="azur-athlete-metric-details"><summary>Detailed benchmarks</summary>
    <div className="azur-athlete-metrics">
      <div><small>BIKE FTP</small><strong>{selected.ftp_w ? `${selected.ftp_w} W`:'Not set'}</strong></div>
      <div><small>RUN THRESHOLD</small><strong>{selected.run_threshold_sec_per_km ? `${selected.run_threshold_sec_per_km} s/km`:'Not set'}</strong></div>
      <div><small>SWIM CSS</small><strong>{selected.swim_threshold_sec_per_100m ? `${selected.swim_threshold_sec_per_100m} s/100m`:'Not set'}</strong></div>
      <div><small>WEEKLY BASELINE</small><strong>{selected.normal_weekly_hours==null?'Not set':`${selected.normal_weekly_hours} h`}</strong></div>
    </div>
    </details>
    {(!selected.ftp_w||!selected.run_threshold_sec_per_km||!selected.swim_threshold_sec_per_100m)&&<p className="azur-athlete-next-step">Baseline assessments are still needed before the app can use personalised intensity targets. Missing values are not estimated.</p>}
    <details className="azur-athlete-review-details"><summary>Upcoming prescription exceptions {prescriptionReviews.length>0?`(${prescriptionReviews.length})`:''}</summary>
     <p>Read-only review of up to 40 upcoming sessions. No automatic plan edits or Garmin exports.</p>
     {reviewLoading&&<p>Checking sessions…</p>}{reviewError&&<p role="alert">{reviewError}</p>}
     {!reviewLoading&&!reviewError&&prescriptionReviews.length===0&&<p>No prescription exceptions identified in the records reviewed.</p>}
     {prescriptionReviews.length>0&&<ul>{prescriptionReviews.map(item=><li key={item.id}><strong>{item.planned_date} · {item.title} · {item.decision}</strong><small>{[...item.gaps,...item.reasons].filter((v,i,a)=>a.indexOf(v)===i).slice(0,3).join(' · ')}</small></li>)}</ul>}
    </details>
   </div>}
  </>}
 </section>;
}
