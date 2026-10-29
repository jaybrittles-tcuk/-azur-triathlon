import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Invitation = {id:string;invitee_email:string;coach_user_id:string;created_at:string;expires_at:string;accepted_at:string|null};
export default function CoachInvitations({mode}:{mode:'coach'|'athlete'}){
 const [email,setEmail]=useState('');
 const [items,setItems]=useState<Invitation[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(true);
 async function refresh(){
  setLoading(true);
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setMessage('Sign in to manage invitations.');setLoading(false);return;}
  const {data,error}=await supabase.from('coach_athlete_invitation').select('id,invitee_email,coach_user_id,created_at,expires_at,accepted_at').order('created_at',{ascending:false}).limit(30);
  if(error)setMessage(error.message);
  else setItems((data||[]) as Invitation[]);
  setLoading(false);
 }
 useEffect(()=>{void refresh()},[]);
 async function createInvite(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage('');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user || user.app_metadata?.role!=='coach'){setMessage('Only coach accounts can invite athletes.');setBusy(false);return;}
  const normalized=email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)){setMessage('Enter a valid email address.');setBusy(false);return;}
  const {error}=await supabase.from('coach_athlete_invitation').insert({coach_user_id:user.id,invitee_email:normalized});
  setBusy(false);
  if(error){setMessage(error.message);return;}
  setEmail('');setMessage('Invitation created. Share the onboarding link with the athlete; they must register using the invited email address.');
  await refresh();
 }
 async function accept(inv:Invitation){
  setBusy(true);setMessage('');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setMessage('Please sign in.');setBusy(false);return;}
  const {error}=await supabase.from('coach_athlete_invitation').update({accepted_at:new Date().toISOString(),accepted_by:user.id}).eq('id',inv.id).is('accepted_at',null);
  setBusy(false);
  if(error){setMessage(error.message);return;}
  setMessage('Invitation accepted. Your coach can now see your athlete profile.');await refresh();
 }
 return <section className="azur-invitations">
  <h3>{mode==='coach'?'Invite beta athletes':'Coach invitations'}</h3>
  <p>{mode==='coach'?'Create a secure invitation for the athlete’s registration email. Acceptance is required before coach access is granted.':'Invitations addressed to your verified account email appear here. Finish your athlete profile before accepting.'}</p>
  {mode==='coach'&&<form onSubmit={createInvite} className="azur-invite-form"><label> Athlete email <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="athlete@example.com"/></label><button type="submit" disabled={busy}>Create invitation</button></form>}
  {message&&<p role="status">{message}</p>}
  {loading?<p>Loading invitations…</p>:items.length===0?<p>No invitations yet.</p>:<div className="azur-invite-list">{items.map(inv=><div key={inv.id} className="azur-invite-row">
   <div><strong>{mode==='coach'?inv.invitee_email:'AZUR coach invitation'}</strong><small>{inv.accepted_at?'Accepted':new Date(inv.expires_at).getTime()<Date.now()?'Expired':'Awaiting acceptance'}</small></div>
   {mode==='athlete'&&!inv.accepted_at&&new Date(inv.expires_at).getTime()>Date.now()&&<button disabled={busy} onClick={()=>void accept(inv)}>Accept</button>}
  </div>)}</div>}
  {mode==='coach'&&<p className="azur-invite-note">Athletes can sign in and complete their profile at azur-triathlon.vercel.app/onboarding. Automated invitation email delivery is not active yet.</p>}
 </section>;
}
