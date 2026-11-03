import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {starterWeekPreview} from '../lib/starterWeekPreview.mjs';
import {twoWeekFoundationPreview} from '../lib/twoWeekFoundation.mjs';

type Athlete={id:string;display_name:string;user_id:string|null};
type Workout={workout_key:string;title:string;sport:string;family:string;duration_min:number;level:number;phases:string[];prescription:unknown;approved:boolean};
const monday=()=>{const date=new Date();date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10)};
/** Read-only starter-week discovery for assigned athletes. Never writes a calendar. */
export default function CoachStarterWeekPreview(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [selected,setSelected]=useState('');
 const [week,setWeek]=useState(monday);
 const [loading,setLoading]=useState(true);
 const [result,setResult]=useState<ReturnType<typeof starterWeekPreview>|null>(null);
 const [foundation,setFoundation]=useState<ReturnType<typeof twoWeekFoundationPreview>|null>(null);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;(async()=>{
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(user?.app_metadata?.role!=='coach')throw new Error('Coach access required');
   const {data:assign,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
   if(ae)throw ae;
   const ids=(assign||[]).map(x=>x.athlete_id);
   if(!ids.length){if(active)setMessage('No assigned athletes yet');return}
   const {data,error}=await supabase.from('athlete_profile').select('id,display_name,user_id').in('id',ids);
   if(error)throw error;
   if(active){setAthletes(data||[]);setSelected((data||[])[0]?.id||'')}
  }catch(e){if(active)setMessage(e instanceof Error?e.message:'Unable to load assigned athletes')}
  finally{if(active)setLoading(false)}
 })();return()=>{active=false}},[]);
 useEffect(()=>{setResult(null);setFoundation(null)},[selected,week]);
 async function preview(){
  setBusy(true);setMessage('');setResult(null);setFoundation(null);
  try{
   const athlete=athletes.find(a=>a.id===selected);
   if(!athlete?.user_id)throw new Error('Select an athlete with a verified account');
   const end=new Date(week+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+14);
   const [setup,workouts,existing]=await Promise.all([
    supabase.from('athlete_onboarding').select('weekly_hours,onboarding_step,training_days,recent_weekly_hours,current_training_concern,ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km').eq('user_id',athlete.user_id).maybeSingle(),
    supabase.from('coach_workout_library').select('workout_key,title,sport,family,duration_min,level,phases,prescription,approved').eq('approved',true),
    supabase.from('planned_session').select('id').eq('athlete_id',athlete.id).gte('planned_date',week).lt('planned_date',end.toISOString().slice(0,10)).eq('is_active_version',true).neq('status','cancelled')
   ]);
   if(setup.error||workouts.error||existing.error)throw new Error(setup.error?.message||workouts.error?.message||existing.error?.message||'Data validation failed');
   if(!setup.data)throw new Error('No onboarding preferences available for this athlete. Ask them to finish setup.');
   const info=setup.data;
   setResult(starterWeekPreview({weekStart:week,availabilityHours:Number(info.weekly_hours),onboardingCompleted:info.onboarding_step===3,existingSessions:existing.data?.length??0,library:(workouts.data??[]) as Workout[]}));
   setFoundation(twoWeekFoundationPreview({
     weekStart:week,onboardingCompleted:info.onboarding_step===3,
     trainingDays:info.training_days||[],availableHours:Number(info.weekly_hours),
     recentHours:info.recent_weekly_hours===null?null:Number(info.recent_weekly_hours),
     currentTrainingConcern:info.current_training_concern||'unsure',
     ftpWatts:info.ftp_watts===null?null:Number(info.ftp_watts),
     swimCssSeconds:info.swim_css_seconds_per_100m===null?null:Number(info.swim_css_seconds_per_100m),
     runThresholdSeconds:info.run_threshold_seconds_per_km===null?null:Number(info.run_threshold_seconds_per_km),
     existingSessions:existing.data?.length??0
   }));
  }catch(e){setMessage(e instanceof Error?e.message:'Preview unavailable')}
  finally{setBusy(false)}
 }
 return <section aria-label="Automatic starter-week preview" style={{padding:16,background:'#102c44',border:'1px solid #335c77',borderRadius:15,color:'#edf8ff',minWidth:0}}>
  <h3 style={{fontSize:20,margin:'0 0 8px'}}>Automatic starter-week preview</h3>
  <p style={{fontSize:13,color:'#aec8d9',lineHeight:1.5}}>AZUR uses the athlete's available training days and reported thresholds to propose a two-week easy foundation before testing. This never publishes to their calendar.</p>
  <div style={{display:'grid',gap:12,margin:'14px 0'}}>
   <label style={{fontSize:13}}>Athlete<select style={{width:'100%',minHeight:44,marginTop:5}} value={selected} onChange={e=>setSelected(e.target.value)}>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}</select></label>
   <label style={{fontSize:13}}>Week starting Monday<input style={{display:'block',width:'100%',minHeight:44,marginTop:5}} type="date" value={week} onChange={e=>setWeek(e.target.value)}/></label>
  </div>
  <button type="button" disabled={loading||busy||!selected} onClick={()=>void preview()} style={{minHeight:46,padding:'10px 17px',borderRadius:12,border:'1px solid #53bce9',background:'#1576ab',fontWeight:700,color:'#fff'}}>{busy?'Checking…':'Preview two-week foundation'}</button>
  {message&&<p role="alert">{message}</p>}
  {foundation&&<div style={{marginTop:16}}>
   <h4 style={{fontSize:17,margin:'0 0 6px',color:'#f8fbff'}}>{foundation.path==='two_week_endurance_foundation'?'Two-week endurance foundation':'Coach threshold verification'}</h4>
   <p style={{fontSize:13,color:'#b2cedf'}}>Missing thresholds: {foundation.unknownSports.length?foundation.unknownSports.join(', '):'None reported missing'} · Athlete-reported values require coach verification.</p>
   {foundation.blockers.map(block=><p key={block} role="alert" style={{padding:'8px 10px',background:'#4a312a',borderRadius:10,fontSize:13}}>Before planning: {block}</p>)}
   {foundation.weeks.map((w,i)=><section key={w.weekStart} aria-label={`Foundation week ${i+1}`} style={{border:'1px solid #3b6d88',borderRadius:12,padding:12,margin:'12px 0'}}>
    <strong>Week {i+1} · {w.weekStart} · {w.totalMinutes} proposed minutes</strong>
    {w.sessions.length===0?<p>No sessions can be proposed until readiness is confirmed.</p>:w.sessions.map(session=><div key={session.date} style={{padding:'9px 0',borderBottom:'1px solid #31556c'}}>
     <strong style={{fontSize:13}}>{session.day} — {session.title} ({session.minutes} min)</strong>
     <p style={{fontSize:12,color:'#bed1e1',margin:'4px 0'}}>{session.intensity}</p>
    </div>)}
    <p style={{fontSize:12,color:'#a6c3d4',margin:'10px 0 0'}}>{w.restDays} days without sessions · Unapproved planning suggestions</p>
   </section>)}
   {foundation.proposedAssessments.length>0&&<section style={{margin:'14px 0',padding:12,border:'1px solid #356d87',borderRadius:12}}>
    <strong style={{fontSize:14}}>After two weeks: review benchmark readiness</strong>
    <p style={{fontSize:12,color:'#b6cfe0'}}>Earliest review: {foundation.testWindowStart??'Date pending'}. Tests are not automatically scheduled.</p>
    {foundation.proposedAssessments.map(a=><p key={a.sport} style={{fontSize:13,margin:'8px 0'}}><strong>{a.sport.toUpperCase()}:</strong> {a.purpose}</p>)}
   </section>}
   <details style={{padding:'10px 0'}}><summary style={{fontSize:13,cursor:'pointer',color:'#8ad0fa'}}>Safety checks and next steps</summary>
    <ul style={{fontSize:13,lineHeight:1.6,paddingLeft:20}}>{foundation.warnings.map(w=><li key={w}>{w}</li>)}</ul>
   </details>
   <p style={{fontSize:13,fontWeight:700,color:'#ffdb8a'}}>Coach review required · Publication is disabled.</p>
  </div>}
  {result&&<details style={{marginTop:14}}><summary style={{cursor:'pointer',fontSize:13,color:'#9accf4'}}>Existing approved-workout coverage</summary><div style={{marginTop:10}}> 
   <strong style={{color:'#ffdb8a'}}>Coach review required · not publishable</strong>
   <p style={{fontSize:13,color:'#a9c7d7'}}>{result.minutes} candidate minutes · availability ceiling {result.availabilityCeilingMinutes??'unknown'} minutes (not a training target)</p>
   {result.sessions.map(s=><article key={s.workout_key} style={{padding:12,marginBottom:10,borderRadius:11,border:'1px solid #315c78',background:'#173d58'}}>
     <strong>{s.title}</strong><p style={{fontSize:12,margin:'6px 0 0',color:'#bbd7e9'}}>{s.date} · {s.sport} · {s.duration_min} min · approved RPE-compatible candidate</p>
    </article>)}
   <div style={{padding:12,borderRadius:11,background:'#26392e',border:'1px solid #626a42'}}>
    <strong>Before the first week can be released</strong>
    <ul style={{fontSize:13,lineHeight:1.6,paddingLeft:20}}>{result.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
   </div>
  </div></details>}
 </section>;
}
