import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Device = 'garmin'|'coros'|'polar'|'apple'|'other'|'none';
type Race = 'sprint'|'olympic'|'70.3'|'ironman'|'other';
const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const devices: {id:Device;label:string}[]=[
 {id:'garmin',label:'Garmin'}, {id:'coros',label:'COROS'},
 {id:'polar',label:'Polar / Wahoo'}, {id:'apple',label:'Apple Watch'},
 {id:'other',label:'Another device'}, {id:'none',label:'No training watch'},
];
/** Athlete-owned setup. Finalisation invokes the staging atomic onboarding-and-plan RPC. */
export default function AthleteOnboardingDraft(){
 const [step,setStep]=useState(0);
 const [device,setDevice]=useState<Device>('garmin');
 const [race,setRace]=useState<Race>('70.3');
 const [raceDate,setRaceDate]=useState('');
 const [hours,setHours]=useState(8);
 const [trainingDays,setTrainingDays]=useState<string[]>([]);
 const [recentHours,setRecentHours]=useState('');
 const [ftp,setFtp]=useState('');
 const [css,setCss]=useState('');
 const [runThreshold,setRunThreshold]=useState('');
 const [experience,setExperience]=useState('first');
 const [background,setBackground]=useState('regular');
 const [backgroundTouched,setBackgroundTouched]=useState(false);
 const [consistency,setConsistency]=useState('4to7');
 const [concern,setConcern]=useState('none');
 const [canSwim,setCanSwim]=useState(true);
 const [ready,setReady]=useState(false);
 const [displayName,setDisplayName]=useState('');
 const [userId,setUserId]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 const [isCoach,setIsCoach]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  async function load(){
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(cancelled)return;
   if(authError || !user){setMessage('Sign in to save your athlete setup.');setLoading(false);return;}
   if(user.app_metadata?.role==='coach'){setIsCoach(true);setLoading(false);return;}
   setUserId(user.id);
   const {data:profile}=await supabase.from('athlete_profile').select('display_name').eq('user_id',user.id).maybeSingle();
   if(!cancelled && profile?.display_name) setDisplayName(profile.display_name);
   const {data,error}=await supabase.from('athlete_onboarding').select('race_distance,race_date,experience,weekly_hours,training_days,recent_weekly_hours,ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km,training_background,training_consistency,current_training_concern,can_swim_200m,device,onboarding_step').eq('user_id',user.id).maybeSingle();
   if(cancelled)return;
   if(error)setMessage('Could not load your saved setup: '+error.message);
   else if(data){
    setRace(data.race_distance as Race);setRaceDate(data.race_date||'');
    setExperience(data.experience);setHours(Number(data.weekly_hours));
    setDevice(data.device as Device);
    setBackground(data.training_background||'regular');setBackgroundTouched(true);setConsistency(data.training_consistency||'4to7');setConcern(data.current_training_concern||'none');setCanSwim(data.can_swim_200m??true);
    setTrainingDays((data.training_days||[]).map((day:number)=>weekdays[day]).filter(Boolean));setRecentHours(data.recent_weekly_hours==null?'':String(data.recent_weekly_hours));
    setFtp(data.ftp_watts==null?'':String(data.ftp_watts));setCss(data.swim_css_seconds_per_100m==null?'':String(data.swim_css_seconds_per_100m));setRunThreshold(data.run_threshold_seconds_per_km==null?'':String(data.run_threshold_seconds_per_km));setStep(Math.min(2,Math.max(0,data.onboarding_step)));
    // Existing athlete data is always preserved; no automatic plan changes.
   }
   setLoading(false);
  }
  void load();
  return ()=>{cancelled=true};
 },[]);
 async function save(nextStep:number){
  if(!userId){setMessage('Sign in to save your setup.');return;}
  if(!Number.isFinite(hours)||hours<2||hours>25){setMessage('Weekly hours must be between 2 and 25.');return;}
  if(trainingDays.length===0 && nextStep>=2){setMessage('Choose at least one day you can train.');return;}
  if(recentHours!=='' && (!Number.isFinite(Number(recentHours))||Number(recentHours)<0||Number(recentHours)>25)){setMessage('Recent weekly training must be between 0 and 25 hours.');return;}
  for(const [label,value,min,max] of [['FTP',ftp,60,650],['Swim CSS',css,50,300],['Run threshold',runThreshold,150,900]] as const){if(value!==''&&(!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)){setMessage(`${label} is outside the expected range. Leave blank if unknown.`);return;}}
  if(nextStep===3 && !displayName.trim()){setMessage('Please enter your name before finishing setup.');return;}
  setSaving(true);setMessage('');
  if(nextStep===3){
   const {data,error}=await supabase.rpc('complete_athlete_onboarding_and_plan',{
    p_inputs:{
     display_name:displayName.trim(),race_distance:race,race_date:raceDate||null,
     experience,weekly_hours:hours,training_days:trainingDays.map(day=>weekdays.indexOf(day)),
     recent_weekly_hours:recentHours===''?null:Number(recentHours),
     training_background:background,training_consistency:consistency,
     current_training_concern:concern,can_swim_200m:canSwim,
     ftp_watts:ftp===''?null:Number(ftp),
     swim_css_seconds_per_100m:css===''?null:Number(css),
     run_threshold_seconds_per_km:runThreshold===''?null:Number(runThreshold),device
    }
   });
   setSaving(false);
   if(error){setMessage('Unable to finish setup and create your training plan: '+error.message);return;}
   if(data?.status==='review_required'){
    setMessage('Your setup is saved. Coach review is required before training can be allocated: '+(data.reason||'safety review'));
    setReady(true);return;
   }
   if(data?.status!=='ready'||!Number.isInteger(data.sessions)||data.sessions<1){
    setMessage('Training setup could not be verified. Please contact your coach.');return;
   }
   setMessage(`Your training plan is ready: ${data.sessions} sessions.`);
   setReady(true);
   if(window.location.pathname==='/onboarding')window.location.assign('/');
   return;
  }
  const {error}=await supabase.from('athlete_onboarding').upsert({
   user_id:userId,race_distance:race,race_date:raceDate||null,
   experience,weekly_hours:hours,training_days:trainingDays.map(day=>weekdays.indexOf(day)),training_background:background,training_consistency:consistency,current_training_concern:concern,can_swim_200m:canSwim,recent_weekly_hours:recentHours===''?null:Number(recentHours),
   ftp_watts:ftp===''?null:Number(ftp),swim_css_seconds_per_100m:css===''?null:Number(css),run_threshold_seconds_per_km:runThreshold===''?null:Number(runThreshold),device,onboarding_step:nextStep,
   updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  setSaving(false);
  if(error){setMessage('Unable to save setup: '+error.message);return;}
  setStep(Math.min(2,nextStep));
  setMessage('Progress saved.');
 }
 if(loading)return <section className="azur-onboarding-draft"><p>Loading your setup…</p></section>;
 if(isCoach)return <section className="azur-onboarding-draft"><h3>Athlete onboarding</h3><p>This setup is for athlete accounts. Coach access and assignments are managed separately.</p></section>;
 return <section className="azur-onboarding-draft" aria-label="AZUR beta onboarding preview">
  <div className="azur-onboarding-progress"><strong>Getting started</strong><span>Step {step+1} of 3</span></div>
  <div className="azur-onboarding-track"><span style={{width:`${(step+1)/3*100}%`}}/></div>
  {step===0&&<div>
   <h3>Your training goal</h3>
   <label>Your name<input type="text" maxLength={90} required value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label>
   <label>Race distance<select value={race} onChange={e=>setRace(e.target.value as Race)}>
    <option value="sprint">Sprint</option><option value="olympic">Olympic</option>
    <option value="70.3">IRONMAN 70.3</option><option value="ironman">IRONMAN</option>
    <option value="other">Other / general fitness</option>
   </select></label>
   <label>Goal race date (optional)<input type="date" value={raceDate} onChange={e=>setRaceDate(e.target.value)}/></label>
   <label>Experience at your goal race distance<select value={experience} onChange={e=>{const next=e.target.value;setExperience(next);if(!backgroundTouched)setBackground(next==='experienced'?'established':next==='returning'?'regular':'novice');}}>
    <option value="first">First event at this distance</option><option value="returning">Returning athlete</option><option value="experienced">Experienced competitor</option>
   </select></label>
  </div>}
  {step===1&&<div>
   <h3>Your training availability</h3>
   <label>Typical hours available per week<input type="number" min={2} max={25} value={hours} onChange={e=>setHours(Number(e.target.value))}/></label>
   <p>Choose the days you can realistically train.</p>
   <div className="azur-onboarding-options">{weekdays.map(day=><label key={day} className={trainingDays.includes(day)?'selected':''}><input type="checkbox" checked={trainingDays.includes(day)} onChange={e=>setTrainingDays(previous=>e.target.checked?[...previous,day]:previous.filter(d=>d!==day))}/>{day}</label>)}</div>
   <label>Hours actually trained per week recently (optional)<input type="number" min={0} max={25} step="0.5" value={recentHours} onChange={e=>setRecentHours(e.target.value)} placeholder="Unknown"/></label>
   {recentHours!==''&&Number(recentHours)<hours&&<p role="note">You currently train {recentHours} hours per week and have {hours} hours available. AZUR will build gradually rather than immediately filling your available time.</p>}
   <p>Your event experience and recent training history are separate. An experienced racer returning after a break may still need a conservative first two weeks.</p>
   <label>Current training background<select value={background} onChange={e=>{setBackground(e.target.value);setBackgroundTouched(true)}}><option value="novice">New to structured training</option><option value="regular">Training regularly</option><option value="established">Established endurance athlete</option></select></label>
   {experience==='experienced'&&background==='novice'&&<p role="note">You selected experienced competitor and new to structured training. That's fine if you have race experience but are restarting structured training.</p>}
   <label>Recent training consistency<select value={consistency} onChange={e=>setConsistency(e.target.value)}><option value="under4">Under 4 weeks consistent</option><option value="4to7">4–7 weeks consistent</option><option value="8plus">8+ weeks consistent</option></select></label>
   <label>Any current injury or training concern?<select value={concern} onChange={e=>setConcern(e.target.value)}><option value="none">No</option><option value="yes">Yes — coach review needed</option><option value="unsure">Unsure — coach review needed</option></select></label>
   <label>Can you comfortably swim 200m continuously?<select value={canSwim?'yes':'no'} onChange={e=>setCanSwim(e.target.value==='yes')}><option value="yes">Yes</option><option value="no">Not yet</option></select></label>
   <h3>Known training thresholds (optional)</h3>
   <p>Use your most recent reliable test results. These values help personalise training intensity.</p>
   <label>Bike FTP (watts)<input type="number" min={60} max={650} value={ftp} onChange={e=>setFtp(e.target.value)} placeholder="Unknown"/></label>
   <label>Swim CSS (seconds per 100m) <small>For example, 105 = 1:45/100m.</small><input type="number" min={50} max={300} value={css} onChange={e=>setCss(e.target.value)} placeholder="Unknown"/></label>
   <label>Run threshold (seconds per km) <small>For example, 260 = 4:20/km.</small><input type="number" min={150} max={900} value={runThreshold} onChange={e=>setRunThreshold(e.target.value)} placeholder="Unknown"/></label>
   <small>Leave unknown values blank — don't guess. AZUR will begin with appropriate endurance sessions and schedule benchmarks when you are ready.</small>
  </div>}
  {step===2&&<div>
   <h3>How do you track training?</h3>
   <p>Choose your main training device. You can connect supported services after setup.</p>
   <div className="azur-onboarding-options">{devices.map(d=><label key={d.id} className={device===d.id?'selected':''}>
    <input type="radio" name="azur-device" checked={device===d.id} onChange={()=>setDevice(d.id)}/>{d.label}
   </label>)}</div>
   <p>{device==='garmin'?'Garmin connection will be offered after setup where available.':device==='none'?'You can record workouts, RPE and benchmarks manually.':'You can start with manual workout logging. Direct syncing for this device is not yet available.'}</p>
  </div>}
  <div className="azur-onboarding-actions">
   {step>0&&<button type="button" onClick={()=>{setStep(s=>s-1);setReady(false)}}>Back</button>}
   {step<2?<button type="button" disabled={saving} onClick={()=>{if(step===0 && !displayName.trim()){setMessage('Enter your name to continue.');return;}void save(step+1)}}>Continue</button>
   :<button type="button" disabled={saving} onClick={()=>void save(3)}>{saving?'Creating plan…':'Finish setup & create plan'}</button>}
  </div>
  {message && <p role="status" className="azur-onboarding-message">{message}</p>}
  {ready&&<div role="status" className="azur-onboarding-recap"><strong>Draft setup</strong>
   <p>{race.toUpperCase()} {raceDate?'· '+raceDate:''} · {hours} h/week · {device==='none'?'Manual logging':device.toUpperCase()}</p>
   <small>{message.startsWith('Your training plan is ready')?'Your plan has been created and verified.':'Your setup has been saved; your coach will review it before training is allocated.'}</small>
  </div>}
 </section>;
}
