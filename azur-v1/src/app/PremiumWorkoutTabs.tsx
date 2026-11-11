import type { ReactNode } from 'react';
import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';
import WorkoutTargetDetails from './WorkoutTargetDetails';
import CalendarIntensityProfile from './CalendarIntensityProfile';
type Props={prescription:Record<string,unknown>|null|undefined;rationale?:string|null;ftpWatts:number|null;plannedMinutes:number;completedMinutes?:number|null;completedSource?:string|null;coachingContent?:ReactNode};
export default function PremiumWorkoutTabs({prescription,rationale,ftpWatts,plannedMinutes,completedMinutes,completedSource,coachingContent}:Props){
 const poolSegments=Array.isArray(prescription?.poolSegments)?prescription.poolSegments.filter((segment):segment is Record<string,unknown>=>!!segment&&typeof segment==='object'&&!Array.isArray(segment)):[];
 const swimMeters=poolSegments.reduce((sum,segment)=>sum+Math.max(0,Number(segment.repeats)||0)*Math.max(0,Number(segment.distanceMeters)||0),0);
 const estimatedSwimSeconds=poolSegments.reduce((sum,segment)=>{
  const reps=Math.max(0,Number(segment.repeats)||0);
  const distance=Math.max(0,Number(segment.distanceMeters)||0);
  const pace=Number(prescription?.swim_css_seconds_per_100m);
  return sum+(Number.isFinite(pace)&&pace>0?reps*distance*pace/100:0)+Math.max(0,reps-1)*Math.max(0,Number(segment.restSeconds)||0);
 },0);
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
 const describeTarget=(target:(typeof intervals)[number]['target'])=>target?(`${target.low===target.high?target.low:target.low+'–'+target.high}${target.unit===' /10'?' /10':target.unit==='/%'?'%':target.unit}`):'target not supplied';
 const describeBlock=(block:(typeof intervals)[number])=>`${block.durationSec!==null?Math.round(block.durationSec/60)+' min':block.distanceM!==null?block.distanceM+' m':'duration not supplied'} · ${describeTarget(block.target)}`;
 const warmups=intervals.filter(x=>x.kind==='warmup');
 const cooldowns=intervals.filter(x=>x.kind==='cooldown');
 const middle=intervals.filter(x=>x.kind==='work'||x.kind==='recovery');
 const grouped:{count:number;label:string}[]=[];
 middle.forEach(x=>{const label=`${x.kind==='work'?'Work':'Recovery'}: ${describeBlock(x)}`;const prev=grouped[grouped.length-1];if(prev?.label===label)prev.count++;else grouped.push({count:1,label});});
 return <section className="azur-premium-workout-tabs azur-v3-unified-workout" aria-label="Prescribed workout">
   <header className="azur-v3-workout-header">
     <div><span className="azur-v3-eyebrow">YOUR SESSION</span><h3>Workout structure</h3></div>
     <strong>{poolSegments.length>0&&swimMeters>0?swimMeters+' m':plannedMinutes+' min'}</strong>
   </header>
   {intervals.length>0&&<div className="azur-v3-interval-graphic"><CalendarIntensityProfile steps={source?.steps}/></div>}
   {poolSegments.length>0&&<div className="azur-v3-session-sets">
     <div className="azur-v3-set-label">POOL SETS</div>
     {poolSegments.map((segment,index)=><div key={index} className="azur-v3-set-row">
       <div><strong>{Number(segment.repeats)||0} × {Number(segment.distanceMeters)||0} m</strong>
       <p>{String(segment.target||'Comfortable controlled effort')}</p></div>
       <span>{Number(segment.restSeconds)||0}s rest</span>
     </div>)}
     {estimatedSwimSeconds>plannedMinutes*60&&<p role="note" className="azur-v3-evidence-warning">Estimated swim interval time exceeds the planned duration. Ask your coach to review the structure.</p>}
   </div>}
   {intervals.length>0?<div className="azur-v3-prescription">
     {warmups.length>0&&<div className="azur-v3-prescription-row"><strong>Warm-up</strong><p>{warmups.map(describeBlock).join(' · ')}</p></div>}
     {middle.length>0&&<div className="azur-v3-prescription-row"><strong>Main set</strong><p>{grouped.map(x=>(x.count>1?x.count+' × ':'')+x.label).join(' · ')}</p></div>}
     {cooldowns.length>0&&<div className="azur-v3-prescription-row"><strong>Cool-down</strong><p>{cooldowns.map(describeBlock).join(' · ')}</p></div>}
   </div>:poolSegments.length===0&&<p className="azur-v3-evidence-warning">Structured intervals are not available in this prescription. Review your coach's instructions before training.</p>}
   {cadenceNotes.length>0&&<p className="azur-v3-workout-cue">Cadence targets: {[...new Set(cadenceNotes)].join(', ')}</p>}
   <details className="azur-v3-workout-disclosure">
     <summary>Why today matters <span>›</span></summary>
     <p>{rationale||'Follow the prescribed workout at a sustainable effort and report how it felt.'}</p>
   </details>
   <details className="azur-v3-workout-disclosure">
     <summary>Detailed targets &amp; coaching <span>›</span></summary>
     {intervals.length>0&&<WorkoutTargetDetails prescription={prescription} ftpWatts={ftpWatts}/>}
     {coachingContent}
     {completedMinutes!=null&&<p className="azur-v3-workout-cue">Recorded {completedMinutes} min versus {plannedMinutes} min planned{completedSource?' · '+completedSource:''}. Duration alone does not confirm intensity compliance.</p>}
   </details>
 </section>;
}
