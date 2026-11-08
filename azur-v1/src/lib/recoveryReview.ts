/** AZUR Recovery Intelligence V1: conservative, deterministic coach-review signal.
 * Pure calculation only. Never publishes or changes training sessions.
 * Device observations and athlete reports remain separate evidence streams.
 */
export type DeviceLoadEvidence = {
  recentDurationHours: number | null;
  previousDurationHours: number | null;
  recentSessionCount: number;
  previousSessionCount: number;
};
export type AthleteRecoveryReport = {
  fatigue: number | null; // 1 (low) to 5 (high)
  soreness: number | null; // 1 (low) to 5 (high)
  perceivedSleep: number | null; // 1 (poor) to 5 (good)
  reportedAt: string | null;
};
export type RecoveryReview = {
  status: 'insufficient_evidence' | 'review_recommended' | 'no_volume_alert';
  reasons: string[];
  deviceEvidence: DeviceLoadEvidence;
  athleteEvidence: AthleteRecoveryReport | null;
  coachApprovalRequired: true;
  automaticPlanChange: false;
};
const validScore = (n: number | null): n is number =>
  n !== null && Number.isInteger(n) && n >= 1 && n <= 5;
const validHours = (n: number | null): n is number =>
  n !== null && Number.isFinite(n) && n >= 0;
export function assessRecoveryForCoach(
  device: DeviceLoadEvidence,
  athlete: AthleteRecoveryReport | null,
): RecoveryReview {
  const reasons: string[] = [];
  const enough = device.recentSessionCount >= 2 &&
    device.previousSessionCount >= 2 &&
    validHours(device.recentDurationHours) &&
    validHours(device.previousDurationHours) &&
    device.previousDurationHours > 0;
  if (!enough) reasons.push('Insufficient recorded activity in both seven-day windows; volume trend unavailable.');
  else {
    const change = (device.recentDurationHours! / device.previousDurationHours! - 1) * 100;
    if (change > 25) reasons.push('Recorded duration rose by more than 25%; check athlete response and import coverage.');
    if (change < -25) reasons.push('Recorded duration fell by more than 25%; check missed sessions and import coverage.');
  }
  if (athlete) {
    if (validScore(athlete.fatigue) && athlete.fatigue >= 4) reasons.push('Athlete reports high fatigue.');
    if (validScore(athlete.soreness) && athlete.soreness >= 4) reasons.push('Athlete reports high soreness.');
    if (validScore(athlete.perceivedSleep) && athlete.perceivedSleep <= 2) reasons.push('Athlete reports poor perceived sleep.');
  }
  const concern = reasons.some(r => !r.startsWith('Insufficient'));
  return {
    status: concern ? 'review_recommended' : enough ? 'no_volume_alert' : 'insufficient_evidence',
    reasons,
    deviceEvidence: { ...device },
    athleteEvidence: athlete ? { ...athlete } : null,
    coachApprovalRequired: true,
    automaticPlanChange: false,
  };
}
