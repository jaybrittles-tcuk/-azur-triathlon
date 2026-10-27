import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { coachAttentionSignals } from '../lib/calculations/coachAttention';
import type { CoachAttention } from '../lib/calculations/coachAttention';
import type { AssignedAthlete } from './CoachAthleteRoster';

type InboxItem={athlete:AssignedAthlete;signal:CoachAttention};
const dateKey=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
export default function CoachAttentionInbox({onSelect}:{onSelect:(athlete:AssignedAthlete)=>void}){
 const [items,setItems]=useState<InboxItem[]>([]);
 const [athleteCount,setAthleteCount]=useState(0);
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
    if(!ids.length){if(!cancelled){setAthleteCount(0);setItems([]);}return;}
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-27);
    const today=dateKey(new Date());
    const [profiles,plans,completed]=await Promise.all([
      supabase.from('athlete_profile').select('id,display_name,ftp_w,run_threshold_sec_per_km,swim_threshold_sec_per_100m,normal_weekly_hours').in('id',ids),
      supabase.from('planned_session').select('athlete_id,id,planned_date,priority,session_class,status').in('athlete_id',ids).eq('is_active_version',true).gte('planned_date',dateKey(cutoff)).lt('planned_date',today),
      supabase.from('completed_activity').select('athlete_id,planned_session_id,start_time').in('athlete_id',ids).gte('start_time',cutoff.toISOString())
    ]);
    if(profiles.error||plans.error||completed.error)throw new Error(profiles.error?.message||plans.error?.message||completed.error?.message);
    const next:InboxItem[]=[];
    for(const athlete of profiles.data??[]){
      const athletePlans=(plans.data??[]).filter(p=>p.athlete_id===athlete.id);
      const athleteActivities=(completed.data??[]).filter(a=>a.athlete_id===athlete.id);
      for(const signal of coachAttentionSignals(athletePlans,athleteActivities,today))next.push({athlete,signal});
    }
    next.sort((a,b)=>(a.signal.severity==='review'?0:1)-(b.signal.severity==='review'?0:1)||
      (a.athlete.display_name??'').localeCompare(b.athlete.display_name??''));
    if(!cancelled){setAthleteCount(ids.length);setItems(next);}
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Unable to load attention inbox');}
   finally{if(!cancelled)setLoading(false);}
  }
  void load();return()=>{cancelled=true;};
 },[]);
 return <section className="panel coach-cycling-review">
  <header><h3>Coach Attention Inbox</h3><p>Review signals across assigned athletes · read-only</p></header>
  {loading&&<p>Checking training records…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&<><p>{athleteCount} assigned athletes · {items.filter(x=>x.signal.severity==='review').length} review signals · {items.filter(x=>x.signal.severity==='info').length} information signals</p>
   {!items.length?<p>No signals detected from available data. This does not confirm training readiness or complete device syncing.</p>:
    <div className="coach-attention-inbox">{items.map((item,index)=><div className="coach-attention-item" key={item.athlete.id+item.signal.code+index}>
      <div><strong>{item.athlete.display_name||'Unnamed athlete'}</strong> <small>{item.signal.severity==='review'?'Needs review':'Information'}</small>
        <p>{item.signal.description}</p></div>
      <button type="button" onClick={()=>onSelect(item.athlete)}>Review athlete</button>
    </div>)}</div>}
  </>}
  <small>These signals are advisory; unmatched devices or missing activity data can affect results. No plan edits or automatic changes.</small>
 </section>;
}
