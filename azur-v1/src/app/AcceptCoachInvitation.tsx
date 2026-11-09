import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * One-link beta invitation handoff.
 * A signed-in, email-verified athlete with a matching unexpired invitation is
 * connected to their coach once, then taken straight to onboarding.
 * RLS remains responsible for enforcing invitation ownership.
 */
export default function AcceptCoachInvitation() {
  const [status, setStatus] = useState('Verifying your AZUR invitation…');
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const running = useRef(false);
  useEffect(() => {
    if (running.current) return;
    running.current = true;
    let cancelled = false;
    async function completeInvitation() {
      setError(false);
      try {
        const invitationId = new URLSearchParams(window.location.search).get('invitation');
        if (!invitationId || !/^[0-9a-f-]{36}$/i.test(invitationId))
          throw new Error('This invitation link is incomplete. Ask your coach to resend it.');

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user)
          throw new Error('Sign in using your invitation email, then reopen your original invitation link.');
        if (!user.email || !user.email_confirmed_at)
          throw new Error('Please verify your email address first, then return to your invitation link.');

        const { data: invitation, error: invitationError } = await supabase
          .from('coach_athlete_invitation')
          .select('id,invitee_email,expires_at,accepted_at,accepted_by')
          .eq('id', invitationId)
          .maybeSingle();
        if (invitationError || !invitation)
          throw new Error('We could not verify this invitation for your account. Ask your coach to resend it.');
        if (user.email.toLowerCase() !== invitation.invitee_email.toLowerCase())
          throw new Error('Sign in with the email address your coach invited.');
        if (invitation.accepted_at) {
          if (invitation.accepted_by !== user.id)
            throw new Error('This invitation has already been accepted by another account.');
        } else {
          if (new Date(invitation.expires_at).getTime() <= Date.now())
            throw new Error('Your invitation has expired. Ask your coach for a new one.');
          if (!cancelled) setStatus('Connecting you to your AZUR coach…');
          const { data: accepted, error: acceptError } = await supabase
            .from('coach_athlete_invitation')
            .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
            .eq('id', invitation.id)
            .is('accepted_at', null)
            .select('id')
            .maybeSingle();
          if (acceptError) throw acceptError;
          if (!accepted) {
            // Another tab may have accepted the same invitation; verify ownership.
            const { data: latest, error: latestError } = await supabase
              .from('coach_athlete_invitation')
              .select('accepted_by,accepted_at')
              .eq('id', invitation.id)
              .maybeSingle();
            if (latestError || !latest?.accepted_at || latest.accepted_by !== user.id)
              throw new Error('Your invitation was not confirmed. Please retry.');
          }
        }
        if (!cancelled) {
          setStatus('Invitation confirmed. Opening your athlete setup…');
          window.location.replace('/onboarding');
        }
      } catch (caught) {
        if (!cancelled) {
          setError(true);
          setStatus(caught instanceof Error ? caught.message : 'We could not complete your invitation.');
        }
      } finally {
        running.current = false;
      }
    }
    void completeInvitation();
    return () => { cancelled = true; running.current = false; };
  }, [retry]);

  return (
    <main className="azur-onboarding-page">
      <section className="azur-onboarding-draft" style={{maxWidth:560,margin:'10vh auto 0'}}>
        <span className="eyebrow">AZUR TRIATHLON COACHING</span>
        <h1>Welcome to AZUR</h1>
        <p role="status">{status}</p>
        {error && <>
          <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>
          <p><a href="/">Sign in to AZUR</a> or contact your coach if the problem continues.</p>
        </>}
        <p><small>Once your verified invitation is confirmed, your coach will be able to review your athlete training information.</small></p>
      </section>
    </main>
  );
}
