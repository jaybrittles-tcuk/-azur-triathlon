import './premiumWorkoutV103.css';
import { useState } from 'react';
import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';

type Props = { prescription: Record<string,unknown>|null|undefined; ftpWatts?:number|null; coachValidated?:boolean; swimCssSecondsPer100m?:number|null; compact?:boolean };
type Step = ReturnType<typeof normalizeWorkoutIntervals>[number];
const duration = (s:Step) => s.durationSec == null ? (s.distanceM == null ? 'Distance / time not supplied' : s.distanceM+' m') : s.durationSec < 60 ? s.durationSec+' sec' : Number((s.durationSec/60).toFixed(1))+' min';
const targetText = (s:Step,ftp?:number|null,coachValidated=false,css?:number|null) => {
 if(!s.target) return 'Target not supplied';
 const t=s.target;
 const value=t.low===t.high?String(t.low):t.low+'–'+t.high;
 const watts=t.metric==='ftp_percent'&&coachValidated&&ftp&&ftp>0?' · '+Math.round(ftp*t.low/100)+'–'+Math.round(ftp*t.high/100)+' W':'';
 const pace=(n:number)=>Math.floor(n/60)+':'+String(Math.round(n%60)).padStart(2,'0');
 const swim=t.metric==='swim_pace_sec_per_100m'?' · '+pace(t.low)+(t.high!==t.low?'–'+pace(t.high):'')+'/100m'+(css!==null&&css!==undefined?' · coach CSS '+pace(css)+'/100m':''):'';
 return value+' '+t.unit+watts+swim;
};
export default function WorkoutTargetDetails({prescription,ftpWatts,coachValidated=false,swimCssSecondsPer100m=null,compact=false}:Props){
 const [expanded,setExpanded]=useState(false);
 const workout=prescription?.azurWorkout as {steps?:unknown}|undefined;
 const steps=normalizeWorkoutIntervals(workout?.steps);
 if(!steps.length){if(Array.isArray(prescription?.steps)&&prescription.steps.length>0)return null;return compact?null:<div className="azur-target-empty">No structured steps saved. See the coach's written prescription.</div>;}
 const groups:{step:Step;count:number;start:number}[]=[];
 steps.forEach((step,i)=>{
  const previous=groups[groups.length-1];
  const same=previous&&previous.step.kind===step.kind&&previous.step.durationSec===step.durationSec&&previous.step.distanceM===step.distanceM&&JSON.stringify(previous.step.target)===JSON.stringify(step.target);
  if(same)previous.count++;else groups.push({step,count:1,start:i});
 });
 const shown=compact?groups.slice(0,3):expanded?groups:groups.slice(0,5);
 return <div className="azur-v103-steps">
  {!compact&&<div className="azur-v103-steps-heading"><strong>Workout structure</strong><span>{steps.length} steps · {groups.length} groups</span></div>}
  <div className="azur-v103-step-list">
   {shown.map(({step,count,start})=><div className={'azur-v103-step '+step.kind} key={start}>
    <div className="azur-v103-step-marker" aria-hidden="true"/>
    <div className="azur-v103-step-body"><div className="azur-v103-step-top"><strong>{step.kind.charAt(0).toUpperCase()+step.kind.slice(1)}{count>1?' × '+count:''}</strong><b>{duration(step)}</b></div>
    <div className="azur-v103-step-target">{targetText(step,ftpWatts,coachValidated,swimCssSecondsPer100m)}</div></div>
   </div>)}
  </div>
  {!compact&&groups.length>5&&<button type="button" className="azur-v103-expand" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'Show fewer steps':'Show all '+groups.length+' groups'}</button>}
  {compact&&groups.length>shown.length&&<small>+{groups.length-shown.length} more groups</small>}
 </div>;
}
