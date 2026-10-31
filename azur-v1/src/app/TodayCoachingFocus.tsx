type PlannedSession = {title?:string;sport?:string;sessionClass?:string;rationale?:string;durationMin?:number;duration_min?:number;status?:string};
export default function TodayCoachingFocus({session,onOpen,onCalendar}:{session?:PlannedSession;onOpen:()=>void;onCalendar:()=>void}) {
 const kind=(session?.sessionClass??'').toLowerCase();
 const sport=session?.sport;
 const easy=/easy|recovery/.test(kind),quality=/intensity|threshold|vo2|tempo/.test(kind),race=/race_specific/.test(kind);
 const completed=session?.status==='completed';
 const focus=!session?'Space in your plan':easy?'Keep the easy work easy':race?'Practise the demands of race day':quality?'Quality with control':sport==='swim'?'Hold your technique as you tire':'Build endurance you can sustain';
 const why=!session?'There is no session scheduled today. Check your calendar before treating this as a planned recovery day.':easy?'A lower-intensity session keeps you moving while limiting the training demand. The aim is to finish controlled, rather than turn it into another hard workout.':race?'This session gives you a chance to rehearse the prescribed race effort and the habits you want to repeat on race day. Execution matters as much as completing the time.':quality?'The work intervals create the main training stimulus. Keeping the recoveries controlled helps you repeat the prescribed effort across the set.':sport==='swim'?'The value is in repeating good strokes throughout the set. Sustainable pacing gives you room to keep your technique consistent as the session progresses.':sport==='run'?'Controlled aerobic running builds time on your feet. Holding an even effort helps you accumulate the prescribed duration without adding an unplanned hard session.':'This ride builds sustained aerobic work on the bike. An even effort makes the later minutes useful, rather than simply making the first hour harder.';
 const cue=!session?'Review the week and confirm what is planned next.':easy?'Follow the easy targets in your prescription. Avoid chasing pace or power.':race?'Use the prescribed effort and rehearse your race routine.':quality?'Make the final work interval as controlled as the first.':sport==='swim'?'Keep strokes consistent; use the prescribed rests to reset.':'Start controlled and stay within the prescribed effort as fatigue builds.';
 return <section className="azur-today-coaching" aria-labelledby="today-coaching-title">
  <div className="azur-today-coaching-kicker"><span>THE PURPOSE</span><span>{completed?'Recorded complete':session?'From your plan':'Calendar check'}</span></div>
  <h2 id="today-coaching-title">Why today matters</h2>
  <h3>{focus}</h3><p>{why}</p>
  <div className="azur-coaching-cue"><span>{completed?'REFLECT ON YOUR SESSION':'YOUR EXECUTION CUE'}</span><p>{completed?'Compare how the session felt with its prescribed effort. Recording it complete does not tell us how well the targets were executed.':cue}</p></div>
  {session?.rationale&&<details><summary>See the plan’s rationale</summary><p>{session.rationale}</p></details>}
  <button type="button" onClick={session?onOpen:onCalendar}>{session?'View session & targets':'Open calendar'} <span aria-hidden="true">↗</span></button>
 </section>;
}
