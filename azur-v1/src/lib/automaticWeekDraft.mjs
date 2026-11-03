/**
 * Map a coach-reviewed training structure to EXISTING approved RPE-only workouts.
 * Never invent steps, interpolate intensities, or silently add unavailable
 * sessions. Returns a complete proposal or explicit blockers.
 */
export function safeRpeWorkout(w){
 if(!w||w.approved!==true||!['swim','bike','run'].includes(w.sport)||
  !Number.isInteger(w.duration_min)||w.duration_min<15||w.duration_min>240||
  !w.prescription||typeof w.prescription!=='object'||Array.isArray(w.prescription))return false;
 const steps=w.prescription.steps;
 if(!Array.isArray(steps)||!steps.length)return false;
 if(steps.some(x=>!Number.isFinite(x.durationMin)||x.durationMin<=0||typeof x.target!=='string'||!x.target.trim()))return false;
 const duration=steps.reduce((n,x)=>n+x.durationMin,0);
 if(duration!==w.duration_min)return false;
 const text=steps.map(x=>x.target).join(' ');
 if(/\b(ftp|css|threshold|watts?|heart.?rate|bpm|zone\s*\d|w\/kg|pace target)\b|\d+(?:\.\d+)?\s*%/i.test(text))return false;
 return /\b(rpe|conversational|easy|comfortable|relaxed|steady)\b/i.test(text);
}
export function mapAutoWeek({weekStart,targetHours,slots,library}={}){
 const blockers=[];
 const date=new Date(String(weekStart)+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart??'')||!Number.isFinite(date.getTime())||
 date.toISOString().slice(0,10)!==weekStart||date.getUTCDay()!==1)blockers.push('Valid Monday required');
 if(typeof targetHours!=='number'||!Number.isFinite(targetHours)||targetHours<2||targetHours>25)
  blockers.push('Verified target hours required');
 if(!Array.isArray(slots)||!slots.length||slots.length>21)blockers.push('Valid coach-reviewed session slots required');
 if(!Array.isArray(library))blockers.push('Approved workout library must be available');
 if(blockers.length)return {sessions:[],blockers,matchedMinutes:0,complete:false};
 const approved=library.filter(safeRpeWorkout);
 const sessions=[];
 for(const slot of slots){
  if(!Number.isInteger(slot.day)||slot.day<0||slot.day>6||
     !['swim','bike','run'].includes(slot.sport)||!Number.isInteger(slot.minutes)||slot.minutes<15||slot.minutes>240){
   blockers.push('Invalid proposed session slot');continue;
  }
  const matching=approved.filter(w=>w.sport===slot.sport&&w.duration_min===slot.minutes)
    .sort((a,b)=>
    a.workout_key.localeCompare(b.workout_key));
  if(!matching.length){
   blockers.push('No approved benchmark-independent '+slot.sport+' workout for exactly '+slot.minutes+' minutes');
   continue;
  }
  const w=matching[0];
  const d=new Date(date);d.setUTCDate(d.getUTCDate()+slot.day);
  sessions.push({date:d.toISOString().slice(0,10),session:{
   id:w.workout_key,title:w.title,sport:w.sport,sessionClass:w.family,
   priority:2,durationMin:w.duration_min,
   prescription:w.prescription,targets:{rpe:'Easy aerobic; follow coach-approved session instructions'},
   rationale:'Approved RPE-based session selected by AZUR for coach review'
  }});
 }
 const total=sessions.reduce((n,s)=>n+s.session.durationMin,0);
 if(sessions.length!==slots.length)blockers.push('One or more training slots cannot be mapped to approved workouts');
 if(total<targetHours*60*.9||total>targetHours*60*1.1)
  blockers.push('Approved session volume differs from verified weekly target');
 const usedDays=new Set(sessions.map(s=>s.date));
 if(usedDays.size>6)blockers.push('At least one rest day must be reserved');
 const byDay=new Map();
 for(const s of sessions){
  const prior=byDay.get(s.date)||{minutes:0,sports:[]};
  prior.minutes+=s.session.durationMin;
  if(prior.sports.includes(s.session.sport))blockers.push('Duplicate discipline on one day requires manual review');
  prior.sports.push(s.session.sport);byDay.set(s.date,prior);
 }
 if([...byDay.values()].some(x=>x.minutes>240))blockers.push('Daily planned duration exceeds four hours');
 return {sessions,blockers:[...new Set(blockers)],matchedMinutes:total,
  complete:!blockers.length};
}
