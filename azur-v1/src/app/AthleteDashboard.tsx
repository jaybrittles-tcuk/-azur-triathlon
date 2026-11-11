import {useEffect,useId,useState} from 'react';
import {supabase} from '../lib/supabase';
import {Bike, Waves, Footprints, ArrowUpRight, ChevronRight, UserRound} from 'lucide-react';
type Workout={id:string;title:string;sport:string;plannedDate:string;durationMin:number;status:string;rationale?:string;prescription?:Record<string,any>};
type Props={name:string;avatar?:string;race:{name?:string;raceDate?:string};phase?:string;today:string;sessions:Workout[];readiness?:{color?:string}|null;weeklyStress:number;onSession:(id:string)=>void;onNavigate:(page:string)=>void};
const icons={bike:Bike,swim:Waves,run:Footprints};
const minutes=(n:number)=>n>=60?`${Math.floor(n/60)}h ${Math.round(n%60)}m`:`${Math.round(n)} min`;
export default function AthleteDashboard({name,avatar,race,phase,today,sessions,readiness,weeklyStress,onSession,onNavigate}:Props){
 const todayHeading=useId();
 const [merseyTriBeta,setMerseyTriBeta]=useState(false);
 useEffect(()=>{
  let active=true;
  (async()=>{
   const {data:{user}}=await supabase.auth.getUser();
   if(!user)return;
   const {data:profile,error:profileError}=await supabase.from('athlete_profile').select('id').eq('user_id',user.id).maybeSingle();
   if(profileError||!profile?.id)return;
   const {data:cohort,error}=await supabase.from('athlete_beta_cohort').select('cohort_key').eq('athlete_id',profile.id).maybeSingle();
   if(active&&!error)setMerseyTriBeta(cohort?.cohort_key==='mersey_tri');
  })().catch(()=>{/* Keep default banner if cohort cannot be loaded. */});
  return()=>{active=false};
 },[]);
 const [strategy,setStrategy]=useState<{weekly_hours:number|null;recent_weekly_hours:number|null;training_background:string|null;training_consistency:string|null;race_distance:string|null;race_date:string|null;swim_css_seconds_per_100m:number|null;ftp_watts:number|null;run_threshold_seconds_per_km:number|null}|null>(null);
 const [strategyLoading,setStrategyLoading]=useState(false);
 const [coachingBrief,setCoachingBrief]=useState<{rationale:string;action:string}|null>(null);
 const [reviewEvidence,setReviewEvidence]=useState<{recent:number;previous:number;status:string;max:number;median:number;spikeReason:string}|null>(null);
 const [verifiedHistory,setVerifiedHistory]=useState<{count:number;recent:number;previous:number;swim:number;bike:number;run:number;excluded:number;weeklyCount:number}|null>(null);
 const [strategyError,setStrategyError]=useState(false);
 const [returnHours,setReturnHours]=useState('10');
 const [returnPreview,setReturnPreview]=useState<any>(null);
 const [returnPreviewBusy,setReturnPreviewBusy]=useState(false);
 const [returnPreviewError,setReturnPreviewError]=useState('');
 const loadReturnPreview=async()=>{
  const hours=Number(returnHours);
  if(!Number.isFinite(hours)||hours<3||hours>25){setReturnPreviewError('Enter your actual average weekly training hours (3–25).');return;}
  setReturnPreviewBusy(true);setReturnPreviewError('');setReturnPreview(null);
  try{
   const now=new Date(today+'T12:00:00');const next=new Date(now);
   next.setDate(now.getDate()+((8-now.getDay())%7||7));
   const week=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-'+String(next.getDate()).padStart(2,'0');
   const {data,error}=await supabase.rpc('preview_returning_athlete_week',{p_recent_actual_hours:hours,p_week_start:week});
   if(error)throw error;
   setReturnPreview(data);
  }catch(e:any){setReturnPreviewError(e?.message||'Unable to load training preview.');}
  finally{setReturnPreviewBusy(false);}
 };
 useEffect(()=>{let active=true;setStrategyLoading(true);supabase.auth.getUser().then(async({data,error})=>{
  if(error||!data.user){if(active){setStrategyError(true);setStrategyLoading(false);}return;}
  const result=await supabase.from('athlete_onboarding').select('weekly_hours,recent_weekly_hours,training_background,training_consistency,race_distance,race_date,swim_css_seconds_per_100m,ftp_watts,run_threshold_seconds_per_km').eq('user_id',data.user.id).maybeSingle();
  if(active){setStrategy(result.data);setStrategyError(!!result.error);setStrategyLoading(false);}
 }).catch(()=>{if(active){setStrategyError(true);setStrategyLoading(false);}});return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;(async()=>{try{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)return;
  const response=await fetch('/api/intervals/activity-preview?days=90&mode=history',{headers:{Authorization:'Bearer '+session.access_token}});
  if(!response.ok)return;
  const data=await response.json(),summary=data.historySummary;
  if(active&&summary?.readOnly===true&&Number.isFinite(summary.activityCount))setVerifiedHistory({count:summary.activityCount,recent:summary.recentFourWeekHours,previous:summary.previousFourWeekHours,swim:summary.sports?.swim?.count??0,bike:summary.sports?.bike?.count??0,run:summary.sports?.run?.count??0,excluded:summary.excludedCount??0,weeklyCount:summary.weekly?.length??0});
 }catch{/* Keep self-reported values clearly labelled when history is unavailable. */}})();return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;(async()=>{try{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data,error}=await supabase.from('athlete_history_intelligence').select('last_four_completed_week_avg_hours,prior_four_completed_week_avg_hours,evidence_status,historical_max_week_hours').eq('owner_user_id',user.id).maybeSingle();if(error||!data)return;const {data:robust}=await supabase.from('athlete_history_robust_review').select('recent_median_hours,review_reason').eq('owner_user_id',user.id).maybeSingle();if(active)setReviewEvidence({recent:Number(data.last_four_completed_week_avg_hours),previous:Number(data.prior_four_completed_week_avg_hours),status:String(data.evidence_status),max:Number(data.historical_max_week_hours),median:Number(robust?.recent_median_hours??data.last_four_completed_week_avg_hours),spikeReason:String(robust?.review_reason??'coach_review')});}catch{/* Show normal dashboard when review evidence is unavailable. */}})();return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;(async()=>{try{const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data,error}=await supabase.from('athlete_baseline_coaching_brief').select('coaching_rationale,next_review_action,approved_for_prescription').eq('owner_user_id',user.id).maybeSingle();if(!error&&data?.approved_for_prescription===false&&active)setCoachingBrief({rationale:String(data.coaching_rationale),action:String(data.next_review_action)});}catch{/* A coaching brief must never block the dashboard. */}})();return()=>{active=false;};},[]);
 const pace=(seconds:number|null|undefined)=>seconds&&seconds>0?Math.floor(seconds/60)+':'+String(Math.round(seconds%60)).padStart(2,'0'):null;
 const day=new Date(today+'T12:00:00');const monday=new Date(day);monday.setDate(day.getDate()-(day.getDay()+6)%7);
 const dateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
 const active=sessions.filter(s=>!['cancelled','missed'].includes(s.status));
 const week=active.filter(s=>s.plannedDate>=dateKey(monday)&&s.plannedDate<=dateKey(sunday));
 const todays=active.filter(s=>s.plannedDate===today);const current=todays.find(s=>s.status!=='completed')??todays[0];
 const done=week.filter(s=>s.status==='completed').length,total=week.length;
 const plannedMinutes=week.reduce((sum,s)=>sum+(Number(s.durationMin)||0),0);
 const future=active.filter(s=>s.plannedDate>today).sort((a,b)=>a.plannedDate.localeCompare(b.plannedDate)).slice(0,3);
 const weeklyProgress=(['swim','bike','run'] as const).map(sport=>{const list=week.filter(s=>s.sport===sport);return {sport,total:list.reduce((n,s)=>n+(Number(s.durationMin)||0),0),done:list.filter(s=>s.status==='completed').reduce((n,s)=>n+(Number(s.durationMin)||0),0),sessions:list.length};});
 const raceDays=race.raceDate?Math.ceil((new Date(race.raceDate+'T12:00:00').getTime()-day.getTime())/86400000):null;
 const readyLabel=!readiness?'Readiness unavailable':readiness.color==='green'?'Ready for planned training':readiness.color==='amber'?'Review your recovery':'Recovery needs attention';
 const shortRationale=current?.rationale?.trim();const insight=shortRationale?(shortRationale.length>150?shortRationale.slice(0,147)+'…':shortRationale):current?'Follow the prescribed targets. Open the session for its full structure.':'No session is scheduled today. Check your calendar for what is next.';
 return <div className="azur-white-dashboard" aria-label="Athlete dashboard">
  <header className={`awd-hero${merseyTriBeta?' awd-hero-mersey':''}`}><div className="awd-brand"><img src="/brand/azur-logo-250.png" alt="Azur Triathlon Coaching"/><button type="button" aria-label="Open athlete profile" onClick={()=>onNavigate('Profile')}>{avatar?<img src={avatar} alt=""/>:<UserRound size={21}/>}</button></div>{merseyTriBeta&&<div className="awd-mersey-partner">
   <div className="awd-mersey-artwork"><img src="/brand/mersey-tri-banner.svg" alt="Mersey Tri"/></div>
   <span className="awd-mersey-label">Mersey Tri Beta</span>
  </div>}<div className="awd-v3-race-story"><p className="awd-greeting">Welcome back, {name?.split(' ')[0]||'athlete'}</p><span className="awd-v3-phase-tag">{phase||'Your training journey'}</span><h1>{race.name||'Your next goal'}</h1><div className="awd-v3-countdown">{raceDays!==null&&raceDays>=0?<><strong>{raceDays}</strong><span>{raceDays===0?'Race day':'days to race day'}</span></>:<span>{raceDays===null?'Add your race date':'Set your next race goal'}</span>}</div><div className="awd-v3-race-progress"><span>{total} sessions planned this week</span><span>{done} recorded</span></div></div></header>
  <div className="awd-body">
   <section className="awd-card awd-session" aria-labelledby={todayHeading}><div className="awd-heading"><h2 id={todayHeading}>Today’s session{todays.length>1?'s':''}</h2><span className="awd-tag">{todays.length?`${todays.length} planned`:'Unscheduled'}</span></div>
    {todays.length?todays.map(s=>{const Icon=icons[s.sport as keyof typeof icons]??Bike;const blocks=['warmup','main_set','cooldown'].flatMap(key=>Array.isArray(s.prescription?.[key])?s.prescription[key].map((b:any)=>({...b,kind:key})):[]).filter(b=>Number(b.duration_min)>0);return <article key={s.id} className={`awd-workout ${s.sport}`}><div className="awd-workout-title"><span className="awd-sport-icon"><Icon size={22}/></span><div><h3>{s.title}</h3><p>{s.sport.toUpperCase()} · {minutes(Number(s.durationMin)||0)} · {s.status==='completed'?'Recorded complete':'Planned'}</p></div></div>{blocks.length>0&&<><div className="awd-prescription" aria-hidden="true">{blocks.map((b:any,i:number)=><span key={i} className={b.kind} style={{flex:Number(b.duration_min)}}/>)}</div><p className="awd-target">{blocks.find((b:any)=>b.kind==='main_set')?.target||'Structured session'}<span>Prescribed effort</span></p></>}<button type="button" className="awd-primary" onClick={()=>onSession(s.id)}>View session <ArrowUpRight size={17}/></button></article>}):<div className="awd-unscheduled"><h3>No workout scheduled</h3><p>Your calendar has no session for today.</p><button type="button" className="awd-primary" onClick={()=>onNavigate('Calendar')}>View calendar <ArrowUpRight size={17}/></button></div>}
   </section>
   {future.length>0&&<section className="awd-card awd-v3-next" aria-label="Upcoming training">
     <div className="awd-heading"><h2>Coming up</h2><button type="button" aria-label="View your calendar" onClick={()=>onNavigate('Calendar')}><ArrowUpRight size={18}/></button></div>
     {future.map(s=>{const Icon=icons[s.sport as keyof typeof icons]??Bike;return <button type="button" className={`awd-v3-upcoming-session ${s.sport}`} key={s.id} onClick={()=>onSession(s.id)}>
       <span className="awd-v3-upcoming-date">{new Date(s.plannedDate+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})}</span>
       <Icon size={20}/><span className="awd-v3-upcoming-name"><strong>{s.title}</strong><small>{minutes(Number(s.durationMin)||0)} · {s.status==='completed'?'Recorded':'Planned'}</small></span><ChevronRight size={17}/>
     </button>})}
   </section>}
   <button type="button" className="awd-card awd-readiness" onClick={()=>onNavigate('Recovery')}><span className={`awd-readiness-mark ${readiness?.color??'unknown'}`} aria-hidden="true">{readiness?'•':'—'}</span><span><span className="awd-eyebrow">Daily readiness</span><strong>{readyLabel}</strong><small>{readiness?'View the signals behind this guidance':'Add your recovery check-in'}</small></span><ChevronRight size={18}/></button>
   <section className="awd-card awd-week awd-v3-week"><div className="awd-heading"><h2>Your training week</h2><button type="button" aria-label="Open weekly calendar" onClick={()=>onNavigate('Calendar')}><ArrowUpRight size={18}/></button></div><p className="awd-week-total"><strong>{done}<span> / {total} sessions</span></strong><span>{minutes(plannedMinutes)} planned</span></p><div className="awd-v3-sport-rings" aria-label="Planned and recorded training minutes by sport">
    {weeklyProgress.map(({sport,total,done,sessions})=>{const Icon=icons[sport];const percent=total>0?Math.min(100,done/total*100):0;return <div key={sport} className={`awd-v3-ring-item ${sport}`}>
      <div className="awd-v3-progress-ring" role="progressbar" aria-label={`${sport} planned duration recorded`} aria-valuemin={0} aria-valuemax={total||1} aria-valuenow={done} style={{'--ring-fill':percent+'%'} as React.CSSProperties}>
        <Icon size={20}/>
      </div>
      <strong>{minutes(done)} <small>/ {minutes(total)}</small></strong>
      <span>{sport.toUpperCase()} · {sessions} {sessions===1?'session':'sessions'}</span>
    </div>})}
   </div>
   <details className="awd-v3-week-evidence"><summary>Session completion breakdown</summary><div className="awd-week-sports">{(['swim','bike','run'] as const).map(sport=>{const list=week.filter(s=>s.sport===sport),complete=list.filter(s=>s.status==='completed').length,Icon=icons[sport];return <div key={sport} className={`awd-sport-row ${sport}`}><span className="awd-sport-icon"><Icon size={17}/></span><span>{sport[0].toUpperCase()+sport.slice(1)}</span><div role="progressbar" aria-label={`${sport} recorded session completion`} aria-valuemin={0} aria-valuemax={list.length||1} aria-valuenow={complete}><i style={{width:list.length?`${complete/list.length*100}%`:'0%'}}/></div><small>{complete}/{list.length}</small></div>})}</div></details><small className="awd-note">Recorded planned duration, not verified training load or intensity</small><button type="button" className="awd-load-link" onClick={()=>onNavigate('Weekly Review')}>Weekly Review <span>{Math.round(weeklyStress||0)} stress points <ChevronRight size={14}/></span></button></section>
   <details className="awd-card awd-v3-strategy" aria-label="My training strategy"><summary><span><strong>Training strategy &amp; evidence</strong><small>Race goals, training history and coach intelligence</small></span><ChevronRight size={18}/></summary><div className="awd-v3-strategy-body">
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
     <div><small style={{color:'#73c7eb',letterSpacing:1.2,fontWeight:700}}>AZUR INTELLIGENCE</small><h2 style={{fontSize:20,margin:'5px 0'}}>Training strategy</h2><small style={{color:'#adc8d9'}}>Your race and training capacity</small></div>
    </div>
    {strategyLoading?<p>Loading your training strategy…</p>:strategyError?<p>Your strategy is temporarily unavailable.</p>:strategy?<div style={{marginTop:14}}>
     <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:9}}>
      {[
       ['Race goal',strategy.race_distance?.toUpperCase()||race.name||'Not set'],
       ['Available / week',strategy.weekly_hours!=null?strategy.weekly_hours+' hrs':'Not set'],
       ['Race date',strategy.race_date?new Date(strategy.race_date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Not set']
      ].map(([label,value])=><div key={label} style={{background:'#16394f',borderRadius:12,padding:11,minWidth:0}}><small style={{display:'block',color:'#9cbcd0'}}>{label}</small><strong style={{display:'block',marginTop:5,overflowWrap:'anywhere'}}>{value}</strong></div>)}
     </div>
     {(reviewEvidence||verifiedHistory)&&<section aria-label="AZUR training intelligence" style={{marginTop:12,padding:14,border:'1px solid #315e73',borderRadius:14,background:'#14364b'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><small style={{color:'#86d8f0',fontWeight:700,letterSpacing:'.06em'}}>TRAINING INTELLIGENCE</small><small style={{color:'#d9c38b'}}>Coach review pending</small></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12,marginTop:12}}>
       <div><strong style={{display:'block',fontSize:24}}>{reviewEvidence?reviewEvidence.median.toFixed(1):verifiedHistory?(verifiedHistory.recent/4).toFixed(1):'—'} h</strong><small style={{color:'#b5cfde'}}>Typical recent week{!reviewEvidence?' · average':''}</small></div>
       <div><strong style={{display:'block',fontSize:20}}>{reviewEvidence?reviewEvidence.recent.toFixed(1):verifiedHistory?(verifiedHistory.recent/4).toFixed(1):'—'} h</strong><small style={{color:'#b5cfde'}}>Recent weekly average</small></div>
      </div>
      {coachingBrief&&<p style={{margin:'12px 0 6px',fontSize:13,lineHeight:1.5,color:'#e4f2f8'}}>{coachingBrief.rationale}</p>}
      {!coachingBrief&&<p style={{margin:'12px 0 6px',fontSize:13,lineHeight:1.5,color:'#e4f2f8'}}>{reviewEvidence?.spikeReason==='volume_spike_review'?'Your recent average is elevated by a single unusually long training week. AZUR will prioritise consistency and recovery evidence before suggesting a starting load.':reviewEvidence?'Your recorded training supports a baseline review, but does not authorise a change to your plan.':'Connected activity history is available for review. A validated baseline has not yet been approved.'}</p>}
      <details style={{marginTop:10,borderTop:'1px solid #315a6c',paddingTop:10}}>
       <summary style={{cursor:'pointer',fontSize:13,fontWeight:700,color:'#d8ecf6'}}>View supporting training evidence</summary>
       {reviewEvidence&&<p style={{fontSize:13,color:'#bfd6e3'}}>Previous four completed weeks: {reviewEvidence.previous.toFixed(1)} h/week · Highest week: {reviewEvidence.max.toFixed(1)} h · Median: {reviewEvidence.median.toFixed(1)} h</p>}
       {verifiedHistory&&<p style={{fontSize:13,color:'#bfd6e3'}}>90-day preview: {verifiedHistory.count} activities · {verifiedHistory.swim} swims · {verifiedHistory.bike} rides · {verifiedHistory.run} runs · {verifiedHistory.excluded} excluded</p>}
       <p style={{fontSize:13,lineHeight:1.5,color:'#bfd6e3'}}>These values are descriptive evidence, not training targets. Source coverage and duplicates still require review. Coach approval is required before changing the plan.</p>
      </details>
      {strategy.training_consistency==='under4'&&strategy.recent_weekly_hours!=null&&strategy.recent_weekly_hours>=8&&<details style={{border:'1px solid #315c72',borderRadius:12,padding:12,marginTop:12,background:'#133348'}}>
      <summary style={{cursor:'pointer',fontWeight:700,color:'#e9f7ff'}}>Review onboarding estimate & preview week</summary>
      <p style={{color:'#c7deea',fontSize:13,lineHeight:1.5}}>Onboarding estimate: {strategy.recent_weekly_hours} h/week. This is self-reported, not a validated starting load. Enter the actual average from the last 2–3 weeks to preview a coach-reviewed week; nothing will be published.</p>
      <label htmlFor="return-actual-hours" style={{display:'block',color:'#c7deea',fontSize:12,marginBottom:5}}>Recent actual hours per week</label>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
       <input id="return-actual-hours" type="number" min="3" max="25" step="0.5" value={returnHours} onChange={e=>{setReturnHours(e.target.value);setReturnPreview(null);}} style={{width:85,padding:9,borderRadius:8,border:'1px solid #57869b',background:'#0b2538',color:'#fff'}}/>
       <button type="button" disabled={returnPreviewBusy} onClick={loadReturnPreview} style={{padding:'10px 13px',borderRadius:8,border:0,background:'#48bde9',color:'#082536',fontWeight:700}}>{returnPreviewBusy?'Preparing…':'Preview week'}</button>
      </div>
      {returnPreviewError&&<p role="alert" style={{color:'#ffd093'}}>{returnPreviewError}</p>}
      {returnPreview&&<div style={{marginTop:12}}>
       <strong style={{color:'#f6d278'}}>{returnPreview.status==='coach_review_required'?'Coach review required':'Review required'}</strong>
       <p style={{color:'#c7deea',fontSize:13,lineHeight:1.5}}>{returnPreview.note||returnPreview.reason} No calendar changes have been made.</p>
       {Array.isArray(returnPreview.sample_sessions)&&<div style={{display:'grid',gap:6}}>{returnPreview.sample_sessions.map((item:any,i:number)=><div key={i} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'8px 0',borderBottom:'1px solid #31566a',color:'#e6f5fc',fontSize:13}}><span>{item.date} · {item.title}</span><strong style={{whiteSpace:'nowrap'}}>{item.duration_min}m</strong></div>)}</div>}
       {returnPreview.sample_minutes!=null&&<p style={{color:'#e6f5fc'}}>Sample: {minutes(returnPreview.sample_minutes)} · target: {minutes(returnPreview.target_minutes)}</p>}
      </div>}
     </details>}
     </section>}
     <details style={{border:'1px solid #315c72',borderRadius:12,padding:12,marginTop:12,background:'#133348'}}>
      <summary style={{cursor:'pointer',fontWeight:700,color:'#e9f7ff'}}>This week's coaching signals <small style={{color:'#82cde8',fontWeight:500}}>· live calendar</small></summary>
      <div style={{display:'grid',gap:10,marginTop:12,lineHeight:1.5}}>
       <div><strong style={{color:'#8dd7f4'}}>What we've noticed</strong><p style={{margin:'4px 0',color:'#d1e3ed'}}>{total? `${done} of ${total} scheduled sessions are marked completed this week; ${minutes(plannedMinutes)} is planned.`:'There are no active sessions in this calendar week.'} {readiness? `The current readiness indicator is ${readiness.color==='green'?'green':readiness.color==='amber'?'amber':readiness.color==='red'?'red':'available'}.`:'No readiness indicator is available.'}</p></div>
       <div><strong style={{color:'#8dd7f4'}}>What it means</strong><p style={{margin:'4px 0',color:'#d1e3ed'}}>Calendar completion shows recorded status, not actual training quality or fitness gains. {readiness?.color==='amber'||readiness?.color==='red'?'Your recovery indicator warrants a closer look before making demanding training decisions.':readiness?.color==='green'?'A green indicator alone does not establish full recovery or justify extra intensity.':'Recovery cannot be assessed from these calendar entries alone.'}</p></div>
       <div><strong style={{color:'#8dd7f4'}}>What AZUR recommends</strong><p style={{margin:'4px 0',color:'#d1e3ed'}}>{readiness?.color==='amber'||readiness?.color==='red'?'Review your recovery signals and upcoming intensity with your coach before adjusting the plan.':'Review the completed sessions and how they felt before considering any progression. Keep the current prescribed plan unless a coach approves changes.'}</p></div>
       <div><strong style={{color:'#8dd7f4'}}>What happens next</strong><p style={{margin:'4px 0',color:'#d1e3ed'}}>Advisory only. No session, training zone or weekly volume has been changed automatically.</p><button type="button" onClick={()=>onNavigate('Weekly Review')} style={{background:'#1c5874',border:0,borderRadius:9,padding:'9px 12px',color:'#fff',fontWeight:700,marginTop:5}}>Open Weekly Review →</button></div>
      </div>
      <small style={{display:'block',color:'#a6c5d6',marginTop:12}}>Sources: current week's calendar session statuses, planned durations and the existing readiness indicator. Imported activity completeness and recovery signal quality have not been verified here.</small>
     </details>
     <p style={{margin:'14px 0 4px',fontWeight:700}}>Your starting point</p>
     <p style={{margin:'0 0 12px',color:'#c3d9e6',lineHeight:1.45}}>{strategy.recent_weekly_hours!=null&&strategy.weekly_hours!=null?strategy.recent_weekly_hours>strategy.weekly_hours?`You report ${strategy.recent_weekly_hours} hours of recent training and ${strategy.weekly_hours} hours available. Your available time is ${strategy.recent_weekly_hours-strategy.weekly_hours} hours lower, so consistency within your schedule matters more than matching past volume.`:strategy.recent_weekly_hours<strategy.weekly_hours?`You report ${strategy.recent_weekly_hours} hours of recent training and ${strategy.weekly_hours} hours available. The extra time is capacity, not a reason to increase training immediately.`:`You report ${strategy.recent_weekly_hours} hours of recent training, matching your ${strategy.weekly_hours}-hour availability. Actual training and recovery still determine progression.`:'Your reported training history and weekly availability will help frame a sustainable schedule once both are available.'}</p>
     <details style={{borderTop:'1px solid #31556a',padding:'12px 0'}}><summary style={{cursor:'pointer',fontWeight:700}}>Training approach</summary><p style={{color:'#c3d9e6',lineHeight:1.5}}>For your {strategy.race_distance?.toUpperCase()||'endurance'} goal, the plan should develop sustainable aerobic endurance, sport-specific fitness and race readiness through progressive blocks. Session intensity and volume need to respond to completed training, fatigue and coach review—not availability alone.</p><p style={{color:'#9cbcd0',fontSize:12}}>This is a coaching framework, not a claim that your training history has been analysed.</p></details>
     <details style={{borderTop:'1px solid #31556a',padding:'12px 0'}}><summary style={{cursor:'pointer',fontWeight:700}}>Your benchmarks</summary><div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:7,marginTop:12}}>{[['Swim CSS',pace(strategy.swim_css_seconds_per_100m)||'—','/100m'],['Bike FTP',strategy.ftp_watts?String(strategy.ftp_watts):'—','W'],['Run threshold',pace(strategy.run_threshold_seconds_per_km)||'—','/km']].map(([label,value,unit])=><div key={label} style={{background:'#16394f',borderRadius:10,padding:9,minWidth:0}}><small style={{display:'block',color:'#9cbcd0',fontSize:11}}>{label}</small><strong style={{display:'block',fontSize:17,marginTop:6}}>{value}</strong><small style={{color:'#9cbcd0'}}>{unit}</small></div>)}</div><p style={{fontSize:12,color:'#adc8d9'}}>These are athlete-reported starting values. Verify and update them through appropriate testing before relying on precise targets.</p></details>
     <details style={{borderTop:'1px solid #31556a',padding:'12px 0 0'}}><summary style={{cursor:'pointer',fontWeight:700}}>Why AZUR chose this approach</summary><p style={{color:'#c3d9e6',lineHeight:1.5}}>Your race distance, available hours and reported recent volume provide the initial context. Your benchmarks can inform session targets once validated. Future recommendations should also consider actual completed sessions, response and recovery; this briefing does not yet use those signals to make an individual recommendation.</p><p style={{fontSize:12,color:'#adc8d9'}}>Source: saved onboarding answers. No automatic analysis of completed training or recovery is implied.</p></details>
    </div>:<p>Your onboarding strategy is not yet available.</p>}
   </div></details>
   <section className="awd-card awd-insight"><span className="awd-eyebrow">Why today matters</span><p>{insight}</p>{current&&<details><summary>Read the coaching rationale</summary><p>{current.rationale||'A coaching rationale has not been saved for this session.'}</p><button type="button" onClick={()=>onSession(current.id)}>Open session targets →</button></details>}</section>
   <button type="button" className="awd-more-link" onClick={()=>onNavigate('Data Sources')}>Connections & activity imports <ChevronRight size={16}/></button>
  </div>
 </div>;
}
