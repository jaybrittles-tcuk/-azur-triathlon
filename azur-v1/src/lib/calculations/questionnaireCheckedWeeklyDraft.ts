import {draftApprovedTrainingWeek} from './weeklyDraftGenerator.ts';
import type {DraftSlot,DraftResult} from './weeklyDraftGenerator.ts';
import type {SessionEntry} from './sessionSelection.ts';

/** Questionnaire-only beta pathway. No activity/device data is required.
 * Never publishes sessions or treats athlete-reported hours as validated training load.
 */
export type QuestionnaireBaseline={
 onboardingComplete:boolean;
 requestedWeeklyHours:number;
 recentWeeklyHours:number|null;
 trainingBackground:'novice'|'regular'|'established';
 trainingConsistency:'under4'|'4to7'|'8plus';
 trainingConcern:'none'|'yes'|'unsure';
 canSwim200m:boolean;
 coachApproved:boolean;
 approvedWeeklyHours:number|null;
};
export type QuestionnaireDraftResult=DraftResult&{baselineSource:'athlete_questionnaire';coachReviewRequired:true};
export function draftQuestionnaireWeek(input:{
 weekStart:string;slots:readonly DraftSlot[];library:readonly SessionEntry[];
 phase:SessionEntry['phases'][number];targetWeekMinutes:number;
 existingActiveSessions:number;athleteProfileReady:boolean;
 baseline:QuestionnaireBaseline;recentSessionIds?:readonly string[];
}):QuestionnaireDraftResult{
 const b=input.baseline;
 const blockers:string[]=[];
 if(!b.onboardingComplete)blockers.push('Athlete onboarding must be completed');
 if(!Number.isFinite(b.requestedWeeklyHours)||b.requestedWeeklyHours<2||b.requestedWeeklyHours>25)blockers.push('Valid athlete-reported availability required');
 if(!['novice','regular','established'].includes(b.trainingBackground)||!['under4','4to7','8plus'].includes(b.trainingConsistency))blockers.push('Training experience and consistency required');
 if(b.trainingConcern!=='none')blockers.push('Injury or training concern requires individual coach assessment');
 if(!b.coachApproved||b.approvedWeeklyHours==null||!Number.isFinite(b.approvedWeeklyHours)||b.approvedWeeklyHours<=0)blockers.push('Coach must approve questionnaire-based starting capacity');
 if(b.approvedWeeklyHours!=null&&b.approvedWeeklyHours>b.requestedWeeklyHours)blockers.push('Approved capacity exceeds available training hours');
 if(b.recentWeeklyHours!=null&&(!Number.isFinite(b.recentWeeklyHours)||b.recentWeeklyHours<0||b.recentWeeklyHours>40))blockers.push('Invalid recent training report');
 // Without reliable history, avoid aggressive starting volumes even when availability is high.
 const capHours=b.trainingConsistency==='under4'?4:b.trainingBackground==='novice'?5:6;
 if(b.approvedWeeklyHours!=null&&b.approvedWeeklyHours>capHours)blockers.push('Questionnaire-only starting volume exceeds conservative beta cap');
 if(!Number.isFinite(input.targetWeekMinutes)||input.targetWeekMinutes<=0)blockers.push('Valid weekly target required');
 if(b.approvedWeeklyHours!=null&&input.targetWeekMinutes>b.approvedWeeklyHours*60)blockers.push('Weekly target exceeds coach-approved capacity');
 if(b.recentWeeklyHours===0)blockers.push('No recent training reported; coach must assess an appropriate return-to-training start');
 if(b.recentWeeklyHours!=null&&b.recentWeeklyHours>0&&input.targetWeekMinutes>b.recentWeeklyHours*60*1.1)blockers.push('Weekly target exceeds recent reported volume progression guard');
 if(!b.canSwim200m&&input.slots.some(x=>x.sport==='swim'&&x.family!=='technique'))blockers.push('Swim readiness requires technique-only starting sessions');
 if(input.slots.some(x=>x.maxLevel!==1||!['aerobic_endurance','technique','recovery'].includes(x.family)))blockers.push('Questionnaire-only start requires level-one introductory sessions');
 if(blockers.length)return {status:'blocked',weekStart:input.weekStart,reasons:blockers,sessions:[],baselineSource:'athlete_questionnaire',coachReviewRequired:true};
 const draft=draftApprovedTrainingWeek({...input,weeklyLimitMinutes:Math.round(b.approvedWeeklyHours!*60)});
 return {...draft,baselineSource:'athlete_questionnaire',coachReviewRequired:true};
}
