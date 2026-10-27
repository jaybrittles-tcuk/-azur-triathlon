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
        return;
      }
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
      {!error && !loading && assignedCount > 0 && reviews.length === 0 && <p>No pending priority reviews for assigned athletes.</p>}
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
