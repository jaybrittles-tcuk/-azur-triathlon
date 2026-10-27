import { estimatePlannedStress } from '../lib/calculations/plannedStress';
import { estimatePlannedRunStress } from '../lib/calculations/plannedRunStress';
import { estimatePlannedSwimStress } from '../lib/calculations/plannedSwimStress';

type Plan = { sport: string; status: string; prescription: Record<string, unknown> };
type Props = { sessions: Plan[]; runThreshold: number | null; swimCss: number | null };
type Sport = 'bike' | 'run' | 'swim';

export default function MultisportPlannedStress({ sessions, runThreshold, swimCss }: Props) {
  const sports: Array<{ sport: Sport; label: string; method: string }> = [
    { sport: 'swim', label: 'Swim', method: 'CSS pace proxy' },
    { sport: 'bike', label: 'Bike', method: 'FTP interval proxy' },
    { sport: 'run', label: 'Run', method: 'Threshold pace proxy' },
  ];
  return (
    <section className="panel calendar-multisport-stress" aria-label="Estimated planned training stress by sport">
      <div className="calendar-stress-heading">
        <strong>Planned multisport stress</strong>
        <small>Experimental estimates · not a combined load score</small>
      </div>
      <div className="calendar-stress-sports">
        {sports.map(({ sport, label, method }) => {
          const planned = sessions.filter(s => s.sport === sport && ['planned', 'edited'].includes(s.status));
          const outcomes = planned.map(s =>
            sport === 'bike' ? estimatePlannedStress({ sport, prescription: s.prescription }) :
            sport === 'run' ? estimatePlannedRunStress(s.prescription, runThreshold) :
            estimatePlannedSwimStress(s.prescription, swimCss));
          const valid = outcomes.filter(o => o.status === 'estimated');
          const points = valid.reduce((sum, result) => sum + (result.status === 'estimated' ? result.points : 0), 0);
          return (
            <div key={sport} className="calendar-stress-sport">
              <span>{label}</span>
              <strong>{planned.length > 0 && valid.length === planned.length ? points.toFixed(1) : '—'}</strong>
              <small>{method} · {valid.length}/{planned.length} sessions estimated</small>
              {valid.length !== planned.length && <small>Incomplete coverage — no full-sport total</small>}
            </div>
          );
        })}
      </div>
      <small>Each score uses a different sport-specific method. Do not add scores together or interpret as future fatigue or injury risk.</small>
    </section>
  );
}
