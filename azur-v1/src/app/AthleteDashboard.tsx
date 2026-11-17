import {useId} from 'react';
import {Bike, Waves, Footprints, ArrowUpRight, ChevronRight, UserRound} from 'lucide-react';
type Workout={id:string;title:string;sport:string;plannedDate:string;durationMin:number;status:string;rationale?:string;prescription?:Record<string,any>};
type Props={name:string;avatar?:string;race:{name?:string;raceDate?:string};phase?:string;today:string;sessions:Workout[];readiness?:{color?:string}|null;weeklyStress:number;onSession:(id:string)=>void;onNavigate:(page:string)=>void};
const icons={bike:Bike,swim:Waves,run:Footprints};
const minutes=(n:number)=>n>=60?`${Math.floor(n/60)}h ${Math.round(n%60)}m`:`${Math.round(n)} min`;
export default function AthleteDashboard({name,avatar,race,phase,today,sessions,readiness,weeklyStress,onSession,onNavigate}:Props){
 const todayHeading=useId();
 const day=new Date(today+'T12:00:00');const monday=new Date(day);monday.setDate(day.getDate()-(day.getDay()+6)%7);
 const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
 const active=sessions.filter(s=>!['cancelled','missed'].includes(s.status));
 const week=active.filter(s=>s.plannedDate>=dateKey(monday)&&s.plannedDate<=dateKey(sunday));
 const todays=active.filter(s=>s.plannedDate===today);const current=todays.find(s=>s.status!=='completed')??todays[0];
 const upcoming=active.filter(s=>s.plannedDate>today&&s.status!=='completed').sort((a,b)=>a.plannedDate.localeCompare(b.plannedDate));
 const next=upcoming[0];
 const nextMonday=next?new Date(next.plannedDate+'T12:00:00'):null;
 if(nextMonday)nextMonday.setDate(nextMonday.getDate()-(nextMonday.getDay()+6)%7);
 const focusMonday=week.length?monday:nextMonday;
 const focusSunday=focusMonday?new Date(focusMonday):null;
 if(focusSunday)focusSunday.setDate(focusSunday.getDate()+6);
 const focusWeek=week.length?week:focusMonday&&focusSunday?active.filter(s=>s.plannedDate>=dateKey(focusMonday)&&s.plannedDate<=dateKey(focusSunday)):[];
 const isUpcomingWeek=week.length===0&&focusWeek.length>0;
 const focusTitle=isUpcomingWeek?'Your next training week':'This week';
 const done=week.filter(s=>s.status==='completed').length,total=week.length;
 const plannedMinutes=week.reduce((sum,s)=>sum+(Number(s.durationMin)||0),0);
 const sportMinutes=Object.fromEntries(['swim','bike','run'].map(sport=>[sport,focusWeek.filter(s=>s.sport===sport).reduce((sum,s)=>sum+(Number(s.durationMin)||0),0)])) as Record<string,number>;
 const completedMinutes=week.filter(s=>s.status==='completed').reduce((sum,s)=>sum+(Number(s.durationMin)||0),0);
 const focusMinutes=focusWeek.reduce((sum,s)=>sum+(Number(s.durationMin)||0),0);
 const weekNarrative=focusWeek.length===0
  ?'No sessions are scheduled for this week. Your coach can review the plan before training begins.'
  :done===0
   ?`${isUpcomingWeek?'Your next training week':'Your week'} contains ${focusWeek.length} planned sessions across ${Object.entries(sportMinutes).filter(([,n])=>n>0).map(([sport])=>sport).join(', ')}. Begin with the prescribed effort, and share how each workout feels so your coach has useful evidence for the next review.`
   :`You've recorded ${done} of ${total} planned sessions (${minutes(completedMinutes)} of ${minutes(plannedMinutes)} scheduled). This shows recorded completion, not fitness gain or readiness. Your coach should consider session feedback and recovery before adjusting the next week.`;
 const raceDays=race.raceDate?Math.ceil((new Date(race.raceDate+'T12:00:00').getTime()-day.getTime())/86400000):null;
 const readyLabel=!readiness?'Readiness unavailable':readiness.color==='green'?'Ready for planned training':readiness.color==='amber'?'Review your recovery':'Recovery needs attention';
 const shortRationale=current?.rationale?.trim();const insight=shortRationale?(shortRationale.length>150?shortRationale.slice(0,147)+'…':shortRationale):current?'Follow the prescribed targets. Open the session for its full structure.' :next?`Your next session is ${next.title}. Open it to see the prescribed sets and targets.`:'No session is scheduled today. Check your calendar for what is next.';
 return <div className="azur-white-dashboard" aria-label="Athlete dashboard">
  <header className="awd-hero"><div className="awd-brand"><img src="/brand/azur-logo-250.png" alt="Azur Triathlon Coaching"/><button type="button" aria-label="Open athlete profile" onClick={()=>onNavigate('Profile')}>{avatar?<img src={avatar} alt=""/>:<UserRound size={21}/>}</button></div><p className="awd-greeting">Your day, {name?.split(' ')[0]||'athlete'}.</p><h1>{(race.name||"Your next goal").replace(/^ironman triathlon$/i,"IRONMAN training")}</h1><div className="awd-race-meta"><span>{phase||'Training plan'}</span><span>{raceDays===null?'Set your race date in Profile':raceDays<0?'Review your next race goal':raceDays===0?'Race day':`${raceDays} days to race day`}</span></div></header>
  <div className="awd-body">
   <section className="awd-card awd-session" aria-labelledby={todayHeading}><div className="awd-heading"><h2 id={todayHeading}>{todays.length?'Today’s session':next?'Coming up next':'Today'}</h2><span className="awd-tag">{todays.length?`${todays.length} planned`:next?'Upcoming':'Recovery day'}</span></div>
    {todays.length?todays.map(s=>{const Icon=icons[s.sport as keyof typeof icons]??Bike;const blocks=['warmup','main_set','cooldown'].flatMap(key=>Array.isArray(s.prescription?.[key])?s.prescription[key].map((b:any)=>({...b,kind:key})):[]).filter(b=>Number(b.duration_min)>0);return <article key={s.id} className={`awd-workout ${s.sport}`}><div className="awd-workout-title"><span className="awd-sport-icon"><Icon size={22}/></span><div><h3>{s.title}</h3><p>{s.sport.toUpperCase()} · {minutes(Number(s.durationMin)||0)} · {s.status==='completed'?'Recorded complete':'Planned'}</p></div></div>{blocks.length>0&&<><div className="awd-prescription" aria-hidden="true">{blocks.map((b:any,i:number)=><span key={i} className={b.kind} style={{flex:Number(b.duration_min)}}/>)}</div><p className="awd-target">{blocks.find((b:any)=>b.kind==='main_set')?.target||'Structured session'}<span>Prescribed effort</span></p></>}<button type="button" className="awd-primary" onClick={()=>onSession(s.id)}>View session <ArrowUpRight size={17}/></button></article>} ):next?<div className="awd-unscheduled"><span className="awd-eyebrow">{new Date(next.plannedDate+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</span><h3>{next.title}</h3><p>{next.sport.toUpperCase()} · {minutes(Number(next.durationMin)||0)} · Planned</p><button type="button" className="awd-primary" onClick={()=>onSession(next.id)}>Preview workout <ArrowUpRight size={17}/></button></div>:<div className="awd-unscheduled"><h3>Recovery day</h3><p>There is no workout on your calendar today.</p><button type="button" className="awd-primary" onClick={()=>onNavigate('Calendar')}>Open calendar <ArrowUpRight size={17}/></button></div>}
   </section>
   <button type="button" className="awd-card awd-readiness" onClick={()=>onNavigate('Recovery')}><span className={`awd-readiness-mark ${readiness?.color??'unknown'}`} aria-hidden="true">{readiness?'•':'—'}</span><span><span className="awd-eyebrow">Daily readiness</span><strong>{readyLabel}</strong><small>{readiness?'View the signals behind this guidance':'Add your recovery check-in'}</small></span><ChevronRight size={18}/></button>
   {focusWeek.length>0&&<section className="awd-card awd-agenda" aria-label="Training week timeline"><div className="awd-heading"><h2>{isUpcomingWeek?'Your upcoming sessions':'Your training schedule'}</h2><button type="button" aria-label="View calendar" onClick={()=>onNavigate('Calendar')}><ArrowUpRight size={18}/></button></div><p className="awd-agenda-summary">{focusWeek.length} sessions · {minutes(focusMinutes)} planned · {focusMonday?.toLocaleDateString("en-GB",{day:"numeric",month:"long"})}</p><div className="awd-agenda-list">{[...focusWeek].sort((a,b)=>a.plannedDate.localeCompare(b.plannedDate)).map(session=>{const Icon=icons[session.sport as keyof typeof icons]??Bike;return <button type="button" key={session.id} className={`awd-agenda-item ${session.sport}`} onClick={()=>onSession(session.id)}><span className="awd-agenda-date"><strong>{new Date(session.plannedDate+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'})}</strong><small>{new Date(session.plannedDate+'T12:00:00').getDate()}</small></span><span className="awd-sport-icon"><Icon size={18}/></span><span className="awd-agenda-copy"><strong>{session.title}</strong><small>{session.sport} · {minutes(Number(session.durationMin)||0)} · {session.status==='completed'?'Completed':'Planned'}</small></span><ChevronRight size={17}/></button>})}</div></section>}
   {focusWeek.length>0&&<section className="awd-card awd-insight awd-coaching-brief" aria-label="AZUR weekly coaching brief"><span className="awd-eyebrow">AZUR Intelligence · Training brief</span><h2>Why this week matters</h2><p>{weekNarrative}</p><small className="awd-note">Based on your scheduled training and recorded completion. Individual adaptation and recovery still require validated evidence and coach review.</small><button type="button" className="awd-load-link" onClick={()=>onNavigate('Weekly Review')}>Open coaching review <ChevronRight size={16}/></button></section>}
   {current&&<section className="awd-card awd-insight"><span className="awd-eyebrow">Why today matters</span><p>{insight}</p>{current&&<details><summary>Read the coaching rationale</summary><p>{current.rationale||'A coaching rationale has not been saved for this session.'}</p><button type="button" onClick={()=>onSession(current.id)}>Open session targets →</button></details>}</section>}
   <button type="button" className="awd-more-link" onClick={()=>onNavigate('Data Sources')}>Connections & activity imports <ChevronRight size={16}/></button>
  </div>
 </div>;
}
