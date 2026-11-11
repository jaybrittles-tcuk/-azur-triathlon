type Step={durationMin?:number;target?:string};
type PoolSet={repeats?:number;distanceMeters?:number;target?:string;restSeconds?:number;purpose?:string};
type Props={prescription:Record<string,any>;rationale?:string|null;sport:string;plannedMinutes:number};

const tidy=(value:unknown)=>String(value??'').replace(/\s+/g,' ').trim();
const cleanTarget=(target:unknown)=>tidy(target)
 .replace(/\b(?:interval|block|repeat)\s*\d+\s*\/\s*\d+\s*·?\s*/ig,'')
 .replace(/\b(?:interval|block|repeat)\s*\d+\s*\/\s*\d+/ig,'')
 .trim();
const intensity=(target:unknown)=>{
 const text=tidy(target).toLowerCase();
 const match=text.match(/\brpe\s*(\d+(?:\.\d+)?)/);
 if(match)return Math.max(.17,Math.min(1,Number(match[1])/10));
 if(/recovery|cool.down|very easy|walk/.test(text))return .18;
 if(/threshold|z4|vo2|z5/.test(text))return .85;
 if(/tempo|moderate|steady/.test(text))return .55;
 return .34;
};
export default function WorkoutSummaryV4({prescription,rationale,sport,plannedMinutes}:Props){
 const steps=(Array.isArray(prescription?.steps)?prescription.steps:[]).filter((s:Step)=>Number(s?.durationMin)>0) as Step[];
 const pool=(Array.isArray(prescription?.poolSegments)?prescription.poolSegments:[]) as PoolSet[];
 const poolMetres=pool.reduce((n,s)=>n+(Number(s.repeats)||0)*(Number(s.distanceMeters)||0),0);
 const validTime=steps.reduce((n,s)=>n+Number(s.durationMin||0),0);
 const total=validTime>0?validTime:plannedMinutes;
 const groupLabels=(steps:Step[])=>{
  const groups:{label:string;minutes:number;count:number;target:string}[]=[];
  for(let i=0;i<steps.length;i++){
   const x=steps[i];const target=cleanTarget(x.target);const minutes=Number(x.durationMin)||0;
   const label=i===0?'Warm-up':i===steps.length-1?'Cool-down':/easy|recovery|walk|spin/i.test(target)?'Recovery':'Main set';
   const last=groups[groups.length-1];
   if(last&&last.label===label&&last.minutes===minutes&&last.target===target){last.count++;continue;}
   groups.push({label,minutes,count:1,target});
  }
  return groups;
 };
 const groups=groupLabels(steps);
 const why=tidy(prescription?.purpose?.selectionReason||rationale||prescription?.focus||'Build consistent training with an effort your coach can review.');
 return <section className="azur-v3-unified-workout azur-v3-foundation-workout" aria-label="Your workout prescription">
   <header className="azur-v3-workout-header"><div><span className="azur-v3-eyebrow">YOUR SESSION</span><h3>Workout structure</h3></div><strong>{sport==='swim'&&poolMetres>0?poolMetres+' m':plannedMinutes+' min'}</strong></header>
   {steps.length>0&&<>
     <div className="azur-v3-interval-graphic azur-v3-foundation-chart" role="img" aria-label="Illustrative relative intensity from the prescribed effort descriptions, not recorded activity data">
      {steps.map((s,i)=><span key={i} title={s.durationMin+' min · '+tidy(s.target)} style={{height:(20+intensity(s.target)*70)+'%',flexGrow:Math.max(1,Number(s.durationMin)||1),flexBasis:0,minWidth:3,background:intensity(s.target)>=.8?'#ecc15d':intensity(s.target)>=.5?'#4e91d2':'#67899f'}}/>)}
     </div>
     <div className="azur-v3-foundation-scale"><span>0m</span><span>{Math.round(total)}m</span></div>
   </>}
   {pool.length>0?<div className="azur-v3-session-sets">
      <div className="azur-v3-set-label">POOL SETS</div>
      {pool.map((s,i)=><div className="azur-v3-set-row" key={i}><div><strong>{Number(s.repeats)||1} × {Number(s.distanceMeters)||0} m</strong><p>{tidy(s.target)||'Comfortable controlled effort'}</p></div><span>{Number(s.restSeconds)||0}s rest</span></div>)}
      <p className="azur-v3-workout-cue">Swim by the prescribed distance and rest. Illustrative intensity is not a validated CSS target.</p>
    </div>:<div className="azur-v3-prescription">
     {groups.filter(g=>g.label!=='Recovery').map((g,i)=><div className="azur-v3-prescription-row" key={i}>
       <strong>{g.label}</strong><div className="azur-v3-foundation-row"><b>{g.count>1?g.count+' × ':''}{g.minutes} min</b><span>{g.target||'Follow coach targets'}</span></div>
     </div>)}
     {groups.some(g=>g.label==='Recovery')&&<p className="azur-v3-workout-cue">Recovery intervals are included in the full breakdown.</p>}
    </div>}
   {steps.length>0&&<details className="azur-v3-workout-disclosure">
     <summary>Full interval breakdown <span>›</span></summary>
     <ol className="azur-v3-foundation-steps">{steps.map((s,i)=><li key={i}><strong>{s.durationMin} min</strong><span>{tidy(s.target)}</span></li>)}</ol>
   </details>}
   <details className="azur-v3-workout-disclosure">
     <summary>Why today matters <span>›</span></summary>
     <p>{why}</p>
     {prescription?.purpose?.responseToMonitor&&<p>What we'll monitor: {tidy(prescription.purpose.responseToMonitor)}</p>}
   </details>
   {validTime>0&&Math.abs(validTime-plannedMinutes)>1&&<p className="azur-v3-evidence-warning" role="note">The listed intervals total {validTime} min; the calendar lists {plannedMinutes} min. Check with your coach before following conflicting durations.</p>}
 </section>;
}
