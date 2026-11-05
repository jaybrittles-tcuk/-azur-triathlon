export function foundationSessionCandidate(session) {
 const minutes=Number(session?.duration_min);
 const sport=String(session?.sport||'').toLowerCase();
 if(!Number.isFinite(minutes)||minutes<20||minutes>240||!['swim','bike','run'].includes(sport))
  return {status:'needs_coach_design',reason:'Unsupported sport or duration'};
 const warm=Math.min(sport==='swim'?10:15,Math.max(5,Math.floor(minutes*0.2)));
 const cool=Math.min(10,Math.max(5,Math.floor(minutes*0.12)));
 const main=minutes-warm-cool;
 if(main<10)return {status:'needs_coach_design',reason:'Insufficient main-set time'};
 const effort=sport==='swim'?'RPE 2–3, relaxed technique':sport==='bike'?'RPE 2–4, conversational aerobic':'RPE 2–3, conversational easy';
 const why=sport==='swim'?'Practise repeatable stroke mechanics while maintaining relaxed aerobic effort.':sport==='bike'?'Develop aerobic durability while respecting the athlete’s demonstrated ride tolerance.':'Build easy running consistency while respecting impact and recovery.';
 const rationale={
  purpose:sport==='swim'?'Technique and easy aerobic development':sport==='bike'?'Aerobic endurance and durability':'Aerobic consistency and impact tolerance',
  athleteEvidence:'Current calendar sport, duration and Foundation phase only; recent load, recovery and thresholds are not verified here',
  sessionContext:'Foundation sessions should remain controlled and support recovery between training days',
  raceRelevance:sport==='swim'?'Efficient, sustainable swimming before the bike leg':sport==='bike'?'Sustainable cycling without compromising the run':'Resilient running after cumulative swim and bike fatigue',
  adaptationTrigger:'Reassess if the athlete reports unusual fatigue, pain, illness, missed sessions or reduced availability',
  confidence:'limited',
  sourcePolicy:'Coaching principles synthesised for AZUR; no copied third-party training plan'
 };
 return {status:'coach_review_required',totalMinutes:minutes,why,rationale,blocks:[
  {name:'Warm-up',minutes:warm,effort:'RPE 2–3, gradual'},
  {name:sport==='swim'?'Technique-focused aerobic swimming':'Continuous aerobic work',minutes:main,effort},
  {name:'Cool-down',minutes:cool,effort:'RPE 1–2, relaxed'}
 ],safeguards:['Verify recent sport-specific load and injury status','Verify duration tolerance and recovery','Coach approval required before publication']};
}
