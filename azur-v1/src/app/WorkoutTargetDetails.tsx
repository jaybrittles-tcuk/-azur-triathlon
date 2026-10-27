import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';

type Props={prescription:Record<string,unknown>|null|undefined; ftpWatts?:number|null; compact?:boolean};
export default function WorkoutTargetDetails({prescription,ftpWatts,compact=false}:Props){
 const workout=prescription?.azurWorkout as {steps?:unknown}|undefined;
 const intervals=normalizeWorkoutIntervals(workout?.steps);
 if(!intervals.length)return compact?null:<div className="azur-target-empty">Structured interval targets are not available for this session.</div>;
 const rows=compact?intervals.slice(0,4):intervals;
 return <div className={compact?'azur-workout-targets compact':'azur-workout-targets'}>
  {!compact&&<h4>Structured intervals <small>{intervals.length} blocks</small></h4>}
  {rows.map((step,index)=><div className={`azur-target-row ${step.kind}`} key={index}>
   <span className="azur-target-kind">{step.kind}</span>
   <strong>{step.durationSec!=null?`${Math.round(step.durationSec/60*10)/10} min`:step.distanceM!=null?`${step.distanceM} m`:'Duration unavailable'}</strong>
   <span>{step.target?`${step.target.low}–${step.target.high} ${step.target.unit}`:'Target not supplied'}
    {step.target?.metric==='ftp_percent'&&typeof ftpWatts==='number'&&ftpWatts>0&&<small>{Math.round(ftpWatts*step.target.low/100)}–{Math.round(ftpWatts*step.target.high/100)} W</small>}
   </span>
  </div>)}
  {compact&&intervals.length>rows.length&&<small>+{intervals.length-rows.length} more blocks · Open for full details</small>}
 </div>;
}
