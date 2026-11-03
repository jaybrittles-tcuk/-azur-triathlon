import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Pattern = {
  athlete_id: string;
  signal_type: 'repeated_short_duration' | 'repeated_long_duration';
  linked_sessions: number;
  affected_sessions: number;
  reported_sessions: number;
  device_sessions: number;
  planned_minutes: number | string;
  recorded_minutes: number | string;
  latest_observed_at: string;
  latest_activity_id: string;
  observation: string;
  coach_interpretation: string;
  proposed_action: string;
  coach_approval_required: boolean;
};
type Review = { item_key: string };
const keyFor = (p: Pattern) =>
  ['training-pattern', p.signal_type, p.latest_activity_id, p.linked_sessions, p.affected_sessions].join(':');

export default function CoachTrainingPatterns() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [names, setNames] = useState<Record<string,string>>({});
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [coachId, setCoachId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [showReviewed, setShowReviewed] = useState(false);
  const [reload, setReload] = useState(0);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);setError('');
    try {
      const {data:{user},error:authError} = await supabase.auth.getUser();
      if(authError || !user || user.app_metadata?.role !== 'coach') throw new Error('Verified coach login required');
      setCoachId(user.id);
      // View is security_invoker; underlying session-insight RLS enforces assigned-coach access.
      const {data,error:patternError} = await supabase.from('coach_training_pattern')
        .select('athlete_id,signal_type,linked_sessions,affected_sessions,reported_sessions,device_sessions,planned_minutes,recorded_minutes,latest_observed_at,latest_activity_id,observation,coach_interpretation,proposed_action,coach_approval_required')
        .order('latest_observed_at',{ascending:false}).limit(101);
      if(patternError) throw patternError;
      const next = ((data ?? []).slice(0,100)) as Pattern[];
      setTruncated((data??[]).length > 100);
      const ids = [...new Set(next.map(p=>p.athlete_id))];
      if(!ids.length){setPatterns([]);setNames({});setReviewed(new Set());return;}
      const [profiles, reviewRows] = await Promise.all([
        supabase.from('athlete_profile').select('id,display_name').in('id',ids),
        supabase.from('coach_monitoring_review').select('item_key').eq('coach_user_id',user.id).in('athlete_id',ids).like('item_key','training-pattern:%'),
      ]);
      if(profiles.error || reviewRows.error) throw new Error(profiles.error?.message || reviewRows.error?.message || 'Could not load review state');
      setNames(Object.fromEntries((profiles.data??[]).map(p=>[p.id,p.display_name||'Assigned athlete'])));
      setReviewed(new Set(((reviewRows.data??[]) as Review[]).map(r=>r.item_key)));
      setPatterns(next);
    }catch(e){setError(e instanceof Error?e.message:'Unable to load training patterns');setPatterns([]);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void load()},[load,reload]);
  const outstanding = useMemo(()=>patterns.filter(p=>!reviewed.has(keyFor(p))),[patterns,reviewed]);
  const displayed = showReviewed ? patterns : outstanding;

  async function acknowledge(p:Pattern) {
    if(!coachId)return;
    const key = keyFor(p);setBusyKey(key);setError('');
    try {
      const {error:writeError} = await supabase.from('coach_monitoring_review')
        .insert({coach_user_id:coachId,athlete_id:p.athlete_id,item_key:key});
      if(writeError && writeError.code!=='23505')throw writeError;
      setReviewed(old=>new Set([...old,key]));
    }catch(e){setError(e instanceof Error?e.message:'Unable to record review');}
    finally{setBusyKey('');}
  }

  return <section className="coach-attention-v2" aria-label="Multi-session training patterns">
    <header className="coach-attention-heading">
      <div><h3>Multi-session training patterns</h3><p>21-day, evidence-gated observations across linked completed sessions. No automated plan changes.</p></div>
      <button type="button" disabled={loading} onClick={()=>setReload(k=>k+1)}>↻ Refresh</button>
    </header>
    <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:14}}>
      <strong>{loading?'Checking patterns…':outstanding.length+' patterns to review'}</strong>
      <label style={{display:'flex',alignItems:'center',gap:6}}><input type="checkbox" checked={showReviewed} onChange={e=>setShowReviewed(e.target.checked)}/> Include reviewed</label>
    </div>
    {error&&<p role="alert">{error}</p>}
    {!loading&&!error&&outstanding.length===0&&<p>No qualifying repeated-duration patterns. At least three distinct completed sessions are required before AZUR can assess a trend; absence of an alert is not proof that the athlete is recovered or on track.</p>}
    {truncated&&<p role="status">Only the 100 most recent patterns are displayed. Additional patterns exist; filtering and pagination are required before large-roster rollout.</p>}
    {!loading&&displayed.map(p=><article className="coach-attention-row" key={keyFor(p)} style={{marginBottom:12}}>
      <div>
        <strong>{names[p.athlete_id]||'Assigned athlete'} · {p.signal_type==='repeated_short_duration'?'Repeated short sessions':'Repeated extended sessions'}</strong>
        <p><b>Observed:</b> {p.observation} {p.affected_sessions} of {p.linked_sessions} sessions affected.</p>
        <p>Evidence: {p.reported_sessions} athlete-reported · {p.device_sessions} device-recorded. Planned {Math.round(Number(p.planned_minutes))} min; recorded {Math.round(Number(p.recorded_minutes))} min.</p>
        <p><b>Coach interpretation to consider:</b> {p.coach_interpretation}</p>
        <p><b>Proposed next step:</b> {p.proposed_action}</p>
        <small>Duration-only pattern; no verified intensity, fatigue, injury, or recovery diagnosis. Any significant plan change requires separate coach approval.</small>
      </div>
      <button type="button" disabled={Boolean(busyKey)||reviewed.has(keyFor(p))} onClick={()=>void acknowledge(p)}>
        {reviewed.has(keyFor(p))?'Reviewed':busyKey===keyFor(p)?'Saving…':'Mark reviewed'}
      </button>
    </article>)}
  </section>;
}
