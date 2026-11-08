import {useEffect,useId,useState} from 'react';
import {supabase} from '../lib/supabase';
import {Bike, Waves, Footprints, ArrowUpRight, ChevronRight, UserRound} from 'lucide-react';
type Workout={id:string;title:string;sport:string;plannedDate:string;durationMin:number;status:string;rationale?:string;prescription?:Record<string,any>};
type Props={name:string;avatar?:string;race:{name?:string;raceDate?:string};phase?:string;today:string;sessions:Workout[];readiness?:{color?:string}|null;weeklyStress:number;onSession:(id:string)=>void;onNavigate:(page:string)=>void};
const icons={bike:Bike,swim:Waves,run:Footprints};
const minutes=(n:number)=>n>=60?`${Math.floor(n/60)}h ${Math.round(n%60)}m`:`${Math.round(n)} min`;
export default function AthleteDashboard({name,avatar,race,phase,today,sessions,readiness,weeklyStress,onSession,onNavigate}:Props){
 const todayHeading=useId();
 const [strategy,setStrategy]=useState<{weekly_hours:number|null;recent_weekly_hours:number|null;race_distance:string|null;race_date:string|null;swim_css_seconds_per_100m:number|null;ftp_watts:number|null;run_threshold_seconds_per_km:number|null}|null>(null);
 const [strategyLoading,setStrategyLoading]=useState(false);
 const [strategyError,setStrategyError]=useState(false);
 useEffect(()=>{let active=true;setStrategyLoading(true);supabase.auth.getUser().then(async({data,error})=>{
  if(error||!data.user){if(active){setStrategyError(true);setStrategyLoading(false);}return;}
  const result=await supabase.from('athlete_onboarding').select('weekly_hours,recent_weekly_hours,race_distance,race_date,swim_css_seconds_per_100m,ftp_watts,run_threshold_seconds_per_km').eq('user_id',data.user.id).maybeSingle();
  if(active){setStrategy(result.data);setStrategyError(!!result.error);setStrategyLoading(false);}
 }).catch(()=>{if(active){setStrategyError(true);setStrategyLoading(false);}});return()=>{active=false;};},[]);
 const pace=(seconds:number|null|undefined)=>seconds&&seconds>0?Math.floor(seconds/60)+':'+String(Math.round(seconds%60)).padStart(2,'0'):null;
 const day=new Date(today+'T12:00:00');const monday=new Date(day);monday.setDate(day.getDate()-(day.getDay()+6)%7);
 const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
 const active=sessions.filter(s=>!['cancelled','missed'].includes(s.status));
 const week=active.filter(s=>s.plannedDate>=dateKey(monday)&&s.plannedDate<=dateKey(sunday));
 const todays=active.filter(s=>s.plannedDate===today);const current=todays.find(s=>s.status!=='completed')??todays[0];
 const done=week.filter(s=>s.status==='completed').length,total=week.length;
 const plannedMinutes=week.reduce((sum,s)=>sum+(Number(s.durationMin)||0),0);
 const raceDays=race.raceDate?Math.ceil((new Date(race.raceDate+'T12:00:00').getTime()-day.getTime())/86400000):null;
 const readyLabel=!readiness?'Readiness unavailable':readiness.color==='green'?'Ready for planned training':readiness.color==='amber'?'Review your recovery':'Recovery needs attention';
 const shortRationale=current?.rationale?.trim();const insight=shortRationale?(shortRationale.length>150?shortRationale.slice(0,147)+'…':shortRationale):current?'Follow the prescribed targets. Open the session for its full structure.':'No session is scheduled today. Check your calendar for what is next.';
 return <div className="azur-white-dashboard" aria-label="Athlete dashboard">
  <header className="awd-hero"><div className="awd-brand"><img src="/brand/azur-logo-250.png" alt="Azur Triathlon Coaching"/><button type="button" aria-label="Open athlete profile" onClick={()=>onNavigate('Profile')}>{avatar?<img src={avatar} alt=""/>:<UserRound size={21}/>}</button></div><p className="awd-greeting">Your day, {name?.split(' ')[0]||'athlete'}.</p><h1>{race.name||'Your next goal'}</h1><div className="awd-race-meta"><span>{phase||'Training plan'}</span><span>{raceDays===null?'Set your race date in Profile':raceDays<0?'Review your next race goal':raceDays===0?'Race day':`${raceDays} days to race day`}</span></div></header>
  <div className="awd-body">
   <section className="awd-card awd-session" aria-labelledby={todayHeading}><div className="awd-heading"><h2 id={todayHeading}>Today’s session{todays.length>1?'s':''}</h2><span className="awd-tag">{todays.length?`${todays.length} planned`:'Unscheduled'}</span></div>
    {todays.length?todays.map(s=>{const Icon=icons[s.sport as keyof typeof icons]??Bike;const blocks=['warmup','main_set','cooldown'].flatMap(key=>Array.isArray(s.prescription?.[key])?s.prescription[key].map((b:any)=>({...b,kind:key})):[]).filter(b=>Number(b.duration_min)>0);return <article key={s.id} className={`awd-workout ${s.sport}`}><div className="awd-workout-title"><span className="awd-sport-icon"><Icon size={22}/></span><div><h3>{s.title}</h3><p>{s.sport.toUpperCase()} · {minutes(Number(s.durationMin)||0)} · {s.status==='completed'?'Recorded complete':'Planned'}</p></div></div>{blocks.length>0&&<><div className="awd-prescription" aria-hidden="true">{blocks.map((b:any,i:number)=><span key={i} className={b.kind} style={{flex:Number(b.duration_min)}}/>)}</div><p className="awd-target">{blocks.find((b:any)=>b.kind==='main_set')?.target||'Structured session'}<span>Prescribed effort</span></p></>}<button type="button" className="awd-primary" onClick={()=>onSession(s.id)}>View session <ArrowUpRight size={17}/></button></article>}):<div className="awd-unscheduled"><h3>No workout scheduled</h3><p>Your calendar has no session for today.</p><button type="button" className="awd-primary" onClick={()=>onNavigate('Calendar')}>View calendar <ArrowUpRight size={17}/></button></div>}
   </section>
   <button type="button" className="awd-card awd-readiness" onClick={()=>onNavigate('Recovery')}><span className={`awd-readiness-mark ${readiness?.color??'unknown'}`} aria-hidden="true">{readiness?'•':'—'}</span><span><span className="awd-eyebrow">Daily readiness</span><strong>{readyLabel}</strong><small>{readiness?'View the signals behind this guidance':'Add your recovery check-in'}</small></span><ChevronRight size={18}/></button>
   <section className="awd-card awd-week"><div className="awd-heading"><h2>This week</h2><button type="button" aria-label="Open weekly calendar" onClick={()=>onNavigate('Calendar')}><ArrowUpRight size={18}/></button></div><p className="awd-week-total"><strong>{done}<span> / {total} sessions</span></strong><span>{minutes(plannedMinutes)} planned</span></p><div className="awd-week-sports">{(['swim','bike','run'] as const).map(sport=>{const list=week.filter(s=>s.sport===sport),complete=list.filter(s=>s.status==='completed').length,Icon=icons[sport];return <div key={sport} className={`awd-sport-row ${sport}`}><span className="awd-sport-icon"><Icon size={17}/></span><span>{sport[0].toUpperCase()+sport.slice(1)}</span><div role="progressbar" aria-label={`${sport} recorded session completion`} aria-valuemin={0} aria-valuemax={list.length||1} aria-valuenow={complete}><i style={{width:list.length?`${complete/list.length*100}%`:'0%'}}/></div><small>{complete}/{list.length}</small></div>})}</div><small className="awd-note">Recorded completion · not a training-quality score</small><button type="button" className="awd-load-link" onClick={()=>onNavigate('Weekly Review')}>Weekly Review <span>{Math.round(weeklyStress||0)} stress points <ChevronRight size={14}/></span></button></section>
   <section className="awd-card" aria-label="My training strategy" style={{background:'#102b40',color:'#eff8ff',border:'1px solid #28546a',borderRadius:18,padding:18}}>
    <details>
     <summary style={{cursor:'pointer',listStyle:'none',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
      <span><small style={{display:'block',color:'#73c7eb',letterSpacing:1.3,fontWeight:700}}>AZUR INTELLIGENCE</small><strong style={{display:'block',fontSize:19,marginTop:5}}>My Training Strategy</strong><small style={{display:'block',color:'#adc8d9',marginTop:4}}>Your goal, starting point and coaching approach</small></span><ChevronRight size={20}/>
     </summary>
     {strategyLoading?<p>Loading your training strategy…</p>:strategyError?<p>Your strategy is temporarily unavailable. Please try again later.</p>:strategy?<div style={{paddingTop:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>
       {[
        ['Race goal',strategy.race_distance?.toUpperCase()||race.name||'Not set'],
        ['Available / week',strategy.weekly_hours!=null?strategy.weekly_hours+' hrs':'Not set'],
        ['Recent / week',strategy.recent_weekly_hours!=null?strategy.recent_weekly_hours+' hrs':'Not reported'],
        ['Race date',strategy.race_date?new Date(strategy.race_date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Not set']
       ].map(([label,value])=><div key={label} style={{background:'#16394f',borderRadius:12,padding:12,minWidth:0}}><small style={{display:'block',color:'#9cbcd0'}}>{label}</small><strong style={{display:'block',marginTop:6,overflowWrap:'anywhere'}}>{value}</strong></div>)}
      </div>
      <p style={{margin:'16px 0 6px',fontWeight:700}}>Your coaching priorities</p>
      <p style={{color:'#c3d9e6',lineHeight:1.55}}>Build consistent aerobic training that fits your available days. Your reported recent volume helps inform progression; availability alone is not a target to fill.</p>
      <p style={{color:'#c3d9e6',lineHeight:1.55}}>Starting benchmarks: {[
       pace(strategy.swim_css_seconds_per_100m)?'Swim CSS '+pace(strategy.swim_css_seconds_per_100m)+'/100m':null,
       strategy.ftp_watts?'Bike FTP '+strategy.ftp_watts+' W':null,
       pace(strategy.run_threshold_seconds_per_km)?'Run threshold '+pace(strategy.run_threshold_seconds_per_km)+'/km':null
      ].filter(Boolean).join(' · ')||'Not yet established'}. These are athlete-reported references, not independently verified measurements.</p>
      <p style={{color:'#9cbcd0',fontSize:12}}>This strategy reflects your saved onboarding answers. It does not claim to have analysed completed activity or recovery data.</p>
     </div>:<p>Your onboarding strategy is not yet available.</p>}
    </details>
   </section>
   <section className="awd-card awd-insight"><span className="awd-eyebrow">Why today matters</span><p>{insight}</p>{current&&<details><summary>Read the coaching rationale</summary><p>{current.rationale||'A coaching rationale has not been saved for this session.'}</p><button type="button" onClick={()=>onSession(current.id)}>Open session targets →</button></details>}</section>
   <button type="button" className="awd-more-link" onClick={()=>onNavigate('Data Sources')}>Connections & activity imports <ChevronRight size={16}/></button>
  </div>
 </div>;
}
