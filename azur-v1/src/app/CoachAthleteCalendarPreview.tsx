import WorkoutPrescriptionView from './WorkoutPrescriptionView';
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
 return <section className="coach-attention-v2" aria-label="Assigned athlete calendar preview" style={{paddingBottom:12,maxWidth:"100%",minWidth:0,overflowWrap:"anywhere"}}>
 <header className="coach-attention-heading"><div><h3>Assigned athlete calendar preview</h3><p>Read-only preview of the published athlete calendar. Your personal calendar remains unchanged.</p></div><button type="button" onClick={()=>setReload(x=>x+1)} disabled={loading}>Refresh</button></header>
 <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",minWidth:0,maxWidth:"100%"}}>
 <label style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8,minWidth:0,maxWidth:"100%"}}>Athlete <select style={{maxWidth:"100%",minWidth:0,width:"min(100%, 310px)"}} value={athleteId} onChange={e=>setAthleteId(e.target.value)}>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name||'Assigned athlete'}</option>)}</select></label>
 <nav aria-label="Calendar week navigation" style={{display:"grid",gridTemplateColumns:"auto minmax(0,1fr) auto",gap:8,alignItems:"center",width:"100%",maxWidth:"100%",minWidth:0}}>
 <button type="button" style={{minHeight:44,minWidth:72,padding:"9px 12px",borderRadius:11,background:"#153a59",border:"1px solid #34709b",color:"#e5f5ff",fontWeight:650,flex:"none",width:"auto"}} onClick={()=>setWeek(x=>addDays(x,-7))}>‹ Prev</button>
 <strong style={{fontSize:13,whiteSpace:"normal",textAlign:"center",minWidth:0,overflowWrap:"anywhere",lineHeight:1.35}}>{new Date(week+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})} – {new Date(addDays(week,6)+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</strong>
 <button type="button" style={{minHeight:44,minWidth:72,padding:"9px 12px",borderRadius:11,background:"#117cdc",border:"1px solid #3397e6",color:"#fff",fontWeight:650,flex:"none",width:"auto"}} onClick={()=>setWeek(x=>addDays(x,7))}>Next ›</button>
 </nav>
 </div>
 {error&&<p role="alert">Calendar preview unavailable: {error}. This preview needs assigned-coach read permission; it cannot change athlete sessions.</p>}
 <p aria-live="polite">{loading?'Loading published sessions…':error?'Unable to verify session count':`${sessions.length} published sessions · ${minutes} minutes`}</p>
 {!error&&Array.from({length:7},(_,i)=>{const date=addDays(week,i);const items=sessions.filter(s=>s.planned_date===date);return <article className="coach-attention-row" key={date} style={{minWidth:0,maxWidth:"100%",padding:items.length?16:12,marginBottom:items.length?10:5}}><div style={{minWidth:0,width:"100%"}}><strong>{new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}</strong>{!items.length?<p>Rest / no published sessions</p>:items.map(s=><details key={s.id} style={{marginTop:10,maxWidth:"100%"}}><summary style={{cursor:"pointer",overflowWrap:"anywhere",lineHeight:1.5,listStyle:"none",display:"flex",alignItems:"flex-start",gap:9,minHeight:44,padding:"8px 0"}}><span aria-hidden="true" style={{color:"#75c5ff",fontWeight:700,flexShrink:0}}>▸</span><span style={{minWidth:0,flex:1}}><strong style={{display:"block",color:"#eff9ff",fontSize:14}}>{s.title}</strong><span style={{display:"block",fontSize:13,color:"#a7c3d4",marginTop:3}}>{s.sport.toUpperCase()} · {s.duration_min} min · {s.status}</span></span></summary><div style={{padding:"8px 0 4px"}}><WorkoutPrescriptionView prescription={s.prescription}/></div></details>)}</div></article>})}
 </section>
}
