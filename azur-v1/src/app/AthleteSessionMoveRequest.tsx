import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Session={id:string;planned_date:string;sport:string;title:string;duration_min:number;session_class:string;locked:boolean};
type MoveResult={status:string;reason:string;request_id:string};
export default function AthleteSessionMoveRequest(){
 const [sessions,setSessions]=useState<Session[]>([]);
 const [selected,setSelected]=useState('');
 const [date,setDate]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{let cancelled=false;void(async()=>{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  const {data:profile}=await supabase.from('athlete_profile').select('id').eq('user_id',user.id).maybeSingle();
  if(!profile?.id){if(!cancelled)setMessage('Athlete profile not available.');return;}
  const today=new Date().toISOString().slice(0,10);
  const end=new Date(Date.now()+28*86400000).toISOString().slice(0,10);
  const {data,error}=await supabase.from('planned_session').select('id,planned_date,sport,title,duration_min,session_class,locked').eq('athlete_id',profile.id).eq('is_active_version',true).gte('planned_date',today).lte('planned_date',end).order('planned_date',{ascending:true}).limit(50);
  if(cancelled)return;
  if(error)setMessage('Could not load planned sessions: '+error.message);
  else setSessions((data||[]) as Session[]);
 })();return()=>{cancelled=true};},[]);
 const session=sessions.find(s=>s.id===selected);
 async function requestMove(){
  if(!selected||!date)return;
  setBusy(true);setMessage('');
  const {data,error}=await supabase.rpc('request_athlete_session_move',{p_session_id:selected,p_requested_date:date});
  setBusy(false);
  if(error){setMessage(error.message);return;}
  const result=data as MoveResult;
  setMessage(result.status==='coach_review'?'Coach review requested. Your existing session remains unchanged. '+result.reason:'Move proposal recorded. Your calendar is unchanged until the scheduling workflow applies it. '+result.reason);
 }
 return <details style={{border:'1px solid #345574',borderRadius:16,padding:14,margin:'12px 0',background:'#0e253a',color:'#f1f8ff'}}>
  <summary style={{cursor:'pointer',fontWeight:700}}>Request a session move</summary>
  <p style={{fontSize:13,color:'#b4ccdc'}}>Try moving a session to Friday or another available day. AZUR checks your availability, nearby hard workouts and workload. No calendar changes are made at this stage.</p>
  <label style={{display:'block',marginBottom:12}}>Session
   <select value={selected} onChange={e=>{setSelected(e.target.value);setMessage('')}} style={{display:'block',width:'100%',padding:10,marginTop:5}}>
    <option value="">Choose a planned session</option>
    {sessions.filter(s=>!s.locked).map(s=><option key={s.id} value={s.id}>{s.planned_date} · {s.sport} · {s.title}</option>)}
   </select>
  </label>
  <label style={{display:'block',marginBottom:12}}>Requested new date
   <input type="date" value={date} min={new Date().toISOString().slice(0,10)} onChange={e=>setDate(e.target.value)} style={{display:'block',width:'100%',padding:10,marginTop:5}}/>
  </label>
  {session&&<p style={{fontSize:12,color:'#b4ccdc'}}>Original: {session.planned_date} · {session.duration_min} min. Key or long sessions require coach review.</p>}
  <button type="button" disabled={!selected||!date||busy} onClick={()=>void requestMove()} style={{padding:'11px 16px',borderRadius:10,background:'#1696d2',color:'#fff',fontWeight:700}}>{busy?'Checking…':'Check & request move'}</button>
  {message&&<p role="status" style={{marginTop:12,fontSize:13}}>{message}</p>}
 </details>;
}
