/**
 * Two-week pre-testing foundation, preview-only. This is a suggested distribution,
 * NOT a prescribed or coach-approved workout plan. No calendar writes.
 * Athlete-reported benchmarks must be verified before zone-based sessions.
 */
const basicTypes={
 swim:{title:'Easy technique swim',minutes:30,intensity:'Relaxed technique and conversational effort; coach confirms distance and ability'},
 bike:{title:'Easy aerobic ride',minutes:40,intensity:'Conversational effort, RPE 2–3; no power targets'},
 run:{title:'Easy run or run/walk',minutes:30,intensity:'Conversational effort, RPE 2–3; coach confirms run readiness'},
};

// Conservative, time-based prescriptions: no unverified pace, power or CSS targets.
// Every step has a duration; repeated work and recovery are represented explicitly.
export function foundationPrescription(sport, minutes, week=0) {
 const variant=week===0?0:1;
 const recipes={
  swim:[
   {title:'Relaxed technique swim',purpose:'Build water confidence and relaxed technique before introducing swim intensity.',
    steps:[['Warm-up',5,'Easy swimming, relaxed breathing'],['Technique',10,'Alternate 2 min easy drill focus with 1 min relaxed swimming; repeat, using the remaining minute to reset'],['Aerobic',10,'Comfortable continuous swimming with breaks whenever needed'],['Cool-down',5,'Very easy swimming']]},
   {title:'Technique and rhythm swim',purpose:'Practise repeatable technique and pacing without adding intensity.',
    steps:[['Warm-up',5,'Easy swimming'],['Technique',10,'Five 2-minute technique blocks; take recovery as needed within each block'],['Aerobic',10,'Alternate 2 min comfortable swimming and 1 min easy swimming, then finish with 1 min relaxed swimming'],['Cool-down',5,'Easy swimming']]}
  ],
  bike:[
   {title:'Aerobic rhythm ride',purpose:'Develop sustainable aerobic rhythm with frequent low-stress resets.',
    steps:[['Warm-up',8,'Gradually settle into RPE 2–3'],['Aerobic intervals',24,'3 × 7 min at RPE 3 with 1 min easy between efforts; finish with 1 min easy'],['Cool-down',8,'RPE 1–2 easy spinning']]},
   {title:'Cadence control ride',purpose:'Improve smooth pedalling and comfortable aerobic control.',
    steps:[['Warm-up',8,'Easy spinning, RPE 2'],['Technique intervals',24,'4 × 5 min relaxed cadence focus at RPE 3 with 1 min easy between blocks; finish with 1 min easy'],['Cool-down',8,'Easy spinning, RPE 1–2']]}
  ],
  run:[
   {title:'Easy run or run/walk',purpose:'Establish comfortable running rhythm without forcing pace.',
    steps:[['Warm-up',5,'Brisk walk progressing to easy jog if comfortable'],['Main set',20,'Easy conversational running; walk whenever needed to maintain RPE 2–3'],['Cool-down',5,'Easy walk']]},
   {title:'Relaxed run/walk rhythm',purpose:'Build consistency while keeping the effort conversational.',
    steps:[['Warm-up',5,'Brisk walk'],['Main set',20,'4 × 4 min easy running with 1 min walking between blocks; finish with 1 min easy'],['Cool-down',5,'Easy walking']]}
  ]
 };
 const recipe=recipes[sport]?.[variant];
 if(!recipe || minutes!==({swim:30,bike:40,run:30}[sport]))return null;
 return {title:recipe.title,purpose:recipe.purpose,
  intensity:'RPE 2–3, conversational; no unverified threshold targets',
  steps:recipe.steps.map(([name,durationMinutes,instructions])=>({name,durationMinutes,instructions})),
  totalMinutes:recipe.steps.reduce((sum,step)=>sum+step[1],0),
  status:'coach_review_required'};
}

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
 if(!Array.isArray(trainingDays)||trainingDays.length<2||trainingDays.length>7||
    new Set(trainingDays).size!==trainingDays.length||
    trainingDays.some(n=>!Number.isInteger(n)||n<0||n>6))
  blockers.push('Confirm at least two valid available training days');
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
  // Athlete availability is NOT a request to train every day. Pick at most five,
  // spacing sessions and retaining two rest days even when all seven are available.
  const chosen=available.length===7?[0,1,3,4,6]:
   available.length<=5?available:available.filter((_,i)=>i!==2).slice(0,5);
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
    const prescription=foundationPrescription(t.sport,t.minutes,week);
    sessions.push({date:weekDate(weekStart,t.day+7*week),
     day:days[t.day],sport:t.sport,title:prescription?.title??t.title,minutes:t.minutes,
     intensity:prescription?.intensity??t.intensity,
     purpose:prescription?.purpose??null,steps:prescription?.steps??[],
     status:'unapproved_proposal'});
    minutes+=t.minutes;
   }
   weeks.push({weekStart:weekDate(weekStart,week*7),sessions,totalMinutes:minutes,restDays:7-new Set(sessions.map(x=>x.day)).size});
  }
  if(weeks.some(w=>w.sessions.length<2))blockers.push('Recent training load is too low or unknown to select a useful foundation; coach review needed');
 }
 if(unknownSports.length)warnings.push('After the two easy-endurance weeks, coach schedules suitable tests for: '+unknownSports.join(', ')+'.');
 else warnings.push('All three thresholds were supplied by the athlete; coach checks their age and reliability before using any intensity zones.');
 const testWindowStart=!Number.isNaN(d.getTime())&&d.getUTCDay()===1?
   weekDate(weekStart,14):null;
 const proposedAssessments=unknownSports.map(sport=>({
  sport,windowStart:testWindowStart,
  purpose:sport==='bike'?'Establish FTP from an appropriate cycling assessment':
   sport==='swim'?'Establish CSS from appropriately selected swim testing':
   'Establish run training thresholds from an appropriate run assessment',
  status:'coach_review_after_foundation'
 }));
 return {path,unknownSports,thresholds,weeks,blockers:[...new Set(blockers)],warnings,
  proposedAssessments,testWindowStart,
  canPublish:false,coachReviewRequired:true};
}
