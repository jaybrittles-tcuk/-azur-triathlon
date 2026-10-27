import { useState } from 'react';
import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';
import WorkoutTargetDetails from './WorkoutTargetDetails';
type Props={prescription:Record<string,unknown>|null|undefined;rationale?:string|null;ftpWatts:number|null;plannedMinutes:number;completedMinutes?:number|null;completedSource?:string|null};
export default function PremiumWorkoutTabs({prescription,rationale,ftpWatts,plannedMinutes,completedMinutes,completedSource}:Props){
 const [tab,setTab]=useState<'overview'|'intervals'|'notes'>('overview');
 const source=prescription?.azurWorkout as {steps?:unknown}|undefined;
 const intervals=normalizeWorkoutIntervals(source?.steps);
 const valid=intervals.filter(x=>x.durationSec!==null);
 const duration=valid.reduce((n,x)=>n+(x.durationSec||0),0)/60;
 const cadenceNotes:string[]=[];
 const addCadence=(item:unknown)=>{
  if(!item||typeof item!=='object')return;
  const rec=item as Record<string,unknown>;
  const cadence=rec.cadenceRpm;
  if(Array.isArray(cadence)&&cadence.length===2&&cadence.every(x=>typeof x==='number'))cadenceNotes.push(cadence.join('–')+' rpm');
  if(rec.type==='repeat'){addCadence(rec.work);addCadence(rec.recovery);}
 };
 if(Array.isArray(source?.steps))source.steps.forEach(addCadence);
 return <section className="azur-premium-workout-tabs">
  <div className="azur-workout-tab-nav" role="tablist" aria-label="Workout information">
   {(['overview','intervals','notes'] as const).map(t=><button type="button" key={t} role="tab" aria-selected={tab===t} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}
  </div>
  {tab==='overview'&&<div role="tabpanel" className="azur-workout-tab-content">
   <p>{rationale||'Review this session and its prescribed training objective.'}</p>
   <div className="azur-workout-facts">
    <div><small>Planned</small><strong>{plannedMinutes} min</strong></div>
    <div><small>Completed</small><strong>{completedMinutes==null?'Not recorded':completedMinutes+' min'}</strong></div>
    <div><small>Structured targets</small><strong>{intervals.length?intervals.length+' blocks':'Not supplied'}</strong></div>
   </div>
   {completedMinutes!=null&&<p>Recorded duration difference: {completedMinutes-plannedMinutes>=0?'+':''}{completedMinutes-plannedMinutes} min{completedSource?' · '+completedSource:''}. Duration alone does not establish intensity compliance.</p>}
   {intervals.length>0&&<p>Prescribed timed intervals: {Math.round(duration*10)/10} min. Targets below use original workout prescription.</p>}
  </div>}
  {tab==='intervals'&&<div role="tabpanel" className="azur-workout-tab-content">
   <WorkoutTargetDetails prescription={prescription} ftpWatts={ftpWatts}/>
   {cadenceNotes.length>0&&<p>Prescribed cadence: {[...new Set(cadenceNotes)].join(', ')}. Maintain technique and appropriate torque.</p>}
  </div>}
  {tab==='notes'&&<div role="tabpanel" className="azur-workout-tab-content">
   <h4>Coaching purpose</h4><p>{rationale||'No additional coaching rationale recorded.'}</p>
   <p>{typeof prescription?.focus==='string'?prescription.focus:'No additional focus notes supplied.'}</p>
   <small>Additional workout notes and editable athlete feedback remain in the detailed sections below.</small>
  </div>}
 </section>;
}
