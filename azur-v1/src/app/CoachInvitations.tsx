import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Invitation = {id:string;invitee_email:string;coach_user_id:string;created_at:string;expires_at:string;accepted_at:string|null;email_sent_at:string|null};
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
  const {data,error}=await supabase.from('coach_athlete_invitation').select('id,invitee_email,coach_user_id,created_at,expires_at,accepted_at,email_sent_at').order('created_at',{ascending:false}).limit(30);
  if(error)setMessage('Could not refresh invitations. Please try again.');
  else {setItems((data||[]) as Invitation[]);setMessage(previous=>previous.startsWith('permission denied') || previous.startsWith('Could not refresh invitations') ? '' : previous);}
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
 async function sendEmail(inv:Invitation){
  setBusy(true);setMessage('');
  const {data,error}=await supabase.functions.invoke('send-coach-invitation',{body:{invitation_id:inv.id}});
  setBusy(false);
  if(error||data?.error){setMessage(data?.error || error?.message || 'Unable to send invitation email.');return;}
  setMessage('The email provider accepted the invitation. Inbox delivery is not yet confirmed.');
  await refresh();
 }
 async function copyInstructions(inv:Invitation){
  const msg = `Jay has invited you to AZUR using ${inv.invitee_email}. Open ${window.location.origin}/register in Safari, create your athlete account with this email, confirm your email and complete setup. Then open More and accept the coach invitation. If you already have an account, sign in and open More.`;
  try{await navigator.clipboard.writeText(msg);setMessage('Invitation instructions copied. Sharing them does not create an account or activate public registration.');}
  catch{setMessage('Copy unavailable. Share the onboarding URL and invited email address manually.');}
 }
 async function accept(inv:Invitation){
  setBusy(true);setMessage('');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setMessage('Please sign in.');setBusy(false);return;}
  const {data,error}=await supabase.from('coach_athlete_invitation').update({accepted_at:new Date().toISOString()}).eq('id',inv.id).is('accepted_at',null).select('id').maybeSingle();
  setBusy(false);
  if(error){setMessage('Unable to accept the invitation: '+error.message);return;}
  if(!data){setMessage('This invitation could not be accepted. Refresh to check its status.');await refresh();return;}
  setMessage('Invitation accepted. Your coach can now see your athlete profile.');await refresh();
 }
 return <section className="azur-invitations">
  <h3>{mode==='coach'?'Invite beta athletes':'Coach invitations'}</h3>
  <p>{mode==='coach'?'Create a secure invitation for the athlete’s registration email. Acceptance is required before coach access is granted.':'Invitations addressed to your verified account email appear here. Finish your athlete profile before accepting.'}</p>
  {mode==='coach'&&<form onSubmit={createInvite} className="azur-invite-form"><label> Athlete email <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="athlete@example.com"/></label><button type="submit" disabled={busy}>Create invitation</button></form>}
  <button type="button" disabled={busy || loading} onClick={()=>void refresh()} style={{minHeight:44,padding:'10px 14px',borderRadius:12,background:'#1b648b',color:'#f3faff',border:'1px solid #3696c5',fontWeight:600}}>Refresh invitations</button>
  {message&&<p role="status">{message}</p>}
  {loading?<p>Loading invitations…</p>:items.length===0?<p>No invitations yet.</p>:<div className="azur-invite-list">{items.map(inv=><div key={inv.id} className="azur-invite-row">
   <div><strong>{mode==='coach'?inv.invitee_email:'AZUR coach invitation'}</strong><small>{inv.accepted_at?'Accepted':new Date(inv.expires_at).getTime()<Date.now()?'Expired':'Awaiting acceptance'}</small></div>
   {mode==='coach'&&!inv.accepted_at&&new Date(inv.expires_at).getTime()>Date.now()&&<button type="button" disabled={busy} onClick={()=>void sendEmail(inv)}>{inv.email_sent_at?'Resend email':'Send email'}</button>}
   {mode==='coach'&&!inv.accepted_at&&<button type="button" onClick={()=>void copyInstructions(inv)}>Copy instructions</button>}
   {mode==='athlete'&&!inv.accepted_at&&new Date(inv.expires_at).getTime()>Date.now()&&<button disabled={busy} onClick={()=>void accept(inv)}>Accept</button>}
  </div>)}</div>}
  {mode==='coach'&&<p className="azur-invite-note">Create the invitation, then use Copy instructions to share the setup steps with your athlete. They can accept from More after completing setup.</p>}
 </section>;
}
