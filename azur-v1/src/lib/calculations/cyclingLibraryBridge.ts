import { allBikeWorkouts } from '../../domain/bikeWorkoutCatalog';
import { validateWorkout, workoutMinutes } from '../../domain/bikeWorkoutLibrary';
import type { WorkoutFamily } from '../../domain/bikeWorkoutLibrary';
import type { SessionEntry, SessionFamily } from './sessionSelection';

const familyMap: Record<WorkoutFamily, SessionFamily> = {
  aerobic_foundation: 'aerobic_endurance',
  aerobic_development: 'aerobic_endurance',
  tempo: 'aerobic_endurance',
  sweet_spot: 'threshold',
  threshold: 'threshold',
  vo2_short: 'vo2max',
  vo2_long: 'vo2max',
  big_gear: 'strength_endurance',
  strength_endurance: 'strength_endurance',
  durability: 'race_specific',
  race_specific: 'race_specific',
};

export type CoachBikeApproval = {
  level: 1 | 2 | 3;
  phases: SessionEntry['phases'];
};

/** The original candidate library remains unpublished.
 * An explicit coach-authored approval record is required before selection.
 * This bridge never writes to the calendar or exports workouts.
 */
export function approvedCyclingSelections(
  approvals: Readonly<Record<string, CoachBikeApproval>>,
): SessionEntry[] {
  return allBikeWorkouts.flatMap((workout) => {
    const approval = approvals[workout.id];
    if (!approval || validateWorkout(workout).length || !approval.phases.length ||
        ![1, 2, 3].includes(approval.level) ||
        !approval.phases.every(phase => ['base','build','peak','taper','recovery'].includes(phase))) return [];
    return [{
      id: workout.id,
      sport: 'bike' as const,
      family: familyMap[workout.family],
      title: workout.title,
      durationMin: workoutMinutes(workout),
      level: approval.level,
      phases: [...approval.phases],
      // Retain original coach-authored interval structure and cadence.
      prescription: workout.steps,
      approved: true,
    }];
  });
}
