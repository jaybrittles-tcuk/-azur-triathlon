import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';

export default function CalendarIntensityProfile({ steps }: { steps: unknown }) {
  const intervals = normalizeWorkoutIntervals(steps);
  if (!intervals.length || intervals.length > 60 || intervals.some((step) => step.durationSec === null)) return null;
  const total = intervals.reduce((sum, step) => sum + (step.durationSec ?? 0), 0);
  const targets = intervals.map((step) => step.target).filter((target) => target !== null);
  if (!total || targets.length !== intervals.length) return null;
  const metric = targets[0].metric;
  if (!targets.every((target) => target.metric === metric)) return null;
  const values = targets.map((target) => (target.low + target.high) / 2);
  const isPace = metric === 'pace_sec_per_km' || metric === 'swim_pace_sec_per_100m';
  const performance = values.map((value) => isPace ? 1 / value : value);
  if (performance.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const min = Math.min(...performance);
  const max = Math.max(...performance);
  const span = max - min;
  return (
    <div className="calendar-intensity-profile">
      <div className="calendar-intensity-profile-head">
        <strong>Prescribed intensity</strong>
        <span>{targets[0].unit} · relative scale</span>
      </div>
      <div className="calendar-intensity-bars" role="img"
        aria-label={`Workout intensity profile: ${intervals.length} timed segments; relative bar heights compare ${targets[0].unit} within this workout`}>
        {intervals.map((part, index) => {
          const height = span === 0 ? 62 : 20 + 80 * (performance[index] - min) / span;
          return (
            <span key={index}
              className={`calendar-intensity-bar ${part.kind}`}
              style={{ flexGrow: part.durationSec ?? 0, flexBasis: 0, height: `${height}%`, minWidth: 2 }}
              title={`${part.kind}: ${Math.round((part.durationSec ?? 0) / 60 * 10) / 10} min · ${targets[index].low}–${targets[index].high} ${targets[index].unit}`}
            />
          );
        })}
      </div>
      <small>Widths = duration · Heights = relative prescribed target (not measured performance)</small>
    </div>
  );
}
