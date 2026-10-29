import { auditAthleteInstructions } from '../lib/calculations/prescriptionAudit';
import { createLibraryBikePrescription } from '../lib/calculations/libraryBikePrescription';
import { previewApprovedBikeWorkout } from '../lib/calculations/bikeDraftPreview';
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
// Fail closed until end-to-end scheduling acceptance checks pass.
const coachSchedulingEnabled = import.meta.env.VITE_ENABLE_COACH_SCHEDULING === 'true';

export default function CoachCyclingLibraryReview({ ftpWatts, athleteName, athleteWeeklyHours }: { ftpWatts: number | null; athleteName: string | null; athleteWeeklyHours: number | null }) {
  const [availableMinutes, setAvailableMinutes] = useState(90);
  const [searchTerm,setSearchTerm]=useState('');
  const [showFullCatalogue,setShowFullCatalogue]=useState(false);
  const [selectionPhase, setSelectionPhase] = useState<Phase>('build');
  const [selectionFocus, setSelectionFocus] = useState<'threshold'|'aerobic_endurance'|'vo2max'|'strength_endurance'|'race_specific'>('threshold');
  const [maxLevel, setMaxLevel] = useState<1|2|3>(2);
  const [events, setEvents] = useState<Array<{id:string;workout_id:string;workout_version:number;decision:'approved'|'revoked';level:number;phases:string[];decided_at:string}>>([]);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState('');
  useEffect(() => {
    void supabase.from('coach_workout_approval_event')
      .select('id,workout_id,workout_version,decision,level,phases,decided_at')
      .order('decided_at',{ascending:false})
      .then(({data,error}) => {if(error) setFeedback(error.message); else setEvents(data??[]);});
  }, []);
  async function recordDecision(decision:'approved'|'revoked') {
    if (!selected || saving || !draft.phases.length || issues.length || !instructionAudit?.complete) return;
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
  async function confirmSchedule() {
    if (!coachSchedulingEnabled) { setScheduleMessage('Calendar scheduling is not yet enabled for beta.'); return; }
    // This legacy save route targets the logged-in account, not the selected athlete.
    // Fail closed until an assignment-verified coach scheduling API replaces it.
    setScheduleMessage('Assigned-athlete scheduling requires an authorised server workflow.'); return;
    if (!personalisedDraft || !scheduleDate || scheduleSaving || preview.status !== 'selected') return;
    setScheduleSaving(true); setScheduleMessage('');
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate) ||
        new Date(scheduleDate + 'T12:00:00').toISOString().slice(0,10) !== scheduleDate) {
        throw new Error('Select a valid calendar date.');
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.app_metadata?.role !== 'coach') throw new Error('Verified coach login required.');
      const { data: athlete, error: athleteError } = await supabase.from('athlete_profile')
        .select('id').eq('user_id', user.id).single();
      if (athleteError || !athlete) throw new Error('Signed-in athlete profile unavailable.');
      // Re-fetch decisions before writing; local approval state may be stale or revoked.
      const { data: freshEvents, error: approvalError } = await supabase.from('coach_workout_approval_event')
        .select('id,workout_id,workout_version,decision,level,phases,decided_at').order('decided_at',{ascending:false});
      if (approvalError) throw approvalError;
      const current = resolveCurrentBikeApprovals(freshEvents ?? []);
      const stillApproved = current.some(entry => entry.id === personalisedDraft.workoutId);
      if (!stillApproved) throw new Error('Approval has changed; review the workout again.');
      const monday = new Date(scheduleDate + 'T12:00:00');
      monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
      const weekKey = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
      const { data: weeks, error: weekError } = await supabase.from('season_week')
        .select('id,locked').eq('athlete_id',athlete.id).eq('week_start',weekKey).limit(2);
      if (weekError) throw weekError;
      if (weeks?.length !== 1 || weeks[0].locked) throw new Error('An unlocked existing training week is required.');
      const { data: existing, error: checkError } = await supabase.from('planned_session')
        .select('id').eq('athlete_id',athlete.id).eq('planned_date',scheduleDate)
        .eq('is_active_version',true).limit(1);
      if (checkError) throw checkError;
      if (existing?.length) throw new Error('There is already a planned session on this date. No changes made.');
      const { error: insertError } = await supabase.from('planned_session').insert({
        athlete_id:athlete.id,season_week_id:weeks[0].id,planned_date:scheduleDate,
        sport:'bike',title:personalisedDraft.title,session_class:'intensity',priority:2,
        duration_min:Math.round(personalisedDraft.durationMin),
        targets:{ ftpWatts, source:'azur-workout-library' },
        prescription:createLibraryBikePrescription(personalisedDraft, ftpWatts!),
        rationale:personalisedDraft.purpose,status:'planned',locked:false,version:1,is_active_version:true,
      });
      if (insertError) throw insertError;
      setScheduleMessage('Workout saved to the signed-in athlete calendar. Refresh the calendar to view it.');
    } catch (error) {
      setScheduleMessage(error instanceof Error ? error.message : 'Unable to schedule workout.');
    } finally { setScheduleSaving(false); }
  }

  const [selectedId, setSelectedId] = useState(allBikeWorkouts[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const selected = useMemo(() => allBikeWorkouts.find(w => w.id === selectedId), [selectedId]);
  const visibleWorkouts=useMemo(()=>{const query=searchTerm.toLowerCase().trim();const matches=allBikeWorkouts.filter(w=>!query || `${w.title} ${w.family} ${w.purpose}`.toLowerCase().includes(query));return showFullCatalogue||query?matches:matches.slice(0,3)},[searchTerm,showFullCatalogue]);
  const latestEvent = events.find(event=>event.workout_id===selectedId);
  const eligible = resolveCurrentBikeApprovals(events);
  const preview = selectCoachSession(eligible, {
    sport: 'bike', family: selectionFocus, phase: selectionPhase, maxMinutes: availableMinutes, maxLevel,
  });
  const personalisedDraft = preview.status === 'selected' && ftpWatts != null ? previewApprovedBikeWorkout(preview.session, ftpWatts) : null;
  const draft = drafts[selectedId] ?? (latestEvent ? { level: latestEvent.level as 1|2|3, phases: latestEvent.phases as Phase[] } : { level: 1 as const, phases: [] });
  const issues = selected ? validateWorkout(selected) : [];
  const instructionAudit = useMemo(() => selected ? auditAthleteInstructions({
    azurWorkout: {steps: selected.steps.map(step => step.kind === 'steady'
      ? {type:'work',durationMin:step.minutes,targetType:'ftp',targetLow:step.minFtpPct,targetHigh:step.maxFtpPct}
      : {type:'repeat',reps:step.repetitions,
        work:{type:'work',durationMin:step.work.minutes,targetType:'ftp',targetLow:step.work.minFtpPct,targetHigh:step.work.maxFtpPct},
        recovery:{type:'recovery',durationMin:step.recovery.minutes,targetType:'ftp',targetLow:step.recovery.minFtpPct,targetHigh:step.recovery.maxFtpPct}})}
  }) : null,[selected]);
  const setDraft = (next: ReviewDraft) => setDrafts(previous => ({ ...previous, [selectedId]: next }));
  const displayStep = (step: BikeWorkout['steps'][number]) => step.kind === 'steady'
    ? `${step.minutes} min @ ${step.minFtpPct}–${step.maxFtpPct}% FTP · ${step.label}${step.cadenceRpm ? ` · ${step.cadenceRpm.join('–')} rpm` : ''}`
    : `${step.repetitions} × ${step.work.minutes} min @ ${step.work.minFtpPct}–${step.work.maxFtpPct}% FTP; ${step.recovery.minutes} min recovery between reps`;
  return (
    <section className="panel coach-cycling-review azur-library-v2">
      <header><span className="azur-coach-eyebrow">AZUR / COACH WORKSPACE</span><h3>Cycling Session Review</h3><p>{allBikeWorkouts.length} coach-authored templates · select, inspect and classify</p></header>
      <p className="coach-cycling-warning">Coach decisions are recorded for review only. No automatic publishing, scheduling or Garmin export.</p>
            <details className={"coach-cycling-preview azur-library-preview"+(eligible.length===0?" azur-library-preview-empty":"")} aria-label="Read-only session selection preview"><summary>Approved workout selection preview <span>{eligible.length} eligible</span></summary>
        <h4>Approved session selection preview</h4>
        <p>{eligible.length} workouts eligible from the latest coach decisions.</p>
        <p>Selected athlete: {athleteName ?? 'None selected'} · FTP: {ftpWatts != null && ftpWatts > 0 ? `${ftpWatts} W` : 'Unavailable'}. Weekly training baseline: {athleteWeeklyHours == null ? 'Not recorded' : `${athleteWeeklyHours} hours`}. Coach-adjustable preview for the selected athlete.</p>
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
        <strong>{ftpWatts == null || ftpWatts <= 0 ? 'Select an assigned athlete with a valid FTP benchmark to preview power targets' : preview.status === 'selected' ? preview.session.title : preview.reason}</strong>
        {personalisedDraft && (
          <div className="coach-cycling-draft">
            <h5>FTP-personalised workout draft · review only</h5>
            <p>{personalisedDraft.title} · {personalisedDraft.durationMin} min · {personalisedDraft.purpose}</p>
            <ol>{personalisedDraft.steps.map((step,index) => (
              <li key={index}>{step.kind === 'steady'
                ? `${step.minutes} min · ${step.powerWatts[0]}–${step.powerWatts[1]} W · ${step.label}`
                : `${step.repetitions} × ${step.work.minutes} min · ${step.work.powerWatts[0]}–${step.work.powerWatts[1]} W; ${step.recovery.minutes} min recovery at ${step.recovery.powerWatts[0]}–${step.recovery.powerWatts[1]} W`}
              </li>
            ))}</ol>
          </div>
        )}
        {personalisedDraft && <div className="coach-cycling-schedule">
          <label>Schedule for signed-in athlete <input aria-label="Workout date" type="date" value={scheduleDate} onChange={e=>setScheduleDate(e.target.value)} /></label>
          <button type="button" disabled={!coachSchedulingEnabled || !scheduleDate || scheduleSaving} onClick={()=>void confirmSchedule()}>{scheduleSaving?'Saving…':'Confirm and add to calendar'}</button>
          <small>{coachSchedulingEnabled ? 'Uses an existing unlocked training week. Refuses to overwrite an existing workout.' : 'Scheduling disabled pending acceptance testing; workout preview remains available.'}</small>
          {scheduleMessage && <p role="status">{scheduleMessage}</p>}
        </div>}
        <small>Nothing is added until a verified coach confirms. Garmin export remains disabled.</small>
      </details>
<div className="coach-cycling-columns">
        <div className="azur-library-catalogue"><div className="azur-library-catalogue-head"><h4>Candidate sessions</h4><span>{allBikeWorkouts.length} templates</span></div><label className="azur-library-search">Find session <input type="search" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search by name or training focus" /></label><div className="coach-cycling-list" aria-label="Cycling workout catalogue">
          {visibleWorkouts.map(workout => (
            <button type="button" key={workout.id} className={workout.id === selectedId ? 'is-selected' : ''}
              onClick={() => {setSelectedId(workout.id);setShowFullCatalogue(false)}} aria-pressed={workout.id === selectedId}>
              <span className="azur-library-row-content"><strong>{workout.title}</strong><small>{familyName(workout.family)} · {workoutMinutes(workout)} min · {workout.status}</small></span><span className="azur-library-row-arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </div>{!searchTerm&&allBikeWorkouts.length>3&&<button className="azur-library-more" type="button" onClick={()=>setShowFullCatalogue(v=>!v)}>{showFullCatalogue?"Show fewer sessions":"Browse all "+allBikeWorkouts.length+" sessions"}</button>}</div>
        {selected && <div className="coach-cycling-detail">
          <div className="azur-library-selected-head"><div><span className="azur-coach-eyebrow">SELECTED WORKOUT</span><h4>{selected.title}</h4></div><span className="azur-library-status">{latestEvent?.decision==="approved"?"Approved":selected.status}</span></div>
          <p>{selected.purpose}</p>
          <small>ID: {selected.id} · v{selected.version} · {selected.status}</small>
          <h5>Prescription blocks</h5>
          <ol className="azur-library-steps">{selected.steps.map((step,index) => <li key={index}><span>{index+1}</span><p>{displayStep(step)}</p></li>)}</ol>
          <p>{issues.length ? `Validation issues: ${issues.join('; ')}` : 'Template structure passes existing library validation.'}</p>
          <div className="coach-prescription-audit" role="status">
            <strong>{instructionAudit?.complete ? 'Athlete instructions complete' : 'Athlete instructions need review'}</strong>
            <small>Checks each block for duration, an explicit intensity target and recovery between repeated efforts. This does not replace coach approval.</small>
            {!!instructionAudit?.gaps.length && <ul>{instructionAudit.gaps.map((gap,i) => <li key={i}>{gap.section} · block {gap.block}: missing {gap.missing.replaceAll('_',' ')}</li>)}</ul>}
          </div>
          <h5>Coach classification</h5>
          <label>Level <select value={draft.level} onChange={event => setDraft({ ...draft, level: Number(event.target.value) as 1 | 2 | 3 })}>
            <option value={1}>1 · Foundation</option><option value={2}>2 · Development</option><option value={3}>3 · Advanced</option>
          </select></label>
          <fieldset><legend>Suitable training phases</legend>
            {phases.map(phase => <label key={phase}><input type="checkbox" checked={draft.phases.includes(phase)}
              onChange={event => setDraft({ ...draft, phases: event.target.checked ? [...draft.phases, phase] : draft.phases.filter(p => p !== phase) })} /> {phase}</label>)}
          </fieldset>
          <p>Latest decision: {latestEvent ? `${latestEvent.decision} · ${new Date(latestEvent.decided_at).toLocaleString()}` : 'No approval recorded'}</p>
          <div className="coach-cycling-actions">
            <button type="button" disabled={saving || issues.length>0 || !instructionAudit?.complete || !draft.phases.length} onClick={()=>void recordDecision('approved')}>{saving?"Saving…":"Approve classification"}</button>
            <button type="button" disabled={saving || issues.length>0 || !draft.phases.length || latestEvent?.decision!=='approved'} onClick={()=>void recordDecision('revoked')}>Revoke approval</button>
          </div>
          {feedback && <p role="status">{feedback}</p>}
          <small>Approvals are recorded for coach review; publishing and auto-selection remain disabled pending integration.</small>
        </div>}
      </div>
    </section>
  );
}
