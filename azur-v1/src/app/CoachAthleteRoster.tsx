import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { auditAthleteInstructions, classifyPrescriptionException } from '../lib/calculations/prescriptionAudit';

export type AssignedAthlete = {
 id: string; display_name: string | null; ftp_w: number | null;
 run_threshold_sec_per_km: number | null; swim_threshold_sec_per_100m: number | null;
 normal_weekly_hours: number | null;
};

export default function CoachAthleteRoster({ onSelect, selectedAthleteId }: { onSelect: (athlete: AssignedAthlete | null) => void; selectedAthleteId?: string | null }) {
 const [athletes,setAthletes]=useState<AssignedAthlete[]>([]);
 const [selectedId,setSelectedId]=useState('');
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
  if(!cancelled)setPrescriptionReviews((data??[]).map(item=>({id:item.id,title:item.title,sport:item.sport,planned_date:item.planned_date,gaps:(()=>{const audit=auditAthleteInstructions(item.prescription);return audit.blockCount===0?['Structured prescription missing']:audit.gaps.map(g=>`${g.section} block ${g.block}: ${g.missing.replaceAll('_',' ')}`)})(),...(()=>{const decision=classifyPrescriptionException({sport:item.sport,prescription:item.prescription,templateApproved:false,hasValidBenchmark:false});return {decision:decision.status,reasons:decision.reasons}})()})).filter(item=>item.gaps.length));
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
      .select('id,display_name,ftp_w,run_threshold_sec_per_km,swim_threshold_sec_per_100m,normal_weekly_hours')
      .in('id',ids);
    if(profilesError) throw profilesError;
    if(!cancelled)setAthletes((data??[]).sort((a,b)=>(a.display_name??'').localeCompare(b.display_name??'')));
   } catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Unable to load assigned athletes');}
   finally{if(!cancelled)setLoading(false);}
  }; void load();return()=>{cancelled=true;};
 },[]);
 const selected=athletes.find(a=>a.id===(selectedAthleteId ?? selectedId));
 return <section className="panel coach-cycling-review">
  <header><h3>Assigned Athletes</h3><p>Read-only training profile overview · coach assignments only</p></header>
  {loading&&<p>Loading assigned athletes…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&athletes.length===0&&<p>No athletes are assigned to this coach yet.</p>}
  {athletes.length>0&&<div className="coach-cycling-columns">
   <div className="coach-cycling-list">{athletes.map(a=><button type="button" key={a.id} className={(selectedAthleteId ?? selectedId)===a.id?'is-selected':''} onClick={()=>{setSelectedId(a.id);onSelect(a);}}>
    <strong>{a.display_name||'Unnamed athlete'}</strong><small>{a.ftp_w ? `FTP: ${a.ftp_w} W`:'FTP not recorded'}</small>
   </button>)}</div>
   <div className="coach-cycling-detail">{selected ? <>
    <h4>{selected.display_name||'Athlete profile'}</h4>
    <p>Bike FTP: {selected.ftp_w ? `${selected.ftp_w} W`:'Not recorded'}</p>
    <p>Run threshold: {selected.run_threshold_sec_per_km ? `${selected.run_threshold_sec_per_km} sec/km`:'Not recorded'}</p>
    <p>Swim threshold: {selected.swim_threshold_sec_per_100m ? `${selected.swim_threshold_sec_per_100m} sec/100m`:'Not recorded'}</p>
    <p>Normal weekly training: {selected.normal_weekly_hours == null ? 'Not recorded' : `${selected.normal_weekly_hours} hours`}</p>
    <small>View only. Athlete-specific session assignment and calendar writes remain disabled.</small>
    <div className="coach-prescription-audit"><strong>Coach exception review · draft only</strong><small>Up to 40 upcoming sessions. Until template approval and benchmark validity are verified, automatic eligibility remains blocked. No workouts are changed.</small>{reviewError&&<p role="alert">{reviewError}</p>}{reviewLoading&&<p>Reviewing upcoming sessions…</p>}{!reviewLoading&&!reviewError&&prescriptionReviews.length===0&&<p>No missing instructions identified in reviewed upcoming sessions.</p>}{prescriptionReviews.length>0&&<ul>{prescriptionReviews.map(item=><li key={item.id}><strong>{item.planned_date} · {item.sport} · {item.title} · {item.decision.toUpperCase()}</strong><small>{[...item.gaps,...item.reasons].filter((x,i,a)=>a.indexOf(x)===i).slice(0,4).join(' · ')}</small></li>)}</ul>}</div>
   </> : <p>Select an athlete to review their benchmark profile.</p>}</div>
  </div>}
 </section>;
}
