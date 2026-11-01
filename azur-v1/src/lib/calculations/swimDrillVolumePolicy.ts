export type DrillVolumePolicyInput={phase:'base'|'build'|'peak'|'taper'|'recovery';isTechniqueWeek:boolean;baseMeters:number;drillMeters:number;weeklySwimPlannedMeters:number;weeklySwimLimitMeters:number;plannedSessionMinutes:number;estimatedRevisedMinutes:number;coachApprovedExtraVolume:boolean};
export type DrillVolumePolicyResult={status:'replace'|'extra_allowed'|'blocked';replaceMeters:number;extraMeters:number;reason:string};
export function resolveSwimDrillVolume(input:DrillVolumePolicyInput):DrillVolumePolicyResult{
 const n=[input.baseMeters,input.drillMeters,input.weeklySwimPlannedMeters,input.weeklySwimLimitMeters,input.plannedSessionMinutes,input.estimatedRevisedMinutes];
 if(n.some(x=>!Number.isFinite(x)||x<0)||input.baseMeters===0||input.drillMeters===0||input.plannedSessionMinutes===0)
  return {status:'blocked',replaceMeters:0,extraMeters:0,reason:'Complete verified swim volume and time data required'};
 if(input.drillMeters>400)return {status:'blocked',replaceMeters:0,extraMeters:0,reason:'Drill blocks above 400m need separate review'};
 if(input.isTechniqueWeek||input.phase==='recovery'||input.phase==='taper'){
  if(input.drillMeters>input.baseMeters)return {status:'blocked',replaceMeters:0,extraMeters:0,reason:'Not enough existing swim volume to replace'};
  return {status:'replace',replaceMeters:input.drillMeters,extraMeters:0,reason:'Maintain original distance in technique, recovery and taper weeks'};
 }
 if(input.phase!=='build'||!input.coachApprovedExtraVolume){
  return input.drillMeters<=input.baseMeters
   ?{status:'replace',replaceMeters:input.drillMeters,extraMeters:0,reason:'No approved additional-volume allowance'}
   :{status:'blocked',replaceMeters:0,extraMeters:0,reason:'Not enough volume to replace'};
 }
 const maxExtra=Math.min(input.baseMeters*0.1,400);
 if(input.drillMeters<=maxExtra&&input.weeklySwimPlannedMeters+input.drillMeters<=input.weeklySwimLimitMeters&&input.estimatedRevisedMinutes<=input.plannedSessionMinutes*1.1){
  return {status:'extra_allowed',replaceMeters:0,extraMeters:input.drillMeters,reason:'Coach-authorised build-week volume within 10% session and weekly constraints'};
 }
 if(input.drillMeters<=input.baseMeters)return {status:'replace',replaceMeters:input.drillMeters,extraMeters:0,reason:'Extra volume failed safeguards; replace existing distance instead'};
 return {status:'blocked',replaceMeters:0,extraMeters:0,reason:'Extra volume exceeds safeguards and replacement is not possible'};
}
