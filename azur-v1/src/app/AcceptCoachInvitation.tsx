import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Invitation acceptance happens before onboarding, using the verified signed-in email. */
export default function AcceptCoachInvitation(){
 const [status,setStatus]=useState('Checking your invitation…');
 const [invitation,setInvitation]=useState<{id:string;invitee_email:string;expires_at:string;accepted_at:string|null}|null>(null);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{void (async()=>{
  const id=new URLSearchParams(window.location.search).get('invitation');
  if(!id){setStatus('This invitation link is incomplete. Ask your coach for a new email.');return;}
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){setStatus('Please sign in with the email address that received the invitation, then reopen this link.');return;}
  if(!user.email_confirmed_at){setStatus('Confirm your account email before accepting this invitation.');return;}
  const {data,error}=await supabase.from('coach_athlete_invitation').select('id,invitee_email,expires_at,accepted_at').eq('id',id).maybeSingle();
  if(error||!data){setStatus('Invitation not found for this account. Sign in using the invited email address.');return;}
  if(user.email.toLowerCase()!==data.invitee_email.toLowerCase()){setStatus('This invitation was sent to a different email address.');return;}
  if(new Date(data.expires_at).getTime()<=Date.now()&&!data.accepted_at){setStatus('This invitation has expired. Ask your coach to resend it.');return;}
  setInvitation(data);setStatus(data.accepted_at?'Invitation already accepted. You can continue to onboarding.':'Accept your coaching invitation to continue.');
 })()},[]);
 async function accept(){
  if(!invitation||busy)return;
  setBusy(true);setStatus('Accepting your invitation…');
  const {data,error}=await supabase.from('coach_athlete_invitation').update({accepted_at:new Date().toISOString()}).eq('id',invitation.id).is('accepted_at',null).select('id').maybeSingle();
  setBusy(false);
  if(error||!data){setStatus('We could not verify acceptance: '+(error?.message||'Please request a new link.'));return;}
  window.location.assign('/onboarding');
 }
 return <main className="login-screen"><section className="login-card azur-invitation-card" style={{maxWidth:520,margin:'auto',textAlign:'center'}}><img src="/brand/azur-logo.png" className="login-logo" alt="AZUR Triathlon Coaching" />
  <span className="eyebrow">AZUR TRIATHLON COACHING</span>
  <h2>Welcome to your next chapter</h2><p>Personalised training, built around your goals and your life.</p>
  <p role="status">{status}</p>
  {invitation&&!invitation.accepted_at&&<button className="primary-button" type="button" disabled={busy} onClick={()=>void accept()}>{busy?'Accepting…':'Accept & begin onboarding'}</button>}
  {invitation?.accepted_at&&<a className="primary-button" href="/onboarding">Continue to athlete setup</a>}
  <p><small>Your coach can access your athlete training information after you accept.</small></p>
 </section></main>;
}
