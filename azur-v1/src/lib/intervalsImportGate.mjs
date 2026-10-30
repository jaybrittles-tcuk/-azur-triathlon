/**
 * Pure safety gate. This is NOT an import implementation. Never trust a UI
 * approval flag alone: production code must re-fetch source and DB records
 * inside a serialised server-side transaction before any write.
 */
export function assessIntervalsImportGate(review, approval, activity) {
  if (!review || !activity) return {allowed:false,reason:'missing_review'};
  if (review.safeToAutoImport !== false || review.trainingLoadEligible !== false)
    return {allowed:false,reason:'unsafe_review_contract'};
  if (!approval || approval.kind !== 'explicit_athlete_confirmation')
    return {allowed:false,reason:'confirmation_required'};
  if (!approval.sourceId || String(approval.sourceId) !== String(review.sourceId) ||
      String(approval.sourceId) !== String(activity.id))
    return {allowed:false,reason:'source_mismatch'};
  if (review.alreadyImported || review.possibleCrossPlatformDuplicate ||
      review.possibleDuplicateCount > 0)
    return {allowed:false,reason:'duplicate_review_required'};
  if (!['candidate_match','unmatched_activity'].includes(review.status))
    return {allowed:false,reason:'review_unresolved'};
  if (review.status === 'candidate_match' &&
      (!review.proposedPlannedSessionId || !approval.plannedSessionId ||
       String(review.proposedPlannedSessionId) !== String(approval.plannedSessionId)))
    return {allowed:false,reason:'planned_session_not_confirmed'};
  if (review.status === 'unmatched_activity' && approval.plannedSessionId)
    return {allowed:false,reason:'unverified_plan_link'};
  return {allowed:true,reason:'eligible_for_atomic_server_recheck_only',
    permittedPlanId:review.status === 'candidate_match' ? review.proposedPlannedSessionId : null,
    awardTrainingLoad:false, markSessionComplete:false};
}
