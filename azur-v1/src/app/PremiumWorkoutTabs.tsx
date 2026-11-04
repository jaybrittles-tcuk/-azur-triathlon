import {useState} from 'react';
import {normalizeWorkoutIntervals} from '../lib/calculations/workoutIntensity';
import WorkoutTargetDetails from './WorkoutTargetDetails';

type Props={prescription:Record<string,unknown>|null|undefined;rationale?:string|null;
 ftpWatts:number|null;plannedMinutes:number;completedMinutes?:number|null;completedSource?:string|null};
export default function PremiumWorkoutTabs({prescription,rationale,ftpWatts,plannedMinutes,completedMinutes,completedSource}:Props){
 const [tab,setTab]=useState<'overview'|'intervals'|'notes'>('overview');
 const source=prescription?.azurWorkout as {steps?:unknown}|undefined;
 const intervals=normalizeWorkoutIntervals(source?.steps);
 const why=typeof prescription?.why_today_matters==='string'?prescription.why_today_matters:rationale;
 const focus=typeof prescription?.focus==='string'?prescription.focus:null;
 const sportNote=typeof prescription?.swim_duration_note==='string'?prescription.swim_duration_note:null;
 const sessionWhy=(why||'The objective and targets for this session are set out below.')
  .replace(/^Why today matters:\s*/i,'');
 const tabs=[{key:'overview',label:'At a glance'},{key:'intervals',label:'Intervals'},{key:'notes',label:'Coach notes'}] as const;
 return <section className="azur-premium-workout-tabs azur-v11-tabs">
  <div className="azur-workout-tab-nav" role="tablist" aria-label="Workout information">
   {tabs.map(t=><button type="button" key={t.key} role="tab" aria-selected={tab===t.key}
    onClick={()=>setTab(t.key)}>{t.label}</button>)}
  </div>
  {tab==='overview'&&<div role="tabpanel" className="azur-workout-tab-content azur-v11-overview">
   <div className="azur-v11-purpose">
    <span className="azur-v11-kicker">WHY THIS SESSION</span>
    <p>{sessionWhy}</p>
   </div>
   <div className="azur-v11-facts">
    <div><small>Duration</small><strong>{plannedMinutes} <em>min</em></strong></div>
    <div><small>Structure</small><strong>{intervals.length||'—'} <em>blocks</em></strong></div>
    <div><small>Status</small><strong>{completedMinutes==null?'Planned':'Completed'}</strong></div>
   </div>
   {focus&&<div className="azur-v11-focus"><span className="azur-v11-kicker">TODAY'S FOCUS</span><p>{focus}</p></div>}
   {intervals.length>0&&<button type="button" className="azur-v11-see-intervals" onClick={()=>setTab('intervals')}>
    Explore your workout intervals <span aria-hidden="true">→</span>
   </button>}
   {completedMinutes!=null&&<p className="azur-v11-completion-note">
    Recorded {completedMinutes} min{completedSource?' via '+completedSource:''}.
    Duration alone doesn't confirm target intensity was achieved.
   </p>}
  </div>}
  {tab==='intervals'&&<div role="tabpanel" className="azur-workout-tab-content azur-v11-interval-panel">
   <WorkoutTargetDetails prescription={prescription} ftpWatts={ftpWatts}/>
   {sportNote&&<p className="azur-v11-context-note">{sportNote}</p>}
  </div>}
  {tab==='notes'&&<div role="tabpanel" className="azur-workout-tab-content azur-v11-notes">
   <span className="azur-v11-kicker">COACH GUIDANCE</span>
   <p>{sessionWhy}</p>
   {focus&&<div className="azur-v11-focus"><span className="azur-v11-kicker">EXECUTION CUE</span><p>{focus}</p></div>}
   {sportNote&&<p>{sportNote}</p>}
   <small>Use the detailed prescription below if you need the complete written steps.</small>
  </div>}
 </section>;
}
