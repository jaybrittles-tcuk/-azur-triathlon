/**
 * Coach-review training entry decisions. No automatic training prescription,
 * threshold verification, or calendar write is authorized by this module.
 * Athlete statements guide the pathway; device history and coach review
 * are needed before establishing a workload baseline.
 */
const finite=(x,lo,hi)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi;
export function assessEntryPathway({experience='',recentHours=null,availableHours=null,trainingConcern='unsure',historyVerified=false,thresholdsVerified=false}={}){
 const blockers=[],notes=[];
 const knownRecent=finite(recentHours,0,25);
 const knownAvailability=finite(availableHours,2,25);
 if(!knownAvailability)blockers.push('Confirm weekly availability');
 if(!knownRecent)blockers.push('Confirm recent training volume or obtain a coach-approved starting baseline');
 if(trainingConcern!=='none'){
  blockers.push('Coach review required for a return-to-training or training concern');
  return {pathway:'return_to_training',status:'coach_review',targetMinutes:null,blockers,
   notes:['Do not infer readiness from past volume when there may be a health or training interruption.'],
   thresholdReady:false};
 }
 let pathway='foundation';
 if(knownRecent&&recentHours>=6&&experience==='experienced')pathway='continuation';
 else if(knownRecent&&recentHours>=4&&experience!=='first')pathway='continuation_review';
 if(pathway==='continuation_review')blockers.push('Confirm the athlete can sustain their recent load before continuation');
 if(!historyVerified&&pathway.startsWith('continuation')){
  blockers.push('Coach must verify recent training load or establish a safe baseline before publication');
 }
 if(!thresholdsVerified)notes.push('Thresholds are athlete-reported; no zone-specific prescription until verified');
 notes.push('Availability is a ceiling and must not be substituted for fitness or training history');
 let targetMinutes=null;
 if(knownAvailability&&knownRecent&&recentHours>0){
  const ceiling=Math.round(availableHours*60),baseline=Math.round(recentHours*60);
  // Preview reference volume, not a guarantee of readiness or a weekly target.
  targetMinutes=pathway.startsWith('continuation')?Math.min(ceiling,baseline):
   Math.min(ceiling,baseline,180);
 }
 if(pathway==='foundation'&&knownRecent&&recentHours===0)notes.push('Zero recent training requires a deliberately progressive first-week review');
 return {pathway,status:blockers.length?'coach_review':'ready_for_workout_mapping',targetMinutes,blockers,notes,
  thresholdReady:Boolean(thresholdsVerified)};
}
/**
 * Provide a realistic *unpublished* weekly structure for established
 * athletes, including double sessions and a long ride. Durations are
 * proposed, never mistaken for available approved workout prescriptions.
 */
export function entrySessionDistribution({pathway,targetMinutes,trainingDays,workouts=[]}={}){
 const warnings=[];
 if(!finite(targetMinutes,1,1500)||!Array.isArray(trainingDays)||!trainingDays.length){
  return {slots:[],warnings:['Cannot distribute sessions without a reviewed load and training days'],
   mappedMinutes:0,unmappedMinutes:0,ready:false};
 }
 const available=[...new Set(trainingDays)].filter(x=>Number.isInteger(x)&&x>=0&&x<=6).sort((a,b)=>a-b);
 const isContinuing=pathway.startsWith('continuation');
 const chosen=available.length===7?(isContinuing?[1,2,3,4,5,6]:[0,2,4,6]):
   available.slice(0,isContinuing?6:5);
 if(chosen.length<3)warnings.push('Too few available training days for a balanced triathlon plan');
 if(isContinuing&&targetMinutes>=600&&chosen.length<5)
  warnings.push('High-volume continuation needs five or more available days; coach must review double-session feasibility');
 const base=isContinuing?[
  [['swim',60],['bike',90]],
  [['run',60],['swim',45]],
  [['bike',90],['run',45]],
  [['swim',60],['bike',90]],
  [['bike',210],['run',30]],
  [['run',105],['swim',75]]
 ]:[
  [['run',30]],[['bike',40]],[['swim',30]],[['bike',40]],[['run',30]]
 ];
 const baseTotal=base.flat().reduce((n,[,min])=>n+min,0);
 const factor=targetMinutes/baseTotal;
 const desired=base.slice(0,chosen.length).map((daySlots,i)=>({
  day:chosen[i],sessions:daySlots.map(([sport,minutes])=>({
   sport,minutes:Math.max(20,Math.round(minutes*factor/5)*5)
  }))
 }));
 const slots=desired.flatMap(day=>day.sessions.map(entry=>({
  day:day.day,sport:entry.sport,minutes:entry.minutes,
  approvedMatches:workouts.filter(w=>w.approved&&w.sport===entry.sport&&w.prescription&&
   Number.isFinite(w.duration_min)&&Math.abs(w.duration_min-entry.minutes)<=10)
   .map(w=>({workout_key:w.workout_key,title:w.title,duration_min:w.duration_min}))
 })));
 const proposedMinutes=slots.reduce((n,s)=>n+s.minutes,0);
 const targetBySport={swim:0,bike:0,run:0};
 for(const slot of slots)targetBySport[slot.sport]+=slot.minutes;
 const mappedMinutes=slots.filter(s=>s.approvedMatches.length).reduce((n,s)=>n+s.minutes,0);
 if(Math.abs(proposedMinutes-targetMinutes)>20)
  warnings.push('Availability and proportional session rounding do not match target; coach must redistribute '+Math.abs(proposedMinutes-targetMinutes)+' minutes');
 for(const sport of ['swim','bike','run']){
  if(targetBySport[sport]===0)warnings.push('No '+sport+' training in suggested structure');
 }
 if(slots.some(s=>s.minutes>240))warnings.push('A proposed session exceeds four hours and needs coach review');
 const byDay=new Map();
 for(const slot of slots)byDay.set(slot.day,(byDay.get(slot.day)||0)+slot.minutes);
 if([...byDay.values()].some(m=>m>240))warnings.push('A proposed day exceeds four hours and needs coach review');
 if(slots.some(s=>!s.approvedMatches.length))
  warnings.push('Approved workout library does not yet cover every proposed duration; additional coach-approved prescriptions needed');
 warnings.push('Indicative coach-review structure only. Do not publish until load, injury status, thresholds and exact workouts are approved.');
 return {slots,targetBySport,warnings,proposedMinutes,mappedMinutes,
  unmappedMinutes:proposedMinutes-mappedMinutes,restDays:7-byDay.size,ready:false};
}
