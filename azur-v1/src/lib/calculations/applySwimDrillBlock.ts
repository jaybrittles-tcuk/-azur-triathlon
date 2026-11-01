import type {SwimWeekCoachReview} from './swimWeekAssessmentBridge.ts';
export type EditableDraftSession={date?:string;session?:{sport?:string;prescription?:Record<string,unknown>;durationMin?:number;[key:string]:unknown};[key:string]:unknown};
export function addReviewedDrillBlock(sessions:readonly EditableDraftSession[],review:SwimWeekCoachReview,swimIndex:number):EditableDraftSession[]{
 if(review.status!=='review_required'||!review.drillBlock)throw new Error('A valid coach-review drill suggestion is required');
 if(!Number.isInteger(swimIndex)||swimIndex<0||swimIndex>=sessions.length)throw new Error('Select a swim workout');
 const current=sessions[swimIndex];
 if(current?.session?.sport!=='swim')throw new Error('Selected session is not swimming');
 if(!current.session.prescription||typeof current.session.prescription!=='object')throw new Error('Structured swim prescription required');
 if('coachDrillBlock' in current.session.prescription)throw new Error('Review existing drill block before replacing it');
 const block=review.drillBlock;
 if(block.totalMeters<25||block.totalMeters>400)throw new Error('Drill volume requires coach review');
 return sessions.map((s,i)=>i===swimIndex?{...s,session:{...s.session,prescription:{...s.session!.prescription,coachDrillBlock:{
  focus:block.focus,totalMeters:block.totalMeters,drills:block.drills.map(d=>({...d}))
 }}}}:s);
}
/** Immutable draft revisions require a fresh approval even if a previous revision was approved. */
export function canonicalDraftFingerprintInput(sessions:readonly EditableDraftSession[]):string{
 return JSON.stringify(sessions);
}
