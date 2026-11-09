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
  const {data:created,error}=await supabase.from('coach_athlete_invitation').insert({coach_user_id:user.id,invitee_email:normalized}).select('id').single();
  if(error||!created){setBusy(false);setMessage(error?.message||'Could not create invitation.');return;}
  const {data:delivery,error:deliveryError}=await supabase.functions.invoke('send-coach-invitation',{body:{invitation_id:created.id}});
  setBusy(false);
  setEmail('');
  setMessage(deliveryError||delivery?.error
    ? 'Invitation saved, but email sending failed. Use Send email below to retry; do not create another invitation.'
    : 'Invitation created and submitted to the email provider. Delivery and athlete acceptance are not yet confirmed.');
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
  const link=window.location.origin+'/?join=1&invitation='+encodeURIComponent(inv.id);
  const msg = `You're invited to AZUR Triathlon Coaching!\n\nYour coach has invited ${inv.invitee_email} to test AZUR beta. Register or sign in with this email, verify it, and AZUR will securely connect you to your coach before onboarding.\n\nOpen your invitation: ${link}\n\nIn beta, AZUR can help you set race goals, enter training availability and thresholds, view a structured swim/bike/run plan, and give feedback. Training recommendations and integrations are still being tested; some imports, adaptive adjustments and calendar connections may not work reliably. Review sessions with your coach and report anything unexpected.\n\nPlease do not rely on AZUR alone for medical or safety decisions.`;
  try{await navigator.clipboard.writeText(msg);setMessage('Invitation instructions copied. Sharing them does not create an account or activate public registration.');}
  catch{setMessage('Copy unavailable. Share the onboarding URL and invited email address manually.');}
 }
 async function accept(inv:Invitation){
  setBusy(true);setMessage('');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setMessage('Please sign in.');setBusy(false);return;}
  const {data,error}=await supabase.from('coach_athlete_invitation').update({accepted_at:new Date().toISOString(),accepted_by:user.id}).eq('id',inv.id).is('accepted_at',null).select('id').maybeSingle();
  setBusy(false);
  if(error){setMessage(error.message);return;}
  if(!data){setMessage('This invitation could not be accepted. Refresh to check its status.');await refresh();return;}
  setMessage('Invitation accepted. Your coach can now see your athlete profile.');await refresh();
 }
 return <section className="azur-invitations">
  <h3>{mode==='coach'?'Invite beta athletes':'Coach invitations'}</h3>
  <p>{mode==='coach'?'Create a secure invitation for the athlete’s registration email. Acceptance is required before coach access is granted.':'Invitations addressed to your verified account email appear here. Accept your invitation before starting athlete onboarding.'}</p>
  {mode==='coach'&&<form onSubmit={createInvite} className="azur-invite-form"><label> Athlete email <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="athlete@example.com"/></label><button type="submit" disabled={busy}>{busy?'Sending invitation…':'Invite athlete & send email'}</button></form>}
  <button type="button" disabled={busy || loading} onClick={()=>void refresh()}>Refresh invitations</button>
  {message&&<p role="status">{message}</p>}
  {loading?<p>Loading invitations…</p>:items.length===0?<p>No invitations yet.</p>:<div className="azur-invite-list">{items.map(inv=><div key={inv.id} className="azur-invite-row">
   <div><strong>{mode==='coach'?inv.invitee_email:'AZUR coach invitation'}</strong><small>{inv.accepted_at?'Accepted':new Date(inv.expires_at).getTime()<Date.now()?'Expired':'Awaiting acceptance'}</small></div>
   {mode==='coach'&&!inv.accepted_at&&new Date(inv.expires_at).getTime()>Date.now()&&<button type="button" disabled={busy} onClick={()=>void sendEmail(inv)}>{inv.email_sent_at?'Resend email':'Send email'}</button>}
   {mode==='coach'&&!inv.accepted_at&&<button type="button" onClick={()=>void copyInstructions(inv)}>Copy instructions</button>}
   {mode==='athlete'&&!inv.accepted_at&&new Date(inv.expires_at).getTime()>Date.now()&&<button disabled={busy} onClick={()=>void accept(inv)}>Accept</button>}
  </div>)}</div>}
  {mode==='coach'&&<p className="azur-invite-note">Enter an athlete email to create and send the invitation in one step. If email delivery is not configured, use Copy instructions on the existing invitation. Athletes only need the invitation link and verified email; no separate acceptance button is required.</p>}
 </section>;
}
