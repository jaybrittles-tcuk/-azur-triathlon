/**
 * Strict first-week discovery. Availability is a ceiling, NOT evidence of current
 * training tolerance. This read-only engine never invents or approves workouts.
 */
export function benchmarkIndependent(workout) {
 if(!workout?.approved||workout.level!==1||!['base','recovery'].some(x=>workout.phases?.includes(x))||
   !['run','swim','bike'].includes(workout.sport)||
   !Number.isInteger(workout.duration_min)||workout.duration_min<10||workout.duration_min>60||
   !['aerobic_endurance','recovery','technique'].includes(workout.family))return false;
 const prescription=workout.prescription;
 if(!prescription||typeof prescription!=='object'||Array.isArray(prescription))return false;
 const segments=Array.isArray(prescription.steps)?prescription.steps:
   Array.isArray(prescription.poolSegments)?prescription.poolSegments:null;
 if(!segments?.length)return false;
 if(segments.some(step=>typeof step.target!=='string'||!step.target.trim()))return false;
 const instruction=segments.map(s=>s.target).join(' ').toLowerCase();
 // Without confirmed benchmark data, any FTP/CSS/pace/HR-zone prescription
 // must be excluded, including a threshold mentioned as "below threshold".
 if(/\b(ftp|css|threshold|watts?|w\/kg|bpm|heart.?rate|zone\s*[1-9]|[0-9]+\s*%|s\/100m|min\/km|pace target)\b/i.test(instruction))return false;
 return true;
}
/** Preview only; no scheduling, publishing, or database writes.
 * Missing sport coverage always blocks an automatic triathlon-week release.
 */
export function starterWeekPreview({weekStart,availabilityHours,onboardingCompleted,existingSessions,library}={}){
 const reasons=[];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart??''))reasons.push('Choose a valid Monday');
 else {
  const d=new Date(weekStart+'T12:00:00Z');
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==weekStart||d.getUTCDay()!==1)reasons.push('Choose a valid Monday');
 }
 if(!onboardingCompleted)reasons.push('Athlete onboarding needs completion');
 if(!Number.isFinite(availabilityHours)||availabilityHours<2||availabilityHours>25)reasons.push('Confirm weekly availability');
 if(!Number.isInteger(existingSessions)||existingSessions<0)reasons.push('Existing calendar check unavailable');
 else if(existingSessions>0)reasons.push('Existing sessions require reconciliation; no automatic replacement');
 const eligible=Array.isArray(library)?library.filter(benchmarkIndependent):[];
 const sessions=[];
 // One low-risk run suggestion only; prior load, injury status and swim
 // confidence are unknown until explicitly assessed.
 const run=eligible.filter(x=>x.sport==='run'&&x.family==='aerobic_endurance'&&x.duration_min<=45)
   .sort((a,b)=>a.duration_min-b.duration_min||a.workout_key.localeCompare(b.workout_key))[0];
 if(run && reasons.length===0)sessions.push({day:2,date:new Date(Date.parse(weekStart+'T12:00:00Z')+2*86400000).toISOString().slice(0,10),
   workout_key:run.workout_key,title:run.title,sport:run.sport,duration_min:run.duration_min});
 for(const sport of ['swim','bike','run']){
  if(!eligible.some(x=>x.sport===sport))reasons.push('No benchmark-independent, approved '+sport+' workout available');
 }
 if(!run)reasons.push('No conservative, approved easy run of 45 minutes or less');
 reasons.push('Coach must confirm current training history, injury status and sport readiness before an initial week can be published');
 return {status:'needs_coach_review',weekStart,sessions,minutes:sessions.reduce((n,s)=>n+s.duration_min,0),
  availabilityCeilingMinutes:Number.isFinite(availabilityHours)?Math.round(availabilityHours*60):null,
  reasons:[...new Set(reasons)],canPublish:false};
}
