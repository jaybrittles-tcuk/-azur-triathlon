import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Insight = {
  activity_id: string;
  athlete_id: string;
  planned_session_id: string | null;
  observed_at: string;
  planned_minutes: number;
  recorded_minutes: number | string;
  duration_delta_pct: number | string;
  evidence_level: 'athlete_reported' | 'device_recorded';
  severity: 'routine' | 'review' | 'high';
  observation: string;
  coach_guidance: string;
};
type Reviewed = { athlete_id: string; item_key: string };
const reviewKey = (insight: Insight) =>
  'training-insight:' + insight.activity_id + ':' + insight.duration_delta_pct + ':' + insight.severity;

export default function CoachTrainingExceptions() {
  const [coachId, setCoachId] = useState('');
  const [insights, setInsights] = useState<Insight[]>([]);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [showReviewed, setShowReviewed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user || user.app_metadata?.role !== 'coach') {
        throw new Error('Verified coach account required');
      }
      setCoachId(user.id);
      // Server-side RLS limits all results to athletes assigned to this coach.
      // Fetch exceptions, not the full activity history of every athlete.
      const { data, error: insightError } = await supabase
        .from('coach_session_insight')
        .select('activity_id,athlete_id,planned_session_id,observed_at,planned_minutes,recorded_minutes,duration_delta_pct,evidence_level,severity,observation,coach_guidance')
        .eq('eligible_for_patterns', true)
        .in('severity', ['review', 'high'])
        .order('observed_at', { ascending: false })
        .limit(100);
      if (insightError) throw insightError;
      const next = (data ?? []) as Insight[];
      const ids = [...new Set(next.map(item => item.athlete_id))];
      if (!ids.length) {
        setInsights([]);
        setReviewed(new Set());
        setNames({});
        return;
      }
      const [profiles, decisions] = await Promise.all([
        supabase.from('athlete_profile').select('id,display_name').in('id', ids),
        supabase.from('coach_monitoring_review').select('athlete_id,item_key').eq('coach_user_id', user.id).in('athlete_id', ids).like('item_key','training-insight:%'),
      ]);
      if (profiles.error || decisions.error) throw new Error(profiles.error?.message || decisions.error?.message || 'Could not load coach review state');
      setNames(Object.fromEntries((profiles.data ?? []).map(p => [p.id, p.display_name || 'Assigned athlete'])));
      setReviewed(new Set(((decisions.data ?? []) as Reviewed[]).map(row => row.item_key)));
      setInsights(next);
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Unable to load training exceptions');
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, reloadKey]);

  const pending = useMemo(() => insights.filter(i => !reviewed.has(reviewKey(i))), [insights, reviewed]);
  const shown = showReviewed ? insights : pending;
  const high = pending.filter(i => i.severity === 'high').length;

  async function acknowledge(item: Insight) {
    if (!coachId) return;
    setBusy(item.activity_id);
    setError('');
    try {
      const key = reviewKey(item);
      const {error: writeError} = await supabase.from('coach_monitoring_review')
        .insert({coach_user_id:coachId,athlete_id:item.athlete_id,item_key:key});
      if (writeError && writeError.code !== '23505') throw writeError;
      setReviewed(old => new Set([...old, key]));
    } catch(e) {setError(e instanceof Error ? e.message : 'Unable to mark as reviewed');}
    finally {setBusy('');}
  }

  return <section className="coach-attention-v2" aria-label="Automatic training exception queue">
    <header className="coach-attention-heading">
      <div><h3>Training exceptions</h3><p>Automatic duration observations from linked training activities. Routine sessions are filtered out. This queue never changes training plans.</p></div>
      <button type="button" disabled={loading} onClick={() => setReloadKey(x => x + 1)}>↻ Refresh</button>
    </header>
    <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',marginBottom:16}}>
      <strong>{loading ? 'Checking training…' : pending.length + ' need review'}</strong>
      {!loading && <span>{high} high priority</span>}
      <label style={{display:'flex',alignItems:'center',gap:8}}>
        <input type="checkbox" checked={showReviewed} onChange={e=>setShowReviewed(e.target.checked)}/> Include reviewed
      </label>
    </div>
    {error && <p role="alert">{error}</p>}
    {!loading && !error && pending.length === 0 && <p>No outstanding duration exceptions in the latest 100 results.</p>}
    {!loading && shown.map(item => <article className="coach-attention-row" key={item.activity_id} style={{marginBottom:12}}>
      <div>
        <strong>{item.severity === 'high' ? 'High priority' : 'Review'} · {names[item.athlete_id] || 'Assigned athlete'}</strong>
        <p>{new Date(item.observed_at).toLocaleDateString('en-GB')} · {item.evidence_level === 'athlete_reported' ? 'Athlete-reported duration' : 'Device-recorded duration'}</p>
        <p>{item.observation}</p>
        <p>{item.coach_guidance}</p>
        <p style={{fontSize:12,opacity:.8}}>This is an observation, not an automatic adjustment. Power, heart rate and execution quality are not evaluated here.</p>
      </div>
      <button type="button" onClick={()=>void acknowledge(item)} disabled={Boolean(busy) || reviewed.has(reviewKey(item))}>
        {reviewed.has(reviewKey(item)) ? 'Reviewed' : busy === item.activity_id ? 'Saving…' : 'Mark reviewed'}
      </button>
    </article>)}
  </section>;
}
