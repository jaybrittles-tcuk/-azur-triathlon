import { useMemo, useState } from 'react';
import { allBikeWorkouts } from '../domain/bikeWorkoutCatalog';
import { validateWorkout, workoutMinutes } from '../domain/bikeWorkoutLibrary';
import type { BikeWorkout } from '../domain/bikeWorkoutLibrary';

const phases = ['base', 'build', 'peak', 'taper', 'recovery'] as const;
type Phase = typeof phases[number];
type ReviewDraft = { level: 1 | 2 | 3; phases: Phase[] };
const familyName = (family: string) => family.replaceAll('_', ' ');

export default function CoachCyclingLibraryReview() {
  const [selectedId, setSelectedId] = useState(allBikeWorkouts[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const selected = useMemo(() => allBikeWorkouts.find(w => w.id === selectedId), [selectedId]);
  const draft = drafts[selectedId] ?? { level: 1 as const, phases: [] };
  const issues = selected ? validateWorkout(selected) : [];
  const setDraft = (next: ReviewDraft) => setDrafts(previous => ({ ...previous, [selectedId]: next }));
  const displayStep = (step: BikeWorkout['steps'][number]) => step.kind === 'steady'
    ? `${step.minutes} min @ ${step.minFtpPct}–${step.maxFtpPct}% FTP · ${step.label}${step.cadenceRpm ? ` · ${step.cadenceRpm.join('–')} rpm` : ''}`
    : `${step.repetitions} × ${step.work.minutes} min @ ${step.work.minFtpPct}–${step.work.maxFtpPct}% FTP; ${step.recovery.minutes} min recovery between reps`;
  return (
    <section className="panel coach-cycling-review">
      <header><h3>AZUR Cycling Session Review</h3><p>{allBikeWorkouts.length} original library templates · coach review workspace</p></header>
      <p className="coach-cycling-warning">Draft classifications stay on this screen only. No approval, database update, athlete scheduling or Garmin export occurs here.</p>
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
          <small>Review draft only — classification has not been saved or authorised for athlete use.</small>
        </div>}
      </div>
    </section>
  );
}
