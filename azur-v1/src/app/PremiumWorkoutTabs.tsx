import { useState } from 'react';
import type { ReactNode } from 'react';
import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';
import WorkoutTargetDetails from './WorkoutTargetDetails';
import CalendarIntensityProfile from './CalendarIntensityProfile';
type Props={prescription:Record<string,unknown>|null|undefined;rationale?:string|null;ftpWatts:number|null;plannedMinutes:number;completedMinutes?:number|null;completedSource?:string|null;coachingContent?:ReactNode};
export default function PremiumWorkoutTabs({prescription,rationale,ftpWatts,plannedMinutes,completedMinutes,completedSource,coachingContent}:Props){
 const [tab,setTab]=useState<'overview'|'intervals'|'notes'>('intervals');
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
 return <section className="azur-premium-workout-tabs">
  <div className="azur-workout-tab-nav" role="tablist" aria-label="Workout information">
   {(['overview','intervals','notes'] as const).map(t=><button type="button" key={t} role="tab" aria-selected={tab===t} onClick={()=>setTab(t)}>{t==='intervals'?'Workout':t==='notes'?'Coaching':'Overview'}</button>)}
  </div>
  {tab==='overview'&&<div role="tabpanel" className="azur-workout-tab-content">
   <p>{rationale||'Review this session and its prescribed training objective.'}</p>
   <div className="azur-workout-facts">
    <div><small>Scheduled</small><strong>{plannedMinutes} min</strong></div>
    <div><small>Recorded</small><strong>{completedMinutes==null?'Awaiting activity':completedMinutes+' min'}</strong></div>
    {poolSegments.length>0&&<div><small>Prescribed pool sets</small><strong>{swimMeters} m</strong></div>}
    <div><small>Workout structure</small><strong>{intervals.length?intervals.length+' timed blocks':'Coach-prescribed'}</strong></div>
   </div>
   {completedMinutes!=null&&<p>Recorded duration difference: {completedMinutes-plannedMinutes>=0?'+':''}{completedMinutes-plannedMinutes} min{completedSource?' · '+completedSource:''}. Duration alone does not establish intensity compliance.</p>}
   {intervals.length>0&&<p className="azur-workout-footnote">Timed intervals: {Math.round(duration)} min. See Workout for prescribed targets.</p>}
  </div>}
  {tab==='intervals'&&<div role="tabpanel" className="azur-workout-tab-content">
   {poolSegments.length>0&&<div style={{padding:'12px 14px',border:'1px solid #28546a',borderRadius:14,background:'#0d2940',marginBottom:12}}>
    <strong>Pool intervals · {swimMeters} m prescribed</strong>
    {poolSegments.map((segment,index)=><div key={index} style={{padding:'9px 0',borderBottom:index===poolSegments.length-1?'none':'1px solid #28485e'}}>
      <strong>{Number(segment.repeats)||0} × {Number(segment.distanceMeters)||0} m</strong> · {String(segment.purpose||'Swim')} · {Number(segment.restSeconds)||0}s recovery
      <div style={{opacity:.82,fontSize:13}}>{String(segment.target||'Comfortable, controlled effort')}</div>
    </div>)}
    {estimatedSwimSeconds>plannedMinutes*60&&<p role="note" style={{fontSize:12,color:'#f9c56e'}}>The interval estimate exceeds the session time. Ask your coach to review before swimming.</p>}
    <p style={{fontSize:12,opacity:.8,marginBottom:0}}>Warm-up and cool-down remain part of the timed session. Distances must be adjusted to your actual pace and available time.</p>
   </div>}
   {intervals.length > 0 && <CalendarIntensityProfile steps={source?.steps} />}
   {intervals.length ? <div className="azur-workout-compact-prescription" style={{padding:'12px 2px',lineHeight:1.55}}>
    <h4 style={{margin:'0 0 10px'}}>Your workout</h4>
    {warmups.length>0&&<p style={{margin:'8px 0'}}><strong>Warm-up:</strong> {warmups.map(describeBlock).join(' · ')}</p>}
    {middle.length>0&&<p style={{margin:'8px 0'}}><strong>Main set:</strong> {grouped.map(x=>(x.count>1?x.count+' × ':'')+x.label).join(' · ')}</p>}
    {cooldowns.length>0&&<p style={{margin:'8px 0'}}><strong>Cool-down:</strong> {cooldowns.map(describeBlock).join(' · ')}</p>}
    <details style={{marginTop:14}}><summary style={{cursor:'pointer',fontWeight:600}}>View all {intervals.length} interval blocks and targets</summary><WorkoutTargetDetails prescription={prescription} ftpWatts={ftpWatts}/></details>
   </div> : <p>Review the coach-prescribed warm-up, main set and cool-down in the detailed instructions below.</p>}
   {cadenceNotes.length>0&&<p>Prescribed cadence: {[...new Set(cadenceNotes)].join(', ')}. Maintain technique and appropriate torque.</p>}
  </div>}
  {tab==='notes'&&<div role="tabpanel" className="azur-workout-tab-content">
   {coachingContent ?? <p>Coaching insights are not available for this workout yet.</p>}
  </div>}
 </section>;
}
