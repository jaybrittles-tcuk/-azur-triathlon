import { useState } from 'react';
import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';
import WorkoutTargetDetails from './WorkoutTargetDetails';
import CalendarIntensityProfile from './CalendarIntensityProfile';
type Props={prescription:Record<string,unknown>|null|undefined;rationale?:string|null;ftpWatts:number|null;plannedMinutes:number;completedMinutes?:number|null;completedSource?:string|null};
export default function PremiumWorkoutTabs({prescription,rationale,ftpWatts,plannedMinutes,completedMinutes,completedSource}:Props){
 const [tab,setTab]=useState<'overview'|'intervals'|'notes'>('intervals');
 const source=prescription?.azurWorkout as {steps?:unknown}|undefined;
 const intervals=normalizeWorkoutIntervals(source?.steps);
 const valid=intervals.filter(x=>x.durationSec!==null);
 const duration=valid.reduce((n,x)=>n+(x.durationSec||0),0)/60;
 const distanceBased=intervals.some(x=>x.distanceM!==null && x.durationSec===null);
 const prescribedDistance=intervals.every(x=>x.distanceM!==null)?intervals.reduce((n,x)=>n+(x.distanceM||0),0):null;
 const cadenceNotes:string[]=[];
 const addCadence=(item:unknown)=>{
  if(!item||typeof item!=='object')return;
  const rec=item as Record<string,unknown>;
  const cadence=rec.cadenceRpm;
  if(Array.isArray(cadence)&&cadence.length===2&&cadence.every(x=>typeof x==='number'))cadenceNotes.push(cadence.join('–')+' rpm');
  if(rec.type==='repeat'){addCadence(rec.work);addCadence(rec.recovery);}
 };
 if(Array.isArray(source?.steps))source.steps.forEach(addCadence);
 const describeTarget=(target:(typeof intervals)[number]['target'])=>target?(`${target.low===target.high?target.low:target.low+'–'+target.high}${target.unit===' /10'?' /10':target.unit==='/%'?'%':target.unit}`):'target not supplied';
 const describeBlock=(block:(typeof intervals)[number])=>`${block.durationSec!==null?Math.round(block.durationSec/60)+' min':block.distanceM!==null?block.distanceM+' m':'duration not supplied'} · ${describeTarget(block.target)}`;
 const warmups=intervals.filter(x=>x.kind==='warmup');
 const cooldowns=intervals.filter(x=>x.kind==='cooldown');
 const middle=intervals.filter(x=>x.kind==='work'||x.kind==='recovery');
 const grouped:{count:number;label:string}[]=[];
 const hasDistancePrescription=intervals.some(x=>x.distanceM!==null);
 const summary=prescribedDistance!==null?`${prescribedDistance} m prescribed`:hasDistancePrescription?'Distance-based intervals':`${plannedMinutes} min planned`;
 middle.forEach(x=>{const label=`${x.kind==='work'?'Work':'Recovery'}: ${describeBlock(x)}`;const prev=grouped[grouped.length-1];if(prev?.label===label)prev.count++;else grouped.push({count:1,label});});
 return <section className="azur-premium-workout-tabs">
  <div className="azur-workout-quick-summary" style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:12,padding:"4px 2px 12px"}}><strong style={{fontSize:"1.05rem"}}>Your session</strong><span style={{color:"#a9bed0",fontSize:".88rem"}}>{summary}</span></div>
  <div className="azur-workout-tab-nav" role="tablist" aria-label="Workout information">
   {(['overview','intervals','notes'] as const).map(t=><button type="button" key={t} role="tab" aria-selected={tab===t} onClick={()=>setTab(t)}>{t==='intervals'?'Workout':t==='notes'?'Coaching':'Overview'}</button>)}
  </div>
  {tab==='overview'&&<div role="tabpanel" className="azur-workout-tab-content">
   <p>{rationale||'Review this session and its prescribed training objective.'}</p>
   <div className="azur-workout-facts">
    <div><small>Scheduled</small><strong>{plannedMinutes} min</strong></div>
    <div><small>Recorded</small><strong>{completedMinutes==null?'Awaiting activity':completedMinutes+' min'}</strong></div>
    <div><small>Workout structure</small><strong>{intervals.length?intervals.length+' prescribed blocks':'Coach-prescribed'}</strong></div>
   </div>
   {completedMinutes!=null&&<p>Recorded duration difference: {completedMinutes-plannedMinutes>=0?'+':''}{completedMinutes-plannedMinutes} min{completedSource?' · '+completedSource:''}. Duration alone does not establish intensity compliance.</p>}
   {prescribedDistance!==null&&<p className="azur-workout-footnote">Prescribed distance: {prescribedDistance} m.</p>}
   {duration>0&&<p className="azur-workout-footnote">Timed intervals: {Math.round(duration)} min. Distance-based intervals are not converted into estimated durations.</p>}
  </div>}
  {tab==='intervals'&&<div role="tabpanel" className="azur-workout-tab-content">
   {intervals.length > 0 && !distanceBased && <CalendarIntensityProfile steps={source?.steps} />}
   {distanceBased&&<p className="azur-workout-footnote">Distance-based workout · Follow the prescribed repetitions and recovery. No estimated time-based intensity chart is shown.</p>}
   {intervals.length ? <div className="azur-workout-compact-prescription" style={{padding:'12px 2px',lineHeight:1.55}}>
    <h4 style={{margin:'0 0 10px'}}>Workout structure</h4>
    {warmups.length>0&&<p style={{margin:'8px 0'}}><strong>Warm-up:</strong> {warmups.map(describeBlock).join(' · ')}</p>}
    {middle.length>0&&<p style={{margin:'8px 0'}}><strong>Main set:</strong> {grouped.map(x=>(x.count>1?x.count+' × ':'')+x.label).join(' · ')}</p>}
    {cooldowns.length>0&&<p style={{margin:'8px 0'}}><strong>Cool-down:</strong> {cooldowns.map(describeBlock).join(' · ')}</p>}
    <details style={{marginTop:14}}><summary style={{cursor:'pointer',fontWeight:600}}>View all {intervals.length} interval blocks and targets</summary><WorkoutTargetDetails prescription={prescription} ftpWatts={ftpWatts}/></details>
   </div> : <p>Review the coach-prescribed warm-up, main set and cool-down in the detailed instructions below.</p>}
   {cadenceNotes.length>0&&<p>Prescribed cadence: {[...new Set(cadenceNotes)].join(', ')}. Maintain technique and appropriate torque.</p>}
  </div>}
  {tab==='notes'&&<div role="tabpanel" className="azur-workout-tab-content">
   <h4>Coach guidance</h4><p>{rationale||'No additional coaching rationale recorded.'}</p>
   <p>{typeof prescription?.focus==='string'?prescription.focus:'No additional focus notes supplied.'}</p>
   <small>Record your actual effort and feedback in the workout completion section.</small>
  </div>}
 </section>;
}
