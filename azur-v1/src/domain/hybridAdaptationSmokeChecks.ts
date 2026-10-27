import { assessAdaptation } from './hybridAdaptationPolicy';
import type { AdaptationProposal } from './hybridAdaptationPolicy';

export function runHybridPolicySmokeChecks():void {
 const base:AdaptationProposal={athleteId:'athlete-1',kind:'move_easy_session',
   originalMinutes:60,proposedMinutes:60,intensityBefore:'easy',intensityAfter:'easy',
   readiness:'green',hasConflicts:false,isLocked:false,daysUntilRace:60};
 const check=(p:AdaptationProposal,want:string)=>{
   const got=assessAdaptation(p).decision;
   if(got!==want) throw new Error('Expected '+want+' but got '+got+' for '+p.kind);
 };
 check(base,'auto_eligible');
 check({...base,kind:'reduce_easy_duration',proposedMinutes:54},'auto_eligible');
 check({...base,kind:'reduce_easy_duration',proposedMinutes:40},'coach_review');
 check({...base,kind:'change_intensity',intensityAfter:'hard'},'coach_review');
 check({...base,kind:'add_session'},'coach_review');
 check({...base,daysUntilRace:7},'coach_review');
 check({...base,readiness:'red'},'coach_review');
 check({...base,hasConflicts:true},'blocked');
 check({...base,isLocked:true},'blocked');
 check({...base,proposedMinutes:-1},'blocked');
}
