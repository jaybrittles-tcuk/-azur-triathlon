import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Athlete={id:string;display_name:string};
type Session={id:string;planned_date:string;sport:string;title:string;duration_min:number;status:string;prescription:unknown};
const monday=(d:Date)=>{const date=new Date(d);date.setDate(date.getDate()-((date.getDay()+6)%7));return date.toISOString().slice(0,10)};
const addDays=(day:string,n:number)=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
export default function CoachAthleteCalendarPreview(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [athleteId,setAthleteId]=useState('');
 const [week,setWeek]=useState(()=>monday(new Date()));
 const [sessions,setSessions]=useState<Session[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [reload,setReload]=useState(0);
 useEffect(()=>{let active=true;(async()=>{try{
  const {data:{user},error:ue}=await supabase.auth.getUser();
  if(ue||!user||user.app_metadata?.role!=='coach')throw new Error('Coach sign-in required');
  const {data:assign,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
  if(ae)throw ae;
  const ids=(assign??[]).map(a=>a.athlete_id);
  if(!ids.length){if(active)setAthletes([]);return}
  const {data,error:pe}=await supabase.from('athlete_profile').select('id,display_name').in('id',ids);
  if(pe)throw pe;
  if(active){setAthletes(data??[]);setAthleteId(current=>ids.includes(current)?current:ids[0])}
 }catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load athletes')}})();return()=>{active=false}},[]);
 useEffect(()=>{if(!athleteId)return;let active=true;(async()=>{setLoading(true);setError('');
  try{const {data,error}=await supabase.from('planned_session').select('id,planned_date,sport,title,duration_min,status,prescription').eq('athlete_id',athleteId).eq('is_active_version',true).gte('planned_date',week).lte('planned_date',addDays(week,6)).order('planned_date');
  if(error)throw error;if(active)setSessions(data??[]);
  }catch(e){if(active){setSessions([]);setError(e instanceof Error?e.message:'Unable to read calendar')}}finally{if(active)setLoading(false)}
 })();return()=>{active=false}},[athleteId,week,reload]);
 const minutes=sessions.reduce((sum,s)=>sum+s.duration_min,0);
 return <section className="coach-attention-v2" aria-label="Assigned athlete calendar preview">
 <header className="coach-attention-heading"><div><h3>Assigned athlete calendar preview</h3><p>Read-only preview of the published athlete calendar. Your personal calendar remains unchanged.</p></div><button type="button" onClick={()=>setReload(x=>x+1)} disabled={loading}>Refresh</button></header>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
 <label>Athlete <select value={athleteId} onChange={e=>setAthleteId(e.target.value)}>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name||'Assigned athlete'}</option>)}</select></label>
 <button type="button" onClick={()=>setWeek(x=>addDays(x,-7))}>Previous week</button>
 <strong>{week} – {addDays(week,6)}</strong>
 <button type="button" onClick={()=>setWeek(x=>addDays(x,7))}>Next week</button>
 </div>
 {error&&<p role="alert">Calendar preview unavailable: {error}. This preview needs assigned-coach read permission; it cannot change athlete sessions.</p>}
 <p>{loading?'Loading published sessions…':error?'Unable to verify session count':`${sessions.length} published sessions · ${minutes} minutes`}</p>
 {!error&&Array.from({length:7},(_,i)=>{const date=addDays(week,i);const items=sessions.filter(s=>s.planned_date===date);return <article className="coach-attention-row" key={date}><div><strong>{new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}</strong>{!items.length?<p>Rest / no published sessions</p>:items.map(s=><details key={s.id}><summary>{s.sport.toUpperCase()} · {s.title} · {s.duration_min} min · {s.status}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(s.prescription,null,2)}</pre></details>)}</div></article>})}
 </section>
}
