import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
type Request={applied_at:string|null;id:string;athlete_user_id:string;session_id:string;original_date:string;requested_date:string;status:string;reason:string;coach_decision:string|null};
export default function CoachSessionMoveReview(){
 const [items,setItems]=useState<Request[]>([]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState('');
 async function load(){
  const {data,error}=await supabase.from('athlete_session_move_request').select('id,athlete_user_id,session_id,original_date,requested_date,status,reason,coach_decision') .order('created_at',{ascending:false}).limit(30);
  if(error)setMessage('Could not load move requests: '+error.message);else setItems((data||[]) as Request[]);
 }
 useEffect(()=>{void load()},[]);
 async function apply(id:string){
  setBusy(id);setMessage('');
  const {error}=await supabase.rpc('apply_approved_session_move',{p_request_id:id});
  setBusy('');
  if(error)setMessage('Move not applied: '+error.message);
  else{setMessage('Approved move applied to the staging calendar.');await load();}
 }
 async function decide(id:string,approve:boolean){
  setBusy(id);setMessage('');
  const {data,error}=await supabase.rpc('decide_athlete_session_move',{p_request_id:id,p_approve:approve});
  setBusy('');
  if(error)setMessage(error.message);
  else{setMessage((data?.decision||'Decision')+' recorded. Approved moves can now be applied after final safety checks.');await load();}
 }
 return <details style={{margin:'14px 0',padding:14,borderRadius:16,border:'1px solid #365779',background:'#10283e',color:'#fff'}}>
  <summary style={{cursor:'pointer',fontWeight:700}}>Athlete session move requests ({items.length})</summary>
  <p style={{fontSize:13,color:'#bad1e1'}}>Review requests from your invited athletes. Decisions are recorded without changing published sessions.</p>
  {items.length===0&&<p style={{fontSize:13}}>No pending move requests.</p>}
  {items.filter(item=>!item.applied_at).map(item=><div key={item.id} style={{borderTop:'1px solid #365779',padding:'12px 0'}}>
   <strong>{item.original_date} → {item.requested_date}</strong>
   <p style={{fontSize:12,color:'#bad1e1'}}>{item.status==='coach_review'?'Coach review required':'Lower-risk proposal'} · {item.reason}</p>
   <div style={{display:'flex',gap:8}}>
    {item.coach_decision===null&&<><button disabled={!!busy} onClick={()=>void decide(item.id,true)}>Approve proposal</button><button disabled={!!busy} onClick={()=>void decide(item.id,false)}>Reject</button></>}
    {item.coach_decision==='approved'&&<button disabled={!!busy} onClick={()=>void apply(item.id)}>Apply approved move</button>}
    {item.coach_decision==='rejected'&&<span>Rejected</span>}
   </div>
  </div>)}
  {message&&<p role="status">{message}</p>}
 </details>;
}
