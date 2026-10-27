import { resolveCurrentBikeApprovals } from '../lib/calculations/coachApprovalResolver';
import { selectCoachSession } from '../lib/calculations/sessionSelection';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useMemo, useState } from 'react';
import { allBikeWorkouts } from '../domain/bikeWorkoutCatalog';
import { validateWorkout, workoutMinutes } from '../domain/bikeWorkoutLibrary';
import type { BikeWorkout } from '../domain/bikeWorkoutLibrary';

const phases = ['base', 'build', 'peak', 'taper', 'recovery'] as const;
type Phase = typeof phases[number];
type ReviewDraft = { level: 1 | 2 | 3; phases: Phase[] };
const familyName = (family: string) => family.replaceAll('_', ' ');

export default function CoachCyclingLibraryReview({ ftpWatts }: { ftpWatts: number | null }) {
  const [availableMinutes, setAvailableMinutes] = useState(90);
  const [selectionPhase, setSelectionPhase] = useState<Phase>('build');
  const [selectionFocus, setSelectionFocus] = useState<'threshold'|'aerobic_endurance'|'vo2max'|'strength_endurance'|'race_specific'>('threshold');
  const [maxLevel, setMaxLevel] = useState<1|2|3>(2);
  const [events, setEvents] = useState<Array<{id:string;workout_id:string;workout_version:number;decision:'approved'|'revoked';level:number;phases:string[];decided_at:string}>>([]);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void supabase.from('coach_workout_approval_event')
      .select('id,workout_id,workout_version,decision,level,phases,decided_at')
      .order('decided_at',{ascending:false})
      .then(({data,error}) => {if(error) setFeedback(error.message); else setEvents(data??[]);});
  }, []);
  async function recordDecision(decision:'approved'|'revoked') {
    if (!selected || saving || !draft.phases.length || issues.length) return;
    setSaving(true);setFeedback('');
    try {
      const {data:{user}}=await supabase.auth.getUser();
      if(user?.app_metadata?.role!=='coach') throw new Error('Verified coach role required');
      const {error}=await supabase.from('coach_workout_approval_event').insert({
        workout_id:selected.id,workout_version:selected.version,
        level:draft.level,phases:draft.phases,decision,decided_by:user.id
      });
      if(error) throw error;
      const {data, error:readError}=await supabase.from('coach_workout_approval_event')
        .select('id,workout_id,workout_version,decision,level,phases,decided_at')
        .order('decided_at',{ascending:false});
      if(readError) throw readError;
      setEvents(data??[]);setFeedback(decision==='approved'?'Approval recorded. Not published or scheduled.':'Approval revoked.');
    } catch(error) {setFeedback(error instanceof Error ? error.message : 'Could not save coach decision');}
    finally {setSaving(false);}
  }
  const [selectedId, setSelectedId] = useState(allBikeWorkouts[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const selected = useMemo(() => allBikeWorkouts.find(w => w.id === selectedId), [selectedId]);
  const latestEvent = events.find(event=>event.workout_id===selectedId);
  const eligible = resolveCurrentBikeApprovals(events);
  const preview = selectCoachSession(eligible, {
    sport: 'bike', family: selectionFocus, phase: selectionPhase, maxMinutes: availableMinutes, maxLevel,
  });
  const draft = drafts[selectedId] ?? (latestEvent ? { level: latestEvent.level as 1|2|3, phases: latestEvent.phases as Phase[] } : { level: 1 as const, phases: [] });
  const issues = selected ? validateWorkout(selected) : [];
  const setDraft = (next: ReviewDraft) => setDrafts(previous => ({ ...previous, [selectedId]: next }));
  const displayStep = (step: BikeWorkout['steps'][number]) => step.kind === 'steady'
    ? `${step.minutes} min @ ${step.minFtpPct}–${step.maxFtpPct}% FTP · ${step.label}${step.cadenceRpm ? ` · ${step.cadenceRpm.join('–')} rpm` : ''}`
    : `${step.repetitions} × ${step.work.minutes} min @ ${step.work.minFtpPct}–${step.work.maxFtpPct}% FTP; ${step.recovery.minutes} min recovery between reps`;
  return (
    <section className="panel coach-cycling-review">
      <header><h3>AZUR Cycling Session Review</h3><p>{allBikeWorkouts.length} original library templates · coach review workspace</p></header>
      <p className="coach-cycling-warning">Approval decisions are saved in an append-only coach history. Approval does not publish, schedule, or export any workout.</p>
            <div className="coach-cycling-preview" aria-label="Read-only session selection preview">
        <h4>Approved session selection preview</h4>
        <p>{eligible.length} workouts eligible from the latest coach decisions.</p>
        <p>Athlete FTP: {ftpWatts != null && ftpWatts > 0 ? `${ftpWatts} W` : 'Unavailable'}. Coach-adjustable preview for the signed-in athlete.</p>
        <div className="coach-cycling-preview-controls">
          <label>Training focus <select value={selectionFocus} onChange={e=>setSelectionFocus(e.target.value as typeof selectionFocus)}>
            <option value="threshold">Threshold</option><option value="aerobic_endurance">Aerobic endurance</option><option value="vo2max">VO₂max</option><option value="strength_endurance">Strength endurance</option><option value="race_specific">Race-specific</option>
          </select></label>
          <label>Training phase <select value={selectionPhase} onChange={e=>setSelectionPhase(e.target.value as Phase)}>
            {phases.map(p=><option key={p} value={p}>{p}</option>)}
          </select></label>
          <label>Time (min) <input type="number" min={15} max={360} value={availableMinutes} onChange={e=>setAvailableMinutes(Number(e.target.value))} /></label>
          <label>Maximum progression <select value={maxLevel} onChange={e=>setMaxLevel(Number(e.target.value) as 1|2|3)}>
            <option value={1}>Foundation</option><option value={2}>Development</option><option value={3}>Advanced</option>
          </select></label>
        </div>
        <strong>{ftpWatts == null || ftpWatts <= 0 ? 'Valid athlete FTP required before power-target recommendations' : preview.status === 'selected' ? preview.session.title : preview.reason}</strong>
        <small>No athlete assignment, calendar change, or device export takes place.</small>
      </div>
<div className="coach-cycling-columns">
        <div className="coach-cycling-list" aria-label="Cycling workout catalogue">
          {allBikeWorkouts.map(workout => (
            <button type="button" key={workout.id} className={workout.id === selectedId ? 'is-selected' : ''}
              onClick={() => setSelectedId(workout.id)}>
              <strong>{workout.title}</strong><small>{familyName(workout.family)} · {workoutMinutes(workout)} min · {workout.status}</small>
            </button>
          ))}
        </div>
        {selected && <div className="coach-cycling-detail">
          <h4>{selected.title}</h4>
          <p>{selected.purpose}</p>
          <small>ID: {selected.id} · v{selected.version} · {selected.status}</small>
          <h5>Coach-authored prescription</h5>
          <ol>{selected.steps.map((step,index) => <li key={index}>{displayStep(step)}</li>)}</ol>
          <p>{issues.length ? `Validation issues: ${issues.join('; ')}` : 'Template structure passes existing library validation.'}</p>
          <h5>Draft progression classification</h5>
          <label>Level <select value={draft.level} onChange={event => setDraft({ ...draft, level: Number(event.target.value) as 1 | 2 | 3 })}>
            <option value={1}>1 · Foundation</option><option value={2}>2 · Development</option><option value={3}>3 · Advanced</option>
          </select></label>
          <fieldset><legend>Suitable training phases</legend>
            {phases.map(phase => <label key={phase}><input type="checkbox" checked={draft.phases.includes(phase)}
              onChange={event => setDraft({ ...draft, phases: event.target.checked ? [...draft.phases, phase] : draft.phases.filter(p => p !== phase) })} /> {phase}</label>)}
          </fieldset>
          <p>Latest decision: {latestEvent ? `${latestEvent.decision} · ${new Date(latestEvent.decided_at).toLocaleString()}` : 'No approval recorded'}</p>
          <div className="coach-cycling-actions">
            <button type="button" disabled={saving || issues.length>0 || !draft.phases.length} onClick={()=>void recordDecision('approved')}>Approve classification</button>
            <button type="button" disabled={saving || issues.length>0 || !draft.phases.length || latestEvent?.decision!=='approved'} onClick={()=>void recordDecision('revoked')}>Revoke approval</button>
          </div>
          {feedback && <p role="status">{feedback}</p>}
          <small>Approvals are recorded for coach review; publishing and auto-selection remain disabled pending integration.</small>
        </div>}
      </div>
    </section>
  );
}
