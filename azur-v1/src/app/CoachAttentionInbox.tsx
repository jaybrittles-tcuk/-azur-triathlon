import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { coachAttentionSignals } from '../lib/calculations/coachAttention';
import type { CoachAttention } from '../lib/calculations/coachAttention';
import type { AssignedAthlete } from './CoachAthleteRoster';

type InboxItem={athlete:AssignedAthlete;signal:CoachAttention};
type ReviewItem={key:string;athlete:AssignedAthlete;title:string;reason:string;date:string;note?:string};
type PendingReview={id:string;athlete_id:string;current_priority:string;suggested_priority:string;rationale:string;created_at:string};
const dateKey=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
export default function CoachAttentionInbox({onSelect}:{onSelect:(athlete:AssignedAthlete)=>void}){
 const [items,setItems]=useState<InboxItem[]>([]);
 const [reviews,setReviews]=useState<PendingReview[]>([]);
 const [queue,setQueue]=useState<ReviewItem[]>([]);
 const [reviewed,setReviewed]=useState<Set<string>>(new Set());
 const [coachId,setCoachId]=useState('');
 const [saving,setSaving]=useState('');
 const [saveError,setSaveError]=useState('');
 const [refreshKey,setRefreshKey]=useState(0);
 const [athleteCount,setAthleteCount]=useState(0);
 const [baselinePending,setBaselinePending]=useState<AssignedAthlete[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let cancelled=false;
  async function load(){
   setLoading(true);setError('');setSaveError('');
   try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach login required');
    const {data:assignments,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
    if(ae)throw ae;
    const ids=[...new Set((assignments??[]).map(x=>x.athlete_id))];
    if(!ids.length){if(!cancelled){setAthleteCount(0);setItems([]);setQueue([]);setReviewed(new Set());setReviews([]);setBaselinePending([]);}return;}
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-27);
    const today=dateKey(new Date());
    const [profiles,plans,completed,pending,feedback]=await Promise.all([
      supabase.from('athlete_profile').select('id,display_name,ftp_w,run_threshold_sec_per_km,swim_threshold_sec_per_100m,normal_weekly_hours').in('id',ids),
      supabase.from('planned_session').select('athlete_id,id,title,planned_date,updated_at,duration_min,priority,session_class,status').in('athlete_id',ids).eq('is_active_version',true).gte('planned_date',dateKey(cutoff)).lte('planned_date',today),
      supabase.from('completed_activity').select('athlete_id,planned_session_id,start_time,duration_sec').in('athlete_id',ids).gte('start_time',cutoff.toISOString()),
      supabase.from('training_priority_review').select('id,athlete_id,current_priority,suggested_priority,rationale,created_at').in('athlete_id',ids).eq('status','pending').order('created_at',{ascending:false}).limit(100),
      supabase.from('session_feedback').select('athlete_id,planned_session_id,session_rpe,notes,updated_at').in('athlete_id',ids).gte('updated_at',cutoff.toISOString()).order('updated_at',{ascending:false})
    ]);
    if(profiles.error||plans.error||completed.error||pending.error||feedback.error)throw new Error(profiles.error?.message||plans.error?.message||completed.error?.message||pending.error?.message||feedback.error?.message);
    const next:InboxItem[]=[];
    for(const athlete of profiles.data??[]){
      const athletePlans=(plans.data??[]).filter(p=>p.athlete_id===athlete.id);
      const athleteActivities=(completed.data??[]).filter(a=>a.athlete_id===athlete.id);
      for(const signal of coachAttentionSignals(athletePlans,athleteActivities,today))next.push({athlete,signal});
    }
    next.sort((a,b)=>(a.signal.severity==='review'?0:1)-(b.signal.severity==='review'?0:1)||
      (a.athlete.display_name??'').localeCompare(b.athlete.display_name??''));
    const profilesById=new Map((profiles.data??[]).map(profile=>[profile.id,profile]));
    const sessionsById=new Map((plans.data??[]).map(plan=>[plan.id,plan]));
    const linked=new Map((completed.data??[]).map(activity=>[activity.planned_session_id,activity]));
    const actionable:ReviewItem[]=[];
    for(const row of feedback.data??[]){
      const athlete=profilesById.get(row.athlete_id);
      if(!athlete||!row.notes?.trim())continue;
      const plan=sessionsById.get(row.planned_session_id);
      const actual=linked.get(row.planned_session_id);
      const details=['Athlete left a note',plan&&plan.duration_min+' min planned',
        actual&&actual.duration_sec!=null&&Math.round(actual.duration_sec/60)+' min recorded',
        row.session_rpe!=null&&'RPE '+row.session_rpe+'/10'].filter(Boolean).join(' · ');
      actionable.push({key:'feedback:'+row.planned_session_id+':'+row.updated_at,athlete,
        title:plan?.title||'Workout feedback',reason:details,note:row.notes,date:row.updated_at});
    }
    for(const plan of plans.data??[]){
      const athlete=profilesById.get(plan.athlete_id);
      if(!athlete||plan.planned_date>=today||plan.priority!==1||['completed','cancelled'].includes(plan.status)||linked.has(plan.id))continue;
      actionable.push({key:'session:'+plan.id+':'+plan.updated_at,athlete,title:plan.title,date:plan.planned_date,
        reason:'Past high-priority session without a linked completion. Check activity matching or ask the athlete.'});
    }
    for(const decision of pending.data??[]){
      const athlete=profilesById.get(decision.athlete_id);
      if(athlete)actionable.push({key:'priority:'+decision.id,athlete,date:decision.created_at,
        title:decision.current_priority+' → '+decision.suggested_priority,reason:decision.rationale});
    }
    actionable.sort((a,b)=>b.date.localeCompare(a.date));
    const receipts=new Set<string>();
    // Fetch only currently visible versions. Edited notes acquire a new key.
    for(let offset=0;offset<actionable.length;offset+=100){
      const result=await supabase.from('coach_monitoring_review').select('item_key')
        .eq('coach_user_id',user.id).in('item_key',actionable.slice(offset,offset+100).map(item=>item.key));
      if(result.error)throw result.error;
      for(const receipt of result.data??[])receipts.add(receipt.item_key);
    }
    if(!cancelled){setQueue(actionable);setReviewed(receipts);setCoachId(user.id);}
    if(!cancelled){setAthleteCount(ids.length);setItems(next);setReviews(pending.data??[]);setBaselinePending((profiles.data??[]).filter(a=>![a.ftp_w,a.run_threshold_sec_per_km,a.swim_threshold_sec_per_100m].every(v=>typeof v==='number'&&v>0)));}
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Unable to load attention inbox');}
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[refreshKey]);
 const outstanding=queue.filter(item=>!reviewed.has(item.key));
 const seen=queue.filter(item=>reviewed.has(item.key));
 const infoItems=items.filter(item=>item.signal.severity==='info');
 async function markReviewed(item:ReviewItem){
   setSaveError('');setSaving(item.key);
   try{
     const {error}=await supabase.from('coach_monitoring_review').upsert({
       coach_user_id:coachId,athlete_id:item.athlete.id,item_key:item.key
     },{onConflict:'coach_user_id,athlete_id,item_key',ignoreDuplicates:true});
     if(error)throw error;
     setReviewed(previous=>new Set([...previous,item.key]));
   }catch{setSaveError('Could not save the review. Refresh and try again.');}
   finally{setSaving('');}
 }
 function reviewRow(item:ReviewItem,done:boolean){
   return <article key={item.key} className="coach-attention-row"><div>
     <strong>{item.athlete.display_name||'Assigned athlete'} · {item.title}</strong>
     <small>{item.date.slice(0,10)}</small><p>{item.reason}</p>
     {item.note&&<blockquote className="coach-feedback-notes">{item.note}</blockquote>}
     {item.key.startsWith('priority:')&&<small>Priority decision pending approval</small>}
   </div><div><button type="button" onClick={()=>onSelect(item.athlete)}>View athlete</button>
   {!done&&<button type="button" disabled={Boolean(saving)} onClick={()=>void markReviewed(item)}>{saving===item.key?'Saving…':'Mark reviewed'}</button>}</div></article>;
 }
 return <section className="coach-attention-v2">
  <header className="coach-attention-heading"><div><h3>Monitoring</h3><p>Athlete notes, unlinked key sessions and priority decisions.</p></div>
    <button type="button" onClick={()=>setRefreshKey(x=>x+1)} disabled={loading||Boolean(saving)}>↻ Refresh</button>
  </header>
  {loading&&<p>Checking assigned athlete records…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&<>
    <div className="coach-attention-stats"><div><small>Assigned athletes</small><strong>{athleteCount}</strong></div><div><small>To review</small><strong>{outstanding.length}</strong></div><div><small>Pending decisions</small><strong>{reviews.length}</strong></div><div><small>Reviewed</small><strong>{seen.length}</strong></div></div>
    <section className="coach-attention-group" aria-label="Needs your attention"><h4>Needs your attention</h4>
     {saveError&&<p role="alert">{saveError}</p>}
     {outstanding.length?outstanding.map(item=>reviewRow(item,false)):<p>You’re up to date on the records checked.</p>}
    </section>
    {seen.length>0&&<details className="coach-attention-group"><summary>Reviewed ({seen.length})</summary>{seen.map(item=>reviewRow(item,true))}</details>}
    {baselinePending.length>0&&<div className="coach-attention-group azur-monitor-actions">
      <div className="coach-attention-group-head"><h4>Baseline setup</h4><span>{baselinePending.length} athletes</span></div>
      <div className="azur-monitor-compact-list">{baselinePending.map(a=><article key={a.id} className="azur-monitor-compact-row">
        <span className="azur-monitor-compact-avatar" aria-hidden="true">{(a.display_name||'A').trim().slice(0,1).toUpperCase()}</span>
        <div><strong>{a.display_name||'Unnamed athlete'}</strong><small>{[!a.ftp_w?'Bike FTP':null,!a.run_threshold_sec_per_km?'Run threshold':null,!a.swim_threshold_sec_per_100m?'Swim CSS':null].filter(Boolean).join(' · ')}</small></div>
        <button type="button" onClick={()=>onSelect(a)}>Review <span aria-hidden="true">›</span></button>
      </article>)}</div>
      <small>Missing benchmarks indicate setup work, not poor training or recovery.</small>
    </div>}
    <details className="azur-monitor-secondary" open={false}>
      <summary>Other training signals ({infoItems.length})</summary>
      {infoItems.map(item=><article key={item.athlete.id+item.signal.code} className="coach-attention-row"><div><strong>{item.athlete.display_name}</strong><p>{item.signal.description}</p></div><button type="button" onClick={()=>onSelect(item.athlete)}>View athlete</button></article>)}
    </details>
  </>}

 </section>;
}
