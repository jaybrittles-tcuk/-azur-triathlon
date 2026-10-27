import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type AssignedAthlete = {
 id: string; display_name: string | null; ftp_w: number | null;
 run_threshold_sec_per_km: number | null; swim_threshold_sec_per_100m: number | null;
 normal_weekly_hours: number | null;
};

export default function CoachAthleteRoster() {
 const [athletes,setAthletes]=useState<AssignedAthlete[]>([]);
 const [selectedId,setSelectedId]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
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
 const selected=athletes.find(a=>a.id===selectedId);
 return <section className="panel coach-cycling-review">
  <header><h3>Assigned Athletes</h3><p>Read-only training profile overview · coach assignments only</p></header>
  {loading&&<p>Loading assigned athletes…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&athletes.length===0&&<p>No athletes are assigned to this coach yet.</p>}
  {athletes.length>0&&<div className="coach-cycling-columns">
   <div className="coach-cycling-list">{athletes.map(a=><button type="button" key={a.id} className={selectedId===a.id?'is-selected':''} onClick={()=>setSelectedId(a.id)}>
    <strong>{a.display_name||'Unnamed athlete'}</strong><small>{a.ftp_w ? `FTP: ${a.ftp_w} W`:'FTP not recorded'}</small>
   </button>)}</div>
   <div className="coach-cycling-detail">{selected ? <>
    <h4>{selected.display_name||'Athlete profile'}</h4>
    <p>Bike FTP: {selected.ftp_w ? `${selected.ftp_w} W`:'Not recorded'}</p>
    <p>Run threshold: {selected.run_threshold_sec_per_km ? `${selected.run_threshold_sec_per_km} sec/km`:'Not recorded'}</p>
    <p>Swim threshold: {selected.swim_threshold_sec_per_100m ? `${selected.swim_threshold_sec_per_100m} sec/100m`:'Not recorded'}</p>
    <p>Normal weekly training: {selected.normal_weekly_hours == null ? 'Not recorded' : `${selected.normal_weekly_hours} hours`}</p>
    <small>View only. Athlete-specific session assignment and calendar writes remain disabled.</small>
   </> : <p>Select an athlete to review their benchmark profile.</p>}</div>
  </div>}
 </section>;
}
