import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { coachAttentionSignals } from '../lib/calculations/coachAttention';
import type { CoachAttention } from '../lib/calculations/coachAttention';
import type { AssignedAthlete } from './CoachAthleteRoster';

type InboxItem={athlete:AssignedAthlete;signal:CoachAttention};
type PendingReview={id:string;athlete_id:string;current_priority:string;suggested_priority:string;rationale:string;created_at:string};
const dateKey=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
export default function CoachAttentionInbox({onSelect}:{onSelect:(athlete:AssignedAthlete)=>void}){
 const [items,setItems]=useState<InboxItem[]>([]);
 const [assignedProfiles,setAssignedProfiles]=useState<AssignedAthlete[]>([]);
 const [reviews,setReviews]=useState<PendingReview[]>([]);
 const [filter,setFilter]=useState<'all'|'review'|'info'>('all');
 const [refreshKey,setRefreshKey]=useState(0);
 const [athleteCount,setAthleteCount]=useState(0);
 const [baselinePending,setBaselinePending]=useState<AssignedAthlete[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let cancelled=false;
  async function load(){
   try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach login required');
    const {data:assignments,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
    if(ae)throw ae;
    const ids=[...new Set((assignments??[]).map(x=>x.athlete_id))];
    if(!ids.length){if(!cancelled){setAthleteCount(0);setItems([]);setAssignedProfiles([]);setReviews([]);setBaselinePending([]);}return;}
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-27);
    const today=dateKey(new Date());
    const [profiles,plans,completed,pending]=await Promise.all([
      supabase.from('athlete_profile').select('id,display_name,ftp_w,run_threshold_sec_per_km,swim_threshold_sec_per_100m,normal_weekly_hours').in('id',ids),
      supabase.from('planned_session').select('athlete_id,id,planned_date,priority,session_class,status').in('athlete_id',ids).eq('is_active_version',true).gte('planned_date',dateKey(cutoff)).lt('planned_date',today),
      supabase.from('completed_activity').select('athlete_id,planned_session_id,start_time').in('athlete_id',ids).gte('start_time',cutoff.toISOString()),
      supabase.from('training_priority_review').select('id,athlete_id,current_priority,suggested_priority,rationale,created_at').in('athlete_id',ids).eq('status','pending').order('created_at',{ascending:false}).limit(100)
    ]);
    if(profiles.error||plans.error||completed.error||pending.error)throw new Error(profiles.error?.message||plans.error?.message||completed.error?.message||pending.error?.message);
    const next:InboxItem[]=[];
    for(const athlete of profiles.data??[]){
      const athletePlans=(plans.data??[]).filter(p=>p.athlete_id===athlete.id);
      const athleteActivities=(completed.data??[]).filter(a=>a.athlete_id===athlete.id);
      for(const signal of coachAttentionSignals(athletePlans,athleteActivities,today))next.push({athlete,signal});
    }
    next.sort((a,b)=>(a.signal.severity==='review'?0:1)-(b.signal.severity==='review'?0:1)||
      (a.athlete.display_name??'').localeCompare(b.athlete.display_name??''));
    if(!cancelled){setAthleteCount(ids.length);setItems(next);setAssignedProfiles(profiles.data??[]);setReviews(pending.data??[]);setBaselinePending((profiles.data??[]).filter(a=>![a.ftp_w,a.run_threshold_sec_per_km,a.swim_threshold_sec_per_100m].every(v=>typeof v==='number'&&v>0)));}
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Unable to load attention inbox');}
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[refreshKey]);
 const reviewItems=items.filter(x=>x.signal.severity==='review');
 const infoItems=items.filter(x=>x.signal.severity==='info');
 const filtered=items.filter(x=>filter==='all'||x.signal.severity===filter);
 const athleteFor=(id:string)=>assignedProfiles.find(x=>x.id===id);
 return <section className="coach-attention-v2">
  <header className="coach-attention-heading"><div><span className="coach-attention-eyebrow">AZUR / COACH WORKSPACE</span><h3>Attention Centre</h3><p>Training signals and pending decisions from assigned athletes</p></div>
    <button type="button" onClick={()=>setRefreshKey(x=>x+1)} disabled={loading}>↻ Refresh</button>
  </header>
  {loading&&<p>Checking assigned athlete records…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&<>
    <div className="coach-attention-stats"><div><small>Assigned athletes</small><strong>{athleteCount}</strong></div><div><small>Approval queue</small><strong>{reviews.length}</strong></div><div><small>Training review</small><strong>{reviewItems.length}</strong></div><div><small>Benchmarks pending</small><strong>{baselinePending.length}</strong></div></div>
    {baselinePending.length>0&&<div className="coach-attention-group azur-monitor-actions">
      <div className="coach-attention-group-head"><h4>Athlete setup priorities</h4><span>{baselinePending.length} athletes</span></div>
      {baselinePending.map(a=><article key={a.id} className="coach-attention-row"><div><span className="coach-attention-tag info">Baseline needed</span><strong>{a.display_name||'Unnamed athlete'}</strong><p>{[!a.ftp_w?'FTP':null,!a.run_threshold_sec_per_km?'Run threshold':null,!a.swim_threshold_sec_per_100m?'Swim CSS':null].filter(Boolean).join(' · ')} not yet recorded. Assess before using discipline-specific intensity targets.</p></div><button type="button" onClick={()=>onSelect(a)}>Review athlete</button></article>)}
      <small>Missing benchmarks are onboarding tasks, not evidence of a training or recovery problem.</small>
    </div>}
    <div className="coach-attention-group">
      <div className="coach-attention-group-head"><h4>Decisions awaiting coach review</h4><span>{reviews.length} pending</span></div>
      {reviews.length===0?<p>No pending priority changes for assigned athletes.</p>:reviews.map(review=><article key={review.id} className="coach-attention-row">
        <div><span className="coach-attention-tag review">Approval required</span><strong>{review.current_priority} → {review.suggested_priority}</strong>
        <small>{new Date(review.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</small><p>{review.rationale}</p></div>
        {athleteFor(review.athlete_id)?<button type="button" onClick={()=>onSelect(athleteFor(review.athlete_id)!)}>View athlete</button>:<small>Assigned athlete · {review.athlete_id.slice(0,8)}</small>}
      </article>)}
      <small>Pending requests are read-only here. No approvals or training-plan changes are applied automatically.</small>
    </div>
    <div className="coach-attention-group">
      <div className="coach-attention-group-head"><h4>Training monitoring</h4><div className="coach-attention-filters" role="group" aria-label="Filter attention signals">{(['all','review','info'] as const).map(kind=><button type="button" key={kind} aria-pressed={filter===kind} onClick={()=>setFilter(kind)}>{kind==='all'?'All':kind==='review'?'Review':'Information'}</button>)}</div></div>
      {filtered.length===0?<p>No {filter==='all'?'training signals':'matching signals'} in the evaluated records. There is insufficient evidence to claim training or recovery is on track.</p>:filtered.map((item,index)=><article className="coach-attention-row" key={item.athlete.id+item.signal.code+index}><div><span className={`coach-attention-tag ${item.signal.severity}`}>{item.signal.severity==='review'?'Check required':'For awareness'}</span><strong>{item.athlete.display_name||'Unnamed athlete'}</strong><p>{item.signal.description}</p></div><button type="button" onClick={()=>onSelect(item.athlete)}>View athlete</button></article>)}
    </div>
  </>}
  <small className="coach-attention-disclaimer">Monitoring signals are advisory. Missing device matches, incomplete data or changes in athlete circumstances need human review. No automatic schedule edits.</small>
 </section>;
}
