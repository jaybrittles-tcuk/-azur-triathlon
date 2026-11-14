import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Review={weekStart:string;phase:string|null;storedTargetHours:number|null;approvedCapacityHours:number|null;scheduledHours:number;activityCount:number;sessionCount:number;blockers:string[];sessions:Array<{id:string;planned_date:string;sport:string;title:string;duration_min:number;status:string}>;message:string};
type Athlete={id:string;display_name:string};
function monday(offset:number){const d=new Date();const weekday=(d.getDay()+6)%7;d.setDate(d.getDate()-weekday+offset*7);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export default function CoachBaselinePlanReview(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [selected,setSelected]=useState('');
 const [offset,setOffset]=useState(1);
 const [review,setReview]=useState<Review|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{let live=true;void(async()=>{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user||user.app_metadata?.role!=='coach'){if(live)setError('Verified coach login required');return}
  const {data:assign,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
  if(ae){if(live)setError(ae.message);return}
  const ids=(assign||[]).map(a=>a.athlete_id);
  if(!ids.length)return;
  const {data,error:pe}=await supabase.from('athlete_profile').select('id,display_name').in('id',ids);
  if(!live)return;
  if(pe){setError(pe.message);return}
  const next=data||[];setAthletes(next);setSelected(next[0]?.id||'');
 })();return()=>{live=false}},[]);
 async function inspect(){
  if(!selected)return;
  setBusy(true);setError('');setReview(null);
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw Error('Sign in to review athlete plans');
   const params=new URLSearchParams({athleteId:selected,weekStart:monday(offset)});
   const response=await fetch('/api/coach/weekly-plan-review?'+params.toString(),{headers:{Authorization:'Bearer '+session.access_token}});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Review unavailable');
   setReview(result);
  }catch(e){setError(e instanceof Error?e.message:'Review unavailable')}finally{setBusy(false)}
 }
 return <section className="coach-attention-group" aria-label="Validated baseline weekly plan review" style={{padding:18}}>
  <header className="coach-attention-heading"><div><h3>History-informed weekly review</h3><p>Compare approved training capacity with the calendar. This screen cannot publish or change sessions.</p></div></header>
  <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'end'}}>
   <label>Athlete<select value={selected} onChange={e=>{setSelected(e.target.value);setReview(null)}}>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}</select></label>
   <label>Week<select value={offset} onChange={e=>{setOffset(Number(e.target.value));setReview(null)}}><option value={0}>Current week</option><option value={1}>Next week</option><option value={2}>Following week</option></select></label>
   <button type="button" disabled={!selected||busy} onClick={()=>void inspect()}>{busy?'Checking…':'Inspect week'}</button>
  </div>
  {error&&<p role="alert">{error}</p>}
  {review&&<div style={{marginTop:16}}>
   <strong>{review.weekStart} · {review.phase||'No phase set'}</strong>
   <p>Approved historical capacity: {review.approvedCapacityHours==null?'Not validated':review.approvedCapacityHours.toFixed(1)+' h'} · Saved target: {review.storedTargetHours??'Not set'} h · Calendar: {review.scheduledHours} h across {review.sessionCount} sessions</p>
   <p>{review.activityCount} historical activities analysed.</p>
   {review.blockers.length>0&&<div role="status"><strong>Publication blockers</strong>{review.blockers.map((b,i)=><p key={i}>{b}</p>)}</div>}
   {review.sessions.map(s=><div key={s.id} style={{padding:'10px 0',borderBottom:'1px solid #31536d'}}><strong>{s.planned_date} · {s.sport} · {s.duration_min} min</strong><p>{s.title} · {s.status}</p></div>)}
   <p><strong>Review only:</strong> {review.message}</p>
  </div>}
 </section>;
}
