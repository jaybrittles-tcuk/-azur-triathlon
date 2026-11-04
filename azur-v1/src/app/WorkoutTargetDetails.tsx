import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';

type Props={prescription:Record<string,unknown>|null|undefined;ftpWatts?:number|null;compact?:boolean};
export default function WorkoutTargetDetails({prescription,ftpWatts,compact=false}:Props){
 const source=prescription?.azurWorkout as {steps?:unknown}|undefined;
 const blocks=normalizeWorkoutIntervals(source?.steps);
 if(!blocks.length)return compact?null:<div className="azur-target-empty">Detailed interval targets are not supplied for this workout. Follow the written instructions and ask your coach about anything unclear.</div>;
 const total=blocks.reduce((s,b)=>s+(b.durationSec||0),0)/60;
 const rows=compact?blocks.slice(0,4):blocks;
 return <div className="azur-v11-workout-breakdown">
  <div className="azur-v11-breakdown-heading">
   <div><span className="azur-v11-kicker">THE SESSION</span><strong>Workout breakdown</strong></div>
   <span className="azur-v11-minutes">{Math.round(total)} min · {blocks.length} blocks</span>
  </div>
  <div className="azur-v11-timebar" role="img"
   aria-label={blocks.map(b=>b.kind+' '+Math.round((b.durationSec||0)/60)+' minutes').join(', ')}>
   {blocks.map((b,i)=><span key={i} className={'azur-v11-timebar-segment '+b.kind}
    style={{flexGrow:b.durationSec||1,flexBasis:0}} title={b.kind}/>)}
  </div>
  <div className="azur-v11-step-list">
   {rows.map((b,i)=>{
    const name=b.kind==='warmup'?'Warm up':b.kind==='cooldown'?'Cool down':
     b.kind==='recovery'?'Recovery':'Main effort';
    const target=b.target?b.target.low+'–'+b.target.high+' '+b.target.unit:
     'Follow the coach prescription';
    const watts=b.target?.metric==='ftp_percent'&&typeof ftpWatts==='number'&&ftpWatts>0?
     Math.round(ftpWatts*b.target.low/100)+'–'+Math.round(ftpWatts*b.target.high/100)+' W':null;
    return <div className={'azur-v11-step '+b.kind} key={i}>
     <span className="azur-v11-step-number">{String(i+1).padStart(2,'0')}</span>
     <div className="azur-v11-step-copy"><strong>{name}</strong><small>{target}{watts?' · '+watts:''}</small></div>
     <span className="azur-v11-step-time">{b.durationSec!=null?
      Math.round(b.durationSec/60*10)/10+' min':b.distanceM!=null?b.distanceM+'m':'—'}</span>
    </div>;
   })}
  </div>
  {compact&&blocks.length>rows.length&&<small className="azur-v11-more">+{blocks.length-rows.length} more workout blocks</small>}
 </div>;
}
