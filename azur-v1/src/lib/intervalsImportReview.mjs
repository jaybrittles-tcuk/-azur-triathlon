/**
 * AZUR Intervals read-only candidate review.
 * This module NEVER writes activities, changes plan status, or awards training load.
 * All comparisons are hints requiring coach/athlete confirmation.
 */
const numeric = value => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const sportName = value => ['bike','cycling','ride','virtualride','indoorride','virtualcycling'].includes(String(value ?? '').toLowerCase().replace(/[^a-z]/g,'')) ? 'bike' : String(value ?? '').toLowerCase();

export function reviewIntervalsActivity(activity, existingActivities = [], plannedSessions = []) {
  const id = activity?.id == null ? '' : String(activity.id);
  const startText = String(activity?.start_date ?? activity?.start_date_local ?? '');
  const start = Date.parse(startText);
  const duration = numeric(activity?.elapsed_time ?? activity?.moving_time);
  const distance = numeric(activity?.distance);
  const isBike = sportName(activity?.type) === 'bike';
  const exact = Boolean(id) && existingActivities.some(e =>
    String(e.source ?? '').toLowerCase() === 'intervals' && String(e.source_activity_id ?? '') === id);
  const overlaps = existingActivities.filter(e => {
    if (sportName(e.sport) !== 'bike' || !Number.isFinite(start) || duration === null) return false;
    const otherStart = Date.parse(String(e.start_time ?? ''));
    const otherDuration = numeric(e.duration_sec);
    const otherDistance = numeric(e.distance_m);
    if (!Number.isFinite(otherStart) || otherDuration === null) return false;
    const closeTime = Math.abs(otherStart - start) <= 10 * 60_000;
    const closeDuration = Math.abs(otherDuration - duration) <= Math.max(120, duration * .06);
    const comparableDistance = distance !== null && distance > 0 && otherDistance !== null && otherDistance > 0;
    const closeDistance = !comparableDistance || Math.abs(otherDistance - distance) <= Math.max(750, distance * .05);
    return closeTime && closeDuration && closeDistance;
  });
  const eligiblePlanCandidates = plannedSessions.filter(p => {
    if (!isBike || !p.is_active_version || sportName(p.sport) !== 'bike') return false;
    if (p.status === 'completed' || p.status === 'cancelled' || p.status === 'skipped') return false;
    const date = String(p.planned_date ?? '');
    // Local start is authoritative for training calendar day when available.
    const day = String(activity.start_date_local ?? activity.start_date ?? '').slice(0,10);
    return day && date === day;
  }).map(p => ({id:p.id,title:p.title,plannedDate:p.planned_date,plannedDurationMin:p.duration_min}));
  let status = 'review_required';
  if (exact) status = 'already_imported';
  else if (overlaps.length) status = 'possible_duplicate';
  else if (!id || !isBike || !Number.isFinite(start) || duration === null || duration <= 0) status = 'invalid_activity';
  else if (eligiblePlanCandidates.length === 1) status = 'candidate_match';
  else if (eligiblePlanCandidates.length > 1) status = 'ambiguous_session';
  else status = 'unmatched_activity';
  return {
    sourceId:id, status, alreadyImported:exact,
    possibleCrossPlatformDuplicate:overlaps.length > 0,
    possibleDuplicateCount:overlaps.length,
    sessionCandidates:eligiblePlanCandidates,
    proposedPlannedSessionId:eligiblePlanCandidates.length === 1 && !exact && !overlaps.length ? eligiblePlanCandidates[0].id : null,
    reviewRequired:true, safeToAutoImport:false,
    trainingLoadEligible:false,
    reason:status === 'already_imported' ? 'Same Intervals source ID already exists'
      : status === 'possible_duplicate' ? 'Similar existing ride requires human review'
      : status === 'candidate_match' ? 'One planned ride is a candidate; confirmation required'
      : status === 'ambiguous_session' ? 'Multiple planned rides on the same day'
      : status === 'unmatched_activity' ? 'No matching planned ride; do not mark completed'
      : 'Activity needs manual validation'
  };
}
