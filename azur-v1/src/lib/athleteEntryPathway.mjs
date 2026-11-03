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
export function entrySessionDistribution({pathway,targetMinutes,trainingDays,workouts=[]}={}){
 const warnings=[];
 if(!finite(targetMinutes,1,1500)||!Array.isArray(trainingDays)||!trainingDays.length){
  return {slots:[],warnings:['Cannot distribute sessions without a reviewed load and training days'],mappedMinutes:0,unmappedMinutes:0,ready:false};
 }
 const available=[...new Set(trainingDays)].filter(x=>Number.isInteger(x)&&x>=0&&x<=6).sort((a,b)=>a-b);
 // At least one rest day; two for foundation. A coach may revise days
 // after reviewing actual recent training and double-session tolerance.
 const chosen=available.length===7?pathway==='foundation'?[0,2,4,6]:[0,1,2,3,4,5]:
   available.slice(0,pathway==='foundation'?5:6);
 const allocations=pathway.startsWith('continuation')?
  [['swim',.20],['bike',.50],['run',.30]]:[['swim',.20],['bike',.45],['run',.35]];
 const targetBySport=Object.fromEntries(allocations.map(([sport,part])=>[sport,Math.round(targetMinutes*part/5)*5]));
 const slots=chosen.map((day,i)=>{
  const sport=pathway.startsWith('continuation')?
    ['swim','bike','run','swim','bike','run'][i%6]:
    ['run','bike','swim','bike','run'][i%5];
  const approved=workouts.filter(w=>w.approved&&w.sport===sport&&w.prescription&&w.duration_min>0);
  const mapped=approved.sort((a,b)=>a.duration_min-b.duration_min);
  return {day,sport,availableTemplates:mapped.length,exampleTitle:mapped[0]?.title||null};
 });
 for(const [sport,minutes] of Object.entries(targetBySport)){
  const librarySport=workouts.filter(w=>w.approved&&w.sport===sport);
  if(!librarySport.length)warnings.push('No approved '+sport+' sessions');
  else if(librarySport.reduce((n,x)=>n+x.duration_min,0)<minutes)
   warnings.push('Approved '+sport+' library cannot yet cover suggested weekly volume');
 }
 if(targetMinutes>480&&chosen.length<5)warnings.push('Large weekly load with few available days requires coach assessment of double sessions');
 warnings.push('Sport distribution is an indicative coaching framework, not a complete published week');
 return {slots,targetBySport,warnings,mappedMinutes:0,unmappedMinutes:targetMinutes,ready:false};
}
