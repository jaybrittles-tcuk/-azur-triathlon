/** Suggests a planned-workout match; does not change completion or training load. */
import { classifyEnduranceSport } from './intervalsBackgroundImport.mjs';
export function suggestPlannedMatch(activity, planned = []) {
 const sport = classifyEnduranceSport(activity?.type);
 const start = Date.parse(String(activity?.start_date ?? ''));
 const duration = Number(activity?.elapsed_time ?? activity?.moving_time);
 if (!sport || !Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return {status:'invalid'};
 const day = String(activity?.start_date_local ?? activity?.start_date ?? '').slice(0,10);
 const candidates = planned.filter(p => String(p.planned_date) === day &&
   String(p.sport).toLowerCase() === sport && p.is_active_version === true &&
   !['completed','skipped','cancelled'].includes(String(p.status).toLowerCase()));
 const scored = candidates.map(p => {
   const expected = Number(p.duration_sec ?? (Number(p.duration_minutes) * 60));
   if (!Number.isFinite(expected) || expected <= 0) return null;
   const ratio = Math.abs(duration - expected) / expected;
   if (ratio > .35) return null;
   return {id:p.id,score:Math.max(0,1-ratio),duration_difference_pct:Math.round(ratio*100)};
 }).filter(Boolean).sort((a,b)=>b.score-a.score);
 if (!scored.length) return {status:'unmatched'};
 if (scored.length > 1 && scored[0].score-scored[1].score < .15) return {status:'ambiguous',candidates:scored};
 return {status:scored[0].score>=.85?'suggested':'review',candidate:scored[0]};
}
