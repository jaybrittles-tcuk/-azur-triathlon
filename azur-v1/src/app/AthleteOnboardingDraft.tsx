import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Device = 'garmin'|'coros'|'polar'|'apple'|'other'|'none';
type Race = 'sprint'|'olympic'|'70.3'|'ironman'|'other';
const trainingDayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const devices: {id:Device;label:string}[]=[
 {id:'garmin',label:'Garmin'}, {id:'coros',label:'COROS'},
 {id:'polar',label:'Polar / Wahoo'}, {id:'apple',label:'Apple Watch'},
 {id:'other',label:'Another device'}, {id:'none',label:'No training watch'},
];
/** Athlete-owned setup; does not create a coach assignment or activate training. */
export default function AthleteOnboardingDraft(){
 const [step,setStep]=useState(0);
 const [device,setDevice]=useState<Device>('garmin');
 const [race,setRace]=useState<Race>('70.3');
 const [raceDate,setRaceDate]=useState('');
 const [hours,setHours]=useState(8);
 const [days,setDays]=useState<number[]>([1,2,3,5,6]);
 const [recentHours,setRecentHours]=useState('');
 const [ftp,setFtp]=useState('');
 const [css,setCss]=useState('');
 const [runThreshold,setRunThreshold]=useState('');
 const [canSwim,setCanSwim]=useState(false);
 const [concern,setConcern]=useState('none');
 const [experience,setExperience]=useState('first');
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
   const {data,error}=await supabase.from('athlete_onboarding').select('race_distance,race_date,experience,weekly_hours,device,onboarding_step,training_days,recent_weekly_hours,ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km,can_swim_200m,current_training_concern').eq('user_id',user.id).maybeSingle();
   if(cancelled)return;
   if(error)setMessage('Could not load your saved setup: '+error.message);
   else if(data){
    setRace(data.race_distance as Race);setRaceDate(data.race_date||'');
    setExperience(data.experience);setHours(Number(data.weekly_hours));
    setDevice(data.device as Device);setStep(Math.min(2,Math.max(0,data.onboarding_step)));
    if(Array.isArray(data.training_days)&&data.training_days.length)setDays(data.training_days);
    setRecentHours(data.recent_weekly_hours==null?'':String(data.recent_weekly_hours));
    setFtp(data.ftp_watts==null?'':String(data.ftp_watts));
    setCss(data.swim_css_seconds_per_100m==null?'':String(data.swim_css_seconds_per_100m));
    setRunThreshold(data.run_threshold_seconds_per_km==null?'':String(data.run_threshold_seconds_per_km));
    setCanSwim(data.can_swim_200m===true);
    setConcern(data.current_training_concern||'none');
   }
   setLoading(false);
  }
  void load();
  return ()=>{cancelled=true};
 },[]);
 async function save(nextStep:number){
  if(!userId){setMessage('Sign in to save your setup.');return;}
  if(!Number.isFinite(hours)||hours<2||hours>25){setMessage('Weekly hours must be between 2 and 25.');return;}
  if(!days.length){setMessage('Choose at least one day when you can train.');return;}
  const validOptional=(value:string,minimum:number,maximum:number)=>value===''||(Number.isInteger(Number(value))&&Number(value)>=minimum&&Number(value)<=maximum);
  if(recentHours!==''&&(!Number.isFinite(Number(recentHours))||Number(recentHours)<0||Number(recentHours)>25)){setMessage('Recent weekly hours must be between 0 and 25.');return;}
  if(!validOptional(ftp,70,600)||!validOptional(css,50,300)||!validOptional(runThreshold,150,900)){
    setMessage('Check your threshold values or leave unknown values blank.');return;
  }
  if(nextStep===3 && !displayName.trim()){setMessage('Please enter your name before finishing setup.');return;}
  setSaving(true);setMessage('');
  if(nextStep===3){
   const {data:existing,error:lookupError}=await supabase.from('athlete_profile').select('id').eq('user_id',userId).maybeSingle();
   if(lookupError){setSaving(false);setMessage('Unable to check athlete profile: '+lookupError.message);return;}
   if(!existing){
    const {error:profileError}=await supabase.from('athlete_profile').insert({user_id:userId,display_name:displayName.trim()});
    if(profileError){setSaving(false);setMessage('Unable to create athlete profile: '+profileError.message);return;}
   }
  }
  const {error}=await supabase.from('athlete_onboarding').upsert({
   user_id:userId,race_distance:race,race_date:raceDate||null,
   experience,weekly_hours:hours,device,onboarding_step:nextStep,
   training_days:days, recent_weekly_hours:recentHours===''?null:Number(recentHours),
   ftp_watts:ftp===''?null:Number(ftp),
   swim_css_seconds_per_100m:css===''?null:Number(css),
   run_threshold_seconds_per_km:runThreshold===''?null:Number(runThreshold),
   can_swim_200m:canSwim,
   current_training_concern:concern,
   updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  if(error){setSaving(false);setMessage('Unable to save setup: '+error.message);return;}
  setStep(Math.min(2,nextStep));
  if(nextStep===3){
    setMessage('Building your first training programme…');
    const {data:generated,error:generationError}=await supabase.rpc('generate_onboarding_foundation');
    if(generationError){setSaving(false);setMessage('Setup saved, but your programme could not be generated: '+generationError.message);return;}
    if(generated?.status==='review_required'){
      setSaving(false);setReady(true);
      setMessage(generated.reason||'Your setup needs review before a training programme can be activated.');
      return;
    }
    if(generated?.status!=='created' && generated?.status!=='already_planned'){
      setSaving(false);setMessage('Setup saved, but programme generation is not confirmed.');return;
    }
    const {data:profile}=await supabase.from('athlete_profile').select('id').eq('user_id',userId).single();
    if(!profile){setSaving(false);setMessage('Programme saved but athlete profile could not be verified.');return;}
    const {data:sessions,error:readbackError}=await supabase.from('planned_session')
      .select('id').eq('athlete_id',profile.id).eq('is_active_version',true)
      .gte('planned_date',new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'})).limit(1);
    setSaving(false);
    if(readbackError||!sessions?.length){setMessage('Programme generation completed, but calendar verification failed. Please reopen the calendar.');return;}
    window.location.assign('/?start=calendar');
    return;
  }
  setSaving(false);
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
   <label>Experience<select value={experience} onChange={e=>setExperience(e.target.value)}>
    <option value="first">First event at this distance</option><option value="returning">Returning athlete</option><option value="experienced">Experienced competitor</option>
   </select></label>
  </div>}
  {step===1&&<div>
   <h3>Your training availability</h3>
   <label>Typical hours available per week<input type="number" min={2} max={25} value={hours} onChange={e=>setHours(Number(e.target.value))}/></label>
   <fieldset><legend>Which days can you train?</legend><div className="azur-onboarding-options">
    {trainingDayNames.map((name,index)=><label key={name} className={days.includes(index)?'selected':''}>
      <input type="checkbox" checked={days.includes(index)} onChange={e=>setDays(current=>e.target.checked?[...current,index].sort():current.filter(day=>day!==index))}/>{name}
    </label>)}</div></fieldset>
   <label>Recent actual weekly training hours (leave blank if unknown)<input type="number" min="0" max="25" step="0.5" value={recentHours} onChange={e=>setRecentHours(e.target.value)} /></label>
   <p>Availability is a maximum, not your current capacity. Your starter plan will use conservative training load until AZUR has verified history.</p>
  </div>}
  {step===2&&<div>
   <h3>How do you track training?</h3>
   <div className="azur-onboarding-options">{devices.map(d=><label key={d.id} className={device===d.id?'selected':''}>
    <input type="radio" name="azur-device" checked={device===d.id} onChange={()=>setDevice(d.id)}/>{d.label}
   </label>)}</div>
   <fieldset><legend>Training readiness</legend>
    <label><input type="checkbox" checked={canSwim} onChange={e=>setCanSwim(e.target.checked)}/> I can swim 200 metres comfortably and safely</label>
    <label>Any injury, illness or health concern affecting training?
      <select value={concern} onChange={e=>setConcern(e.target.value)}>
        <option value="none">No current concerns</option>
        <option value="injury">Current injury or pain</option>
        <option value="illness">Currently unwell / recovering</option>
        <option value="health">Other health or training concern</option>
      </select>
    </label></fieldset>
   <h4>Known training thresholds (optional)</h4>
   <label>Bike FTP (watts)<input type="number" min="70" max="600" value={ftp} onChange={e=>setFtp(e.target.value)}/></label>
   <label>Swim CSS (seconds per 100m)<input type="number" min="50" max="300" value={css} onChange={e=>setCss(e.target.value)}/></label>
   <label>Run threshold pace (seconds per km)<input type="number" min="150" max="900" value={runThreshold} onChange={e=>setRunThreshold(e.target.value)}/></label>
   <p>Don't know your zones? Leave them blank. Your initial two weeks will use easy perceived effort rather than assumed thresholds.</p>
   <p>{device==='garmin'?'Garmin connection will be offered after setup where available.':device==='none'?'You can record workouts, RPE and benchmarks manually.':'You can start with manual workout logging. Direct syncing for this device is not yet available.'}</p>
  </div>}
  <div className="azur-onboarding-actions">
   {step>0&&<button type="button" onClick={()=>{setStep(s=>s-1);setReady(false)}}>Back</button>}
   {step<2?<button type="button" disabled={saving} onClick={()=>{if(step===0 && !displayName.trim()){setMessage('Enter your name to continue.');return;}void save(step+1)}}>Continue</button>
   :<button type="button" disabled={saving} onClick={()=>void save(3)}>{saving?'Creating programme…':'Finish & build my programme'}</button>}
  </div>
  {message && <p role="status" className="azur-onboarding-message">{message}</p>}
  {ready&&<div role="status" className="azur-onboarding-recap"><strong>Draft setup</strong>
   <p>{race.toUpperCase()} {raceDate?'· '+raceDate:''} · {hours} h/week · {device==='none'?'Manual logging':device.toUpperCase()}</p>
   <small>Your details are saved. If you reported a training concern, sessions will not be activated until reviewed.</small>
  </div>}
 </section>;
}
