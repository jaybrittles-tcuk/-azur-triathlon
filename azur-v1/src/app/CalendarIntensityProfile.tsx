import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';

/** Compact *prescription* preview, not measured workout performance.
 * Accessible time-proportional segments with no chart labels laid over bars. */
export default function CalendarIntensityProfile({steps}:{steps:unknown}){
 const intervals=normalizeWorkoutIntervals(steps);
 if(!intervals.length||intervals.length>80||intervals.some(x=>x.durationSec===null))return null;
 const total=intervals.reduce((n,x)=>n+(x.durationSec||0),0);
 if(total<=0)return null;
 const metric=intervals[0].target?.metric;
 const comparable=Boolean(metric)&&intervals.every(x=>x.target?.metric===metric);
 const values=comparable?intervals.map(x=>(x.target!.low+x.target!.high)/2):[];
 const min=values.length?Math.min(...values):0;
 const max=values.length?Math.max(...values):0;
 const span=max-min;
 return <div className="azur-mini-interval" aria-label="Workout interval preview">
  <div className="azur-mini-interval-top">
   <span>Workout structure</span>
   <span>{intervals.length} blocks · {Math.round(total/60)} min</span>
  </div>
  <div className="azur-mini-interval-track" role="img"
   aria-label={intervals.map(x=>x.kind+' '+Math.round((x.durationSec||0)/60)+' minutes').join(', ')}>
   {intervals.map((x,i)=>{
    const level=comparable&&span>0?0.35+0.65*(values[i]-min)/span:0.6;
    return <span key={i} className={'azur-mini-interval-part '+x.kind}
     style={{flexGrow:x.durationSec||1,flexBasis:0}}
     title={x.kind+' · '+Math.round((x.durationSec||0)/60)+' min'+
      (x.target?' · '+x.target.low+'–'+x.target.high+' '+x.target.unit:'')}>
     <i style={{height:Math.round(level*100)+'%'}}/>
    </span>;
   })}
  </div>
  <div className="azur-mini-interval-legend"><span>Warm-up</span><span>Work</span><span>Recovery</span><span>Cool-down</span></div>
 </div>;
}
