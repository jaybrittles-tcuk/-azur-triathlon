/**
 * Read-only matching suggestions for stored imported activities.
 * A suggestion is never authorization to complete a planned session or validate load.
 */
const validSport = value => {
  const sport = String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (['bike', 'ride', 'cycling', 'virtualride', 'indoorride', 'virtualcycling'].includes(sport)) return 'bike';
  return ['swim', 'run'].includes(sport) ? sport : null;
};
const dayOf = activity => {
  const local = activity?.raw_payload?.start_date_local ?? activity?.raw_payload?.start_date;
  const text = typeof local === 'string' && /^\d{4}-\d{2}-\d{2}/.test(local)
    ? local : activity?.start_time;
  return typeof text === 'string' ? text.slice(0, 10) : '';
};
const finitePositive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * @returns {{status:string, candidateId:string|null, candidateIds:string[], requiresConfirmation:true,
 * trainingLoadEligible:false, sessionCompleted:false}}
 */
export function suggestStoredActivityMatch(activity, plannedSessions = [], completedActivities = []) {
  const result = (status, candidateIds = [], candidateId = null) => ({
    status, candidateId, candidateIds, requiresConfirmation: true,
    trainingLoadEligible: false, sessionCompleted: false
  });
  if (!activity?.id || !activity?.athlete_id || !validSport(activity.sport) ||
      !finitePositive(activity.duration_sec) || !dayOf(activity)) return result('invalid_activity');
  if (activity.planned_session_id) return result('already_linked');
  if (activity.source !== 'intervals' || !activity.source_activity_id) return result('manual_review');
  const sourceDuplicates = completedActivities.filter(other =>
    other.id !== activity.id && other.source === activity.source &&
    other.source_activity_id === activity.source_activity_id);
  if (sourceDuplicates.length) return result('duplicate_source');
  const matches = plannedSessions.filter(plan =>
    plan?.athlete_id === activity.athlete_id &&
    validSport(plan.sport) === validSport(activity.sport) &&
    plan.planned_date === dayOf(activity) &&
    plan.is_active_version === true &&
    !plan.locked &&
    ['planned', 'edited'].includes(plan.status) &&
    finitePositive(plan.duration_min) &&
    !completedActivities.some(other => other.id !== activity.id && other.planned_session_id === plan.id)
  );
  if (!matches.length) return result('unmatched_activity');
  const candidates = matches.filter(plan =>
    Math.abs(plan.duration_min * 60 - activity.duration_sec) <=
    Math.max(900, activity.duration_sec * 0.35));
  if (candidates.length === 1) return result('candidate_match', candidates.map(p => p.id), candidates[0].id);
  if (candidates.length === 0) return result('duration_mismatch', matches.map(p => p.id));
  return result('ambiguous_session', candidates.map(p => p.id));
}
