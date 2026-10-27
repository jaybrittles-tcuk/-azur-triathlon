import { approvedCyclingSelections } from './cyclingLibraryBridge.ts';
import type { CoachBikeApproval } from './cyclingLibraryBridge.ts';
import { allBikeWorkouts } from '../../domain/bikeWorkoutCatalog';

export type ApprovalEvent = {
  id: string;
  workout_id: string;
  workout_version: number;
  decision: 'approved' | 'revoked';
  level: number;
  phases: string[];
  decided_at: string;
};
/** Resolve the latest recorded decision, not the latest approval. Revocations win.
 * Fail closed for unknown IDs, mismatched versions, bad classifications and missing records.
 */
export function resolveCurrentBikeApprovals(events: readonly ApprovalEvent[]) {
  const known = new Map(allBikeWorkouts.map(workout => [workout.id, workout.version]));
  const ordered = [...events].sort((a,b) =>
    b.decided_at.localeCompare(a.decided_at) || b.id.localeCompare(a.id));
  const latest = new Map<string, ApprovalEvent>();
  for (const event of ordered) if (!latest.has(event.workout_id)) latest.set(event.workout_id, event);
  const approvals: Record<string, CoachBikeApproval> = {};
  for (const [id,event] of latest) {
    if (event.decision !== 'approved' || known.get(id) !== event.workout_version ||
        ![1,2,3].includes(event.level) || !event.phases.length ||
        !event.phases.every(p => ['base','build','peak','taper','recovery'].includes(p))) continue;
    approvals[id] = {
      level: event.level as 1|2|3,
      phases: event.phases as CoachBikeApproval['phases'],
    };
  }
  return approvedCyclingSelections(approvals);
}
