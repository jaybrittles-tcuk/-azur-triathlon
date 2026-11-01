import { chooseDrills } from './swimDrillLibrary.ts';
import type { SwimDrill, SwimDrillFocus } from './swimDrillLibrary.ts';
export type SwimDevelopmentObservation={focus:SwimDrillFocus;source:'coach_assessment'|'athlete_report';observedAt:string;notes?:string};
export type SwimDrillRecommendation=
 | {status:'coach_review_required';focus:SwimDrillFocus;drills:SwimDrill[];reason:string}
 | {status:'needs_assessment';reason:string;drills:[]};
/** A recent coach-observed weakness can inform a targeted technique block.
 * Athlete reports remain prompts for verification, not established diagnoses.
 * No automated plan publication or progression is authorised here.
 */
export function recommendAthleteSwimDrills(observations:readonly SwimDevelopmentObservation[],maxMeters=300,referenceDate=new Date().toISOString().slice(0,10)):SwimDrillRecommendation{
 const valid=observations.filter(o=>o.observedAt<=referenceDate&&Number.isFinite(Date.parse(o.observedAt))&&
   (Date.parse(referenceDate)-Date.parse(o.observedAt))<=90*86400000);
 const coach=valid.filter(o=>o.source==='coach_assessment').sort((a,b)=>b.observedAt.localeCompare(a.observedAt));
 if(!coach.length)return {status:'needs_assessment',reason:valid.length?'Athlete reports require coach verification before drill targeting':'No recent coach-assessed swim development focus',drills:[]};
 const focus=coach[0].focus;
 const drills=chooseDrills(focus,maxMeters);
 if(!drills.length)return {status:'needs_assessment',reason:'No validated drills fit the current focus and distance limit',drills:[]};
 return {status:'coach_review_required',focus,drills,reason:'Recent coach assessment suggests a focused technique block; coach must confirm suitability and scheduling'};
}
