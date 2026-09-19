export type Sport = 'swim' | 'bike' | 'run';
export type SessionStatus = 'planned' | 'edited' | 'completed' | 'missed' | 'cancelled';
export type ReadinessColor = 'green' | 'amber' | 'red';
export type PlanDecision = 'progress_load' | 'hold_load' | 'reduce_load' | 'change_stimulus';
export type DecisionOutcome = 'accepted' | 'rejected' | 'pending';

export interface AthleteProfile {
  id: string;
  displayName: string;
  ftpW: number;
  runThresholdSecPerKm: number;
  swimThresholdSecPer100m: number;
  weightKg: number;
  targetWeightKg?: number;
  normalWeeklyHours?: number;
  peakWeeklyHours?: number;
  timezone: string;
}

export interface SeasonWeek {
  id: string;
  weekStart: string;
  phase: string;
  targetHours: number;
  benchmarkWeek: boolean;
  locked: boolean;
  raceFocusId?: string;
}

export interface PlannedSession {
  id: string;
  seasonWeekId: string;
  plannedDate: string;
  sport: Sport;
  title: string;
  sessionClass: 'intensity' | 'endurance' | 'race_specific' | 'benchmark' | 'easy';
  priority: 1 | 2 | 3;
  durationMin: number;
  targets: Record<string, unknown>;
  prescription: Record<string, unknown>;
  rationale?: string;
  terrain?: string;
  status: SessionStatus;
  locked: boolean;
  version: number;
  parentSessionId?: string;
}

export interface CompletedActivity {
  id: string;
  plannedSessionId?: string;
  sport: Sport;
  source: string;
  sourceActivityId?: string;
  startTime: string;
  durationSec: number;
  distanceM?: number;
  rawPayload: Record<string, unknown>;
  processedMetrics: Record<string, unknown>;
  matchConfidence?: number;
  sessionRpe?: number;
  notes?: string;
}
