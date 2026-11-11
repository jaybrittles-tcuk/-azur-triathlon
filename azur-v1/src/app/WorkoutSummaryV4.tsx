import {useState} from 'react';

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
 const [showAll,setShowAll]=useState(false);
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
 return <section aria-label="Your workout prescription" style={{padding:'16px',border:'1px solid #2d4c64',borderRadius:20,background:'#101d2f',color:'#eaf5ff',margin:'14px 0'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'baseline',marginBottom:12}}>
    <div><div style={{letterSpacing:2,fontSize:11,fontWeight:800,color:'#88afc8'}}>YOUR WORKOUT</div><h3 style={{margin:'5px 0 0',fontSize:22}}>Session structure</h3></div>
    <strong style={{whiteSpace:'nowrap',fontSize:15}}>{sport==='swim'&&poolMetres>0?poolMetres+' m':plannedMinutes+' min'}</strong>
   </div>
   {steps.length>0&&<div role="img" aria-label="Workout intensity structure, illustrative from prescribed effort labels" style={{display:'flex',alignItems:'end',gap:3,height:80,padding:'10px 0 4px',borderBottom:'1px solid #2c5168',marginBottom:14}}>
    {steps.map((s,i)=><div key={i} title={s.durationMin+' min · '+tidy(s.target)} style={{
     height:(20+intensity(s.target)*58)+'px',
     flexGrow:Math.max(1,Number(s.durationMin)||1),flexBasis:0,minWidth:3,maxWidth:'100%',borderRadius:'4px 4px 0 0',
     background:intensity(s.target)>=.8?'#f0c15d':intensity(s.target)>=.5?'#3ba0e2':'#276d9b'
    }}/>)}
   </div>}
   {pool.length>0?<div style={{display:'grid',gap:10}}>
    {pool.map((s,i)=><div key={i} style={{display:'flex',gap:12,justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #25445b'}}>
     <div><strong>{Number(s.repeats)||1} × {Number(s.distanceMeters)||0} m</strong><p style={{margin:'4px 0 0',color:'#b7d0e1',fontSize:13}}>{tidy(s.target)||'Comfortable controlled effort'}</p></div>
     <span style={{fontSize:12,color:'#a8c7d9',whiteSpace:'nowrap'}}>{Number(s.restSeconds)||0}s rest</span>
    </div>)}
    <small style={{color:'#8eb0c5'}}>Swim by prescribed distance and rest. The intensity graphic is only a guide; it is not a validated CSS target.</small>
   </div>:<div style={{display:'grid',gap:11}}>
    {groups.filter(x=>x.label!=='Recovery').map((g,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'minmax(85px,auto) 1fr',gap:10,padding:'6px 0',borderBottom:'1px solid #25445b'}}>
     <strong style={{color:'#d9effc'}}>{g.label}</strong><div><strong>{g.count>1?g.count+' × ':''}{g.minutes} min</strong><p style={{margin:'3px 0 5px',fontSize:13,color:'#b7d0e1'}}>{g.target||'Follow coach targets'}</p></div>
    </div>)}
    {groups.some(x=>x.label==='Recovery')&&<p style={{fontSize:12,color:'#a8c7d9',margin:'1px 0 0'}}>Recovery between efforts is included in the detailed structure below.</p>}
   </div>}
   {steps.length>0&&<details style={{marginTop:14}} open={showAll} onToggle={e=>setShowAll((e.currentTarget as HTMLDetailsElement).open)}>
    <summary style={{cursor:'pointer',color:'#9ecff2',fontSize:13,fontWeight:700}}>Full interval breakdown · {steps.length} blocks</summary>
    <div style={{marginTop:8}}>{steps.map((s,i)=><p key={i} style={{fontSize:13,margin:'7px 0',color:'#c5dce9'}}>{i+1}. {s.durationMin} min · {tidy(s.target)}</p>)}</div>
   </details>}
   <details style={{marginTop:16,borderTop:'1px solid #2c5168',paddingTop:12}}>
    <summary style={{cursor:'pointer',fontWeight:750,color:'#f4d076'}}>Why today matters</summary>
    <p style={{fontSize:13,lineHeight:1.6,color:'#c1dae8',margin:'10px 0 0'}}>{why}</p>
    {prescription?.purpose?.responseToMonitor&&<p style={{fontSize:12,color:'#a4c4d6'}}>What we will monitor: {tidy(prescription.purpose.responseToMonitor)}</p>}
   </details>
   {validTime>0&&Math.abs(validTime-plannedMinutes)>1&&<small role="note" style={{display:'block',color:'#f4d076',marginTop:12}}>Listed intervals total {validTime} min; the calendar lists {plannedMinutes} min. Check with your coach before following conflicting durations.</small>}
 </section>;
}