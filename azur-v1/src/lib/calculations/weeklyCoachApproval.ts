import type { DraftResult } from './weeklyDraftGenerator.ts';

export type WeeklyApprovalStatus = 'draft'|'pending_coach_review'|'approved'|'rejected'|'published';
export type WeeklyApprovalRecord = {
 athleteId:string; weekStart:string; draftRevision:number; draftFingerprint:string;
 status:WeeklyApprovalStatus; approvedRevision:number|null; approvedFingerprint:string|null;
 approvedBy:string|null; approvedAt:string|null;
};
export type WeeklyApprovalDecision =
 | {allowed:true; approvalReference:string}
 | {allowed:false; reason:string};

/** The publisher must verify this contract against a persisted, authenticated,
 * server-owned approval record. This client-side helper is not authorization.
 */
export function evaluateWeeklyPublication(input:{
 draft:DraftResult; review:WeeklyApprovalRecord|null; athleteId:string;
 fingerprint:string; currentRevision:number; alreadyPublished:boolean;
}):WeeklyApprovalDecision {
 if(input.draft.status!=='ready_for_coach_review')return {allowed:false,reason:'Draft is incomplete'};
 if(input.alreadyPublished)return {allowed:false,reason:'Week already has published sessions'};
 if(!input.review)return {allowed:false,reason:'No saved coach review'};
 const r=input.review;
 if(r.athleteId!==input.athleteId||r.weekStart!==input.draft.weekStart)
   return {allowed:false,reason:'Approval belongs to another athlete or week'};
 if(r.status!=='approved'||!r.approvedBy||!r.approvedAt)
   return {allowed:false,reason:'Verified coach approval required'};
 if(r.draftRevision!==input.currentRevision||r.approvedRevision!==input.currentRevision||
   r.draftFingerprint!==input.fingerprint||r.approvedFingerprint!==input.fingerprint)
   return {allowed:false,reason:'Draft changed after approval; new review required'};
 if(!input.draft.sessions.length)return {allowed:false,reason:'No sessions in draft'};
 return {allowed:true,approvalReference:`${input.athleteId}:${input.draft.weekStart}:${input.currentRevision}:${input.fingerprint}`};
}
