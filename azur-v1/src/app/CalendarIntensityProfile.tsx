import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';
import './premiumWorkoutV103.css';

/** Display-only profile. Never guesses missing targets or rewrites a saved workout. */
export default function CalendarIntensityProfile({ steps }: { steps: unknown }) {
 const intervals = normalizeWorkoutIntervals(steps);
 if (!intervals.length || intervals.length > 120 || intervals.some(s=>s.durationSec===null || s.durationSec<=0 || !s.target)) return null;
 const total=intervals.reduce((n,s)=>n+(s.durationSec||0),0);
 const targets=intervals.map(s=>s.target!);
 const metric=targets[0].metric;
 if (!total || !targets.every(t=>t.metric===metric)) return null;
 const pace=metric==='pace_sec_per_km'||metric==='swim_pace_sec_per_100m';
 const performance=targets.map(t=>pace?1/((t.low+t.high)/2):(t.low+t.high)/2);
 if(performance.some(v=>!Number.isFinite(v)||v<=0))return null;
 const min=Math.min(...performance),max=Math.max(...performance),span=max-min;
 const width=600,height=105,base=90;
 let elapsed=0;
 const bars=intervals.map((s,i)=>{
  const x=elapsed/total*width;elapsed+=s.durationSec!;
  const w=elapsed/total*width-x;
  const barHeight=span===0?44:20+60*(performance[i]-min)/span;
  return {x,w,y:base-barHeight,h:barHeight,kind:s.kind,description:`${s.kind}: ${Number((s.durationSec!/60).toFixed(1))} min, ${targets[i].low}–${targets[i].high} ${targets[i].unit}`};
 });
 return <div className="azur-v103-profile">
  <div className="azur-v103-profile-head"><strong>Workout intensity</strong><span>{Math.round(total/60)} min · {targets[0].unit}</span></div>
  <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Prescribed relative intensity over ${Math.round(total/60)} minutes, ${intervals.length} steps, measured in ${targets[0].unit}`} preserveAspectRatio="none">
   {[30,60,90].map(y=><line key={y} x1="0" x2={width} y1={y} y2={y} stroke="#36516b" strokeDasharray="4 6" strokeWidth="1"/>)}
   {bars.map((b,i)=><rect key={i} x={b.x} y={b.y} width={Math.max(0,b.w-.8)} height={b.h} rx="2" className={`azur-v103-bar ${b.kind}`}><title>{b.description}</title></rect>)}
  </svg>
  <div className="azur-v103-profile-footer"><span>0 min</span><span>Time →</span><span>{Math.round(total/60)} min</span></div>
  <small>Relative prescribed intensity · bar width represents duration, not completed performance</small>
 </div>;
}
