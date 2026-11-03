/**
 * Two-week pre-testing foundation, preview-only. This is a suggested distribution,
 * NOT a prescribed or coach-approved workout plan. No calendar writes.
 * Athlete-reported benchmarks must be verified before zone-based sessions.
 */
const basicTypes={
 swim:{title:'Easy technique swim',minutes:30,intensity:'Relaxed technique and conversational effort; coach confirms distance and ability'},
 bike:{title:'Easy aerobic ride',minutes:40,intensity:'Conversational effort, RPE 2–3; no FTP target'},
 run:{title:'Easy run or run/walk',minutes:30,intensity:'Conversational effort, RPE 2–3; coach confirms run readiness'},
};
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const numberOrNull=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max?n:null;
const weekDate=(monday,index)=>{const date=new Date(monday+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+index);return date.toISOString().slice(0,10)};
export function twoWeekFoundationPreview({
 weekStart,trainingDays,availableHours,recentHours=null,
 onboardingCompleted=false,currentTrainingConcern='unsure',
 ftpWatts=null,swimCssSeconds=null,runThresholdSeconds=null,existingSessions=0
}={}){
 const blockers=[];
 const d=new Date(String(weekStart)+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart??'')||Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==weekStart||d.getUTCDay()!==1)
  blockers.push('Select a valid Monday for the first foundation week');
 if(!onboardingCompleted)blockers.push('Finish athlete onboarding');
 if(!Array.isArray(trainingDays)||trainingDays.length<2||trainingDays.length>6||
    new Set(trainingDays).size!==trainingDays.length||
    trainingDays.some(n=>!Number.isInteger(n)||n<0||n>6))
  blockers.push('Confirm at least two available training days and leave at least one rest day');
 if(numberOrNull(availableHours,2,25)===null)blockers.push('Valid weekly availability required');
 const knownRecent=numberOrNull(recentHours,0,25);
 if(recentHours!==null&&knownRecent===null)blockers.push('Recent training history needs clarification');
 if(currentTrainingConcern!=='none')blockers.push('Coach must confirm current injury or training concerns before first sessions');
 if(!Number.isInteger(existingSessions)||existingSessions<0)blockers.push('Calendar must be checked before building a new plan');
 else if(existingSessions>0)blockers.push('Existing calendar sessions need reconciliation');
 const thresholds={
  bike:numberOrNull(ftpWatts,60,650)!==null,
  swim:numberOrNull(swimCssSeconds,50,300)!==null,
  run:numberOrNull(runThresholdSeconds,150,900)!==null
 };
 const unknownSports=Object.keys(thresholds).filter(k=>!thresholds[k]);
 const path=unknownSports.length?'two_week_endurance_foundation':'coach_threshold_verification';
 const warnings=[
  'These are suggested session types, not validated workouts; coach approval and completed prescriptions are required before publishing.',
  'Athlete-reported thresholds are not coach-verified; no FTP, CSS or pace-based intensity is prescribed.',
 ];
 if(knownRecent===null)warnings.push('Recent weekly load is unknown. Athlete availability is not evidence of training tolerance.');
 const weeks=[];
 if(!blockers.length){
  const available=[...trainingDays].sort((a,b)=>a-b);
  // Keep at most five training days; two rest days where possible.
  const chosen=available.length<=5?available:available.filter((_,i)=>i!==2).slice(0,5);
  const sports=chosen.length===2?['bike','run']:
    chosen.length===3?['run','bike','swim']:
    chosen.length===4?['run','bike','swim','bike']:['run','bike','swim','bike','run'];
  const types=chosen.map((day,i)=>({day,sport:sports[i],...basicTypes[sports[i]]}));
  // An athlete who has trained 0–1 hours recently must not be progressed simply
  // because they have many hours of availability. This remains coach review only.
  const cap=Math.min(availableHours*60,
   knownRecent===null?120:Math.max(45,Math.round(knownRecent*60)));
  for(let week=0;week<2;week++){
   let minutes=0;
   const sessions=[];
   for(const t of types){
    if(minutes+t.minutes>cap)continue;
    // Keep both foundation weeks equally conservative, with no automatic
    // progression ahead of an assessment of the first week's response.
    sessions.push({date:weekDate(weekStart,t.day+7*week),
     day:days[t.day],sport:t.sport,title:t.title,minutes:t.minutes,
     intensity:t.intensity,status:'unapproved_proposal'});
    minutes+=t.minutes;
   }
   weeks.push({weekStart:weekDate(weekStart,week*7),sessions,totalMinutes:minutes,restDays:7-new Set(sessions.map(x=>x.day)).size});
  }
  if(weeks.some(w=>w.sessions.length<2))blockers.push('Recent training load is too low or unknown to select a useful foundation; coach review needed');
 }
 if(unknownSports.length)warnings.push('After the two easy-endurance weeks, coach schedules suitable tests for: '+unknownSports.join(', ')+'.');
 else warnings.push('All three thresholds were supplied by the athlete; coach checks their age and reliability before using any intensity zones.');
 return {path,unknownSports,thresholds,weeks,blockers:[...new Set(blockers)],warnings,
  canPublish:false,coachReviewRequired:true};
}
