/**
 * AZUR Adaptive Decision V3 - deterministic, advisory-only triage.
 * Never infers injury, fatigue or intensity from duration and never changes a calendar.
 * Higher-risk decisions require a coach. Unknown data is not treated as green.
 */
export type EvidenceLevel = 'athlete_reported' | 'device_recorded';
export type Action = 'coach_review' | 'monitor' | 'insufficient_data';
export type Priority = 'high' | 'review' | 'none';
export type DurationObservation = {
  activity_id: string;
  athlete_id: string;
  duration_delta_pct: number;
  evidence_level: EvidenceLevel;
  severity: 'routine' | 'review' | 'high';
  observed_at: string;
};
export type DurationPattern = {
  athlete_id: string;
  signal_type: 'repeated_short_duration' | 'repeated_long_duration';
  linked_sessions: number;
  affected_sessions: number;
  reported_sessions: number;
  device_sessions: number;
  latest_observed_at: string;
};
export type Decision = {
  athlete_id: string;
  action: Action;
  priority: Priority;
  rationale: string;
  evidence: string[];
  suggested_next_step: string;
  coach_approval_required: boolean;
  confidence: 'limited' | 'moderate';
};
const validObservation = (x: DurationObservation) =>
  Number.isFinite(x.duration_delta_pct) &&
  (x.evidence_level === 'athlete_reported' || x.evidence_level === 'device_recorded') &&
  ['routine','review','high'].includes(x.severity) &&
  Number.isFinite(Date.parse(x.observed_at));
const validPattern = (p: DurationPattern) =>
  Number.isSafeInteger(p.linked_sessions) &&
  Number.isSafeInteger(p.affected_sessions) &&
  p.linked_sessions >= 3 && p.affected_sessions >= 2 &&
  p.affected_sessions <= p.linked_sessions &&
  p.affected_sessions * 2 >= p.linked_sessions &&
  Number.isFinite(Date.parse(p.latest_observed_at)) &&
  (p.signal_type === 'repeated_short_duration' || p.signal_type === 'repeated_long_duration');

export function assessAdaptiveDecision(
  athleteId: string,
  observations: DurationObservation[],
  patterns: DurationPattern[],
): Decision {
  const observed = observations.filter(o => o.athlete_id === athleteId && validObservation(o))
    .sort((a,b) => Date.parse(b.observed_at)-Date.parse(a.observed_at));
  const repeated = patterns.filter(p => p.athlete_id === athleteId && validPattern(p))
    .sort((a,b) => Date.parse(b.latest_observed_at)-Date.parse(a.latest_observed_at));
  const newest = observed[0];
  if (repeated.length) {
    const signal = repeated[0];
    return {
      athlete_id:athleteId,action:'coach_review',priority:'high',confidence:'moderate',
      rationale:signal.signal_type === 'repeated_short_duration'
        ? 'Multiple distinct sessions were shorter than planned in the previous 21 days.'
        : 'Multiple distinct sessions exceeded their planned duration in the previous 21 days.',
      evidence:[`${signal.affected_sessions} of ${signal.linked_sessions} linked sessions qualify`,
        `${signal.reported_sessions} athlete-reported; ${signal.device_sessions} device-recorded`],
      suggested_next_step:'Review schedule constraints, recovery context and goals. A significant calendar adjustment requires coach approval.',
      coach_approval_required:true
    };
  }
  if (newest?.severity === 'high') {
    return {
      athlete_id:athleteId,action:'coach_review',priority:'high',confidence:'limited',
      rationale:'The latest completed session has a substantial duration discrepancy.',
      evidence:[`Duration difference ${newest.duration_delta_pct.toFixed(1)}%`,newest.evidence_level === 'athlete_reported' ? 'Athlete-reported duration; intensity not verified' : 'Device-recorded duration; interval execution not assessed'],
      suggested_next_step:'Ask for session context. Do not infer fatigue or automatically replace missed training.',
      coach_approval_required:true
    };
  }
  if (newest?.severity === 'review') {
    return {
      athlete_id:athleteId,action:'coach_review',priority:'review',confidence:'limited',
      rationale:'A notable duration deviation requires context before adjusting training.',
      evidence:[`Duration difference ${newest.duration_delta_pct.toFixed(1)}%`,newest.evidence_level],
      suggested_next_step:'Review the athlete response and any recent similar sessions. Leave the plan unchanged until understood.',
      coach_approval_required:true
    };
  }
  if (observed.length >= 3 && observed.slice(0,3).every(o=>o.severity==='routine')) {
    return {
      athlete_id:athleteId,action:'monitor',priority:'none',confidence:'limited',
      rationale:'The three latest linked workouts have no duration exception.',
      evidence:['Three recent duration observations only; intensity and recovery are not established'],
      suggested_next_step:'Continue routine monitoring. Do not interpret this as evidence of adequate recovery.',
      coach_approval_required:false
    };
  }
  return {
    athlete_id:athleteId,action:'insufficient_data',priority:'none',confidence:'limited',
    rationale:'Not enough reliable linked training history for a routine coaching recommendation.',
    evidence:[`${observed.length} valid duration observation(s); at least 3 routine observations needed`],
    suggested_next_step:'Keep the existing plan and gather more verified training and athlete feedback.',
    coach_approval_required:false
  };
}
