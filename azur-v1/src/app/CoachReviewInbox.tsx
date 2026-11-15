import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type PriorityReview = {
  id: string;
  athlete_id: string;
  current_priority: string;
  suggested_priority: string;
  rationale: string;
  created_at: string;
};

export default function CoachReviewInbox() {
  const [assignedCount, setAssignedCount] = useState(0);
  const [isVerifiedCoach, setIsVerifiedCoach] = useState(false);
  const [reviews, setReviews] = useState<PriorityReview[]>([]);
  const [onboarding, setOnboarding] = useState<Array<{athleteId:string;name:string;weeklyHours:number|null;race:string|null;device:string|null}>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function reload() {
    setError('');
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setIsVerifiedCoach(false);
        setAssignedCount(0);
        setReviews([]);
        setOnboarding([]);
        return;
      }
      // app_metadata is server-managed; never trust editable user_metadata for roles.
      const verifiedCoach = user.app_metadata?.role === 'coach';
      setIsVerifiedCoach(verifiedCoach);
      if (!verifiedCoach) {
        setAssignedCount(0);
        setReviews([]);
        return;
      }
      const { data: assignments, error: assignmentError } = await supabase
        .from('coach_athlete_assignment')
        .select('athlete_id')
        .eq('coach_user_id', user.id);
      if (assignmentError) throw assignmentError;
      const ids = (assignments ?? []).map((assignment) => assignment.athlete_id);
      setAssignedCount(ids.length);
      if (!ids.length) {
        setReviews([]);
        setOnboarding([]);
        return;
      }
      // Surface completed athlete setup for assigned coaches without modifying plans.
      const [{data:profiles,error:profileError},{data:setups,error:setupError}] = await Promise.all([
        supabase.from('athlete_profile').select('id,user_id,display_name').in('id',ids),
        supabase.from('athlete_onboarding').select('user_id,onboarding_step,weekly_hours,race_distance,device').gte('onboarding_step',5),
      ]);
      if(profileError||setupError)throw profileError||setupError;
      const byUser=new Map((setups||[]).map(x=>[x.user_id,x]));
      setOnboarding((profiles||[]).flatMap(p=>{
        const setup=byUser.get(p.user_id);
        return setup?[{athleteId:p.id,name:p.display_name||'Athlete',weeklyHours:setup.weekly_hours??null,race:setup.race_distance??null,device:setup.device??null}]:[];
      }));
      const { data, error: reviewError } = await supabase
        .from('training_priority_review')
        .select('id, athlete_id, current_priority, suggested_priority, rationale, created_at')
        .in('athlete_id', ids)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);
      if (reviewError) throw reviewError;
      setReviews(data ?? []);
    } catch (err) {
      setReviews([]);
      setOnboarding([]);
      setError(err instanceof Error ? err.message : 'Unable to load reviews.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  if (!isVerifiedCoach && !error) return null;
  return (
    <section style={{ padding: 20, margin: '16px 20px', background: '#0C2035', color: '#FFFFFF', borderRadius: 14 }}>
      <h3 style={{ marginTop: 0 }}>Coach Review Inbox</h3>
      <p style={{ color: '#AFC3D4' }}>Read-only review requests for your assigned athletes. No training changes can be approved here yet.</p>
      <button type="button" onClick={() => void reload()} disabled={loading}>
        {loading ? 'Loading…' : 'Refresh reviews'}
      </button>
      {error && <p role="alert">{error}</p>}
      {!error && !loading && assignedCount === 0 && <p>Coach account verified. Awaiting administrator-approved athlete assignments. No athlete records are accessible yet.</p>}
      {!error && !loading && assignedCount > 0 && reviews.length === 0 && onboarding.length === 0 && <p>No pending reviews or completed onboarding setups for assigned athletes.</p>}
      {onboarding.length>0&&<div style={{marginTop:16}}><h4>New athlete setup · coach review</h4><p style={{color:'#AFC3D4'}}>Athlete details saved. Confirm training history and approve a safe starting limit before publishing workouts.</p>{onboarding.map(a=><article key={a.athleteId} style={{padding:12,marginTop:8,border:'1px solid #456078',borderRadius:10}}><strong>{a.name}</strong><p style={{fontSize:13,color:'#AFC3D4',marginBottom:0}}>{a.race||'Race not set'} · {a.weeklyHours??'—'} available h/week · {a.device||'No device selected'}</p></article>)}</div>}
      {reviews.map((review) => (
        <article key={review.id} style={{ padding: 14, marginTop: 12, border: '1px solid #456078', borderRadius: 10 }}>
          <strong>Pending · {review.current_priority} → {review.suggested_priority}</strong>
          <p style={{ fontSize: 12, color: '#AFC3D4' }}>Athlete ID: {review.athlete_id} · {new Date(review.created_at).toLocaleDateString('en-GB')}</p>
          <p>{review.rationale}</p>
        </article>
      ))}
    </section>
  );
}
