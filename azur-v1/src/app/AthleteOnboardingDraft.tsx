import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Device = 'garmin'|'coros'|'polar'|'apple'|'other'|'none';
type Race = 'sprint'|'olympic'|'70.3'|'ironman'|'other';
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const secondsToPace=(s:number|null):string=>s&&Number.isFinite(s)?`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`:'';
const paceToSeconds=(s:string):number|null=>{
 if(!s.trim())return null;
 const match=s.trim().match(/^(\d{1,2}):([0-5]\d)$/);
 return match?Number(match[1])*60+Number(match[2]):NaN;
};
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
 const [trainingDays,setTrainingDays]=useState<number[]>([]);
 const [recentHours,setRecentHours]=useState('');
 const [trainingConcern,setTrainingConcern]=useState<'none'|'yes'|'unsure'>('unsure');
 const [knownTests,setKnownTests]=useState(false);
 const [ftpWatts,setFtpWatts]=useState('');
 const [swimCss,setSwimCss]=useState('');
 const [runPace,setRunPace]=useState('');
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
   const {data,error}=await supabase.from('athlete_onboarding').select('race_distance,race_date,experience,weekly_hours,device,onboarding_step,training_days,recent_weekly_hours,current_training_concern,ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km').eq('user_id',user.id).maybeSingle();
   if(cancelled)return;
   if(error)setMessage('Could not load your saved setup: '+error.message);
   else if(data){
    setRace(data.race_distance as Race);setRaceDate(data.race_date||'');
    setExperience(data.experience);setHours(Number(data.weekly_hours));
    setDevice(data.device as Device);
    setTrainingDays(Array.isArray(data.training_days)?data.training_days:[]);
    setRecentHours(data.recent_weekly_hours===null?'':String(data.recent_weekly_hours));
    setTrainingConcern(data.current_training_concern==='none'||data.current_training_concern==='yes'?data.current_training_concern:'unsure');
    setFtpWatts(data.ftp_watts===null?'':String(data.ftp_watts));
    setSwimCss(secondsToPace(data.swim_css_seconds_per_100m));
    setRunPace(secondsToPace(data.run_threshold_seconds_per_km));
    setKnownTests(data.ftp_watts!==null||data.swim_css_seconds_per_100m!==null||data.run_threshold_seconds_per_km!==null);
    setStep(data.onboarding_step===3?1:Math.min(2,Math.max(0,data.onboarding_step)));
   }
   setLoading(false);
  }
  void load();
  return ()=>{cancelled=true};
 },[]);
 async function save(nextStep:number){
  if(!userId){setMessage('Sign in to save your setup.');return;}
  if(!Number.isFinite(hours)||hours<2||hours>25){setMessage('Weekly hours must be between 2 and 25.');return;}
  if(nextStep>=2 && trainingDays.length===0){setMessage('Please choose at least one day you can normally train.');return;}
  const recent=recentHours.trim()===''?null:Number(recentHours);
  if(recent!==null&&(!Number.isFinite(recent)||recent<0||recent>25)){setMessage('Recent weekly training hours must be between 0 and 25.');return;}
  const ftp=knownTests&&ftpWatts.trim()!==''?Number(ftpWatts):null;
  const css=knownTests?paceToSeconds(swimCss):null;
  const run=knownTests?paceToSeconds(runPace):null;
  if(ftp!==null&&(!Number.isInteger(ftp)||ftp<60||ftp>650)){setMessage('Bike FTP should be between 60 and 650 W, or left blank.');return;}
  if(css!==null&&(!Number.isInteger(css)||css<50||css>300)){setMessage('Swim CSS should be in mm:ss per 100m, between 0:50 and 5:00.');return;}
  if(run!==null&&(!Number.isInteger(run)||run<150||run>900)){setMessage('Run threshold should be in mm:ss per km, between 2:30 and 15:00.');return;}
  if(nextStep===3 && !displayName.trim()){setMessage('Please enter your name before finishing setup.');return;}
  setSaving(true);setMessage('');
  const {error}=await supabase.from('athlete_onboarding').upsert({
   user_id:userId,race_distance:race,race_date:raceDate||null,
   experience,weekly_hours:hours,device,onboarding_step:nextStep,
   training_days:[...trainingDays].sort((a,b)=>a-b),
   recent_weekly_hours:recent,current_training_concern:trainingConcern,
   ftp_watts:ftp,swim_css_seconds_per_100m:css,run_threshold_seconds_per_km:run,
   updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  if(error){setSaving(false);setMessage('Unable to save setup: '+error.message);return;}
  if(nextStep===3){
   const {data:existing,error:lookupError}=await supabase.from('athlete_profile')
     .select('id').eq('user_id',userId).maybeSingle();
   if(lookupError){setSaving(false);setMessage('Unable to verify athlete profile: '+lookupError.message);return;}
   if(!existing){
    const {error:profileError}=await supabase.from('athlete_profile')
      .insert({user_id:userId,display_name:displayName.trim()});
    if(profileError){setSaving(false);setMessage('Setup preferences saved, but your athlete profile could not be created. Please try Finish setup again: '+profileError.message);return;}
   }
  }
  setSaving(false);
  setStep(Math.min(2,nextStep));
  if(nextStep===3){if(window.location.pathname==='/onboarding'){window.location.assign('/');return;}setReady(true);setMessage('Your athlete setup is complete. Your coach will arrange your training plan.');}
  else setMessage('Progress saved.');
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
   <p>Available hours are a maximum, not an automatic training target. We also consider your recent training before increasing volume.</p>
   <fieldset style={{border:'0',padding:0,margin:'16px 0 8px'}}>
    <legend style={{fontWeight:700,marginBottom:9}}>Which days can you normally train?</legend>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>
     {days.map((day,i)=><label key={day} style={{display:'flex',justifyContent:'center',alignItems:'center',gap:6,border:'1px solid #3c718b',borderRadius:12,minHeight:48,padding:'8px 3px',fontSize:13,background:trainingDays.includes(i)?'#17658b':'#12364e'}}>
       <input type="checkbox" aria-label={day} checked={trainingDays.includes(i)} onChange={e=>setTrainingDays(old=>e.target.checked?[...old,i]:old.filter(x=>x!==i))}/>{day}
      </label>)}
    </div>
    <p style={{fontSize:12,margin:'8px 0'}}>Choose every day you could realistically train. Rest days are still built into the plan.</p>
   </fieldset>
   <label>Average training actually completed in recent weeks (hours, if known)
    <input type="number" min={0} max={25} step={0.5} placeholder="Optional" value={recentHours} onChange={e=>setRecentHours(e.target.value)}/>
   </label>
   <label>Any injury or health concern affecting your ability to train?
    <select value={trainingConcern} onChange={e=>setTrainingConcern(e.target.value as 'none'|'yes'|'unsure')}>
     <option value="unsure">Prefer to discuss with my coach</option>
     <option value="none">No</option>
     <option value="yes">Yes — my coach should review before planning</option>
    </select>
   </label>
  </div>}
  {step===2&&<div>
   <h3>How do you track training?</h3>
   <div className="azur-onboarding-options">{devices.map(d=><label key={d.id} className={device===d.id?'selected':''}>
    <input type="radio" name="azur-device" checked={device===d.id} onChange={()=>setDevice(d.id)}/>{d.label}
   </label>)}</div>
   <p>{device==='garmin'?'Garmin connection will be offered after setup where available.':device==='none'?'You can record workouts, RPE and benchmarks manually.':'You can start with manual workout logging. Direct syncing for this device is not yet available.'}</p>
   <fieldset style={{border:'1px solid #305f7b',borderRadius:14,padding:13,marginTop:18}}>
    <legend style={{fontWeight:700}}>Do you already know your training thresholds?</legend>
    <p style={{fontSize:13,lineHeight:1.5}}>If you don't know them, that's fine. AZUR starts with a conservative two-week endurance foundation, then schedules suitable benchmark tests for coach review.</p>
    <label style={{display:'flex',gap:10,alignItems:'center',fontSize:14}}>
     <input type="checkbox" checked={knownTests} onChange={e=>setKnownTests(e.target.checked)}/> I have recent test values to enter
    </label>
    {knownTests&&<div style={{display:'grid',gap:12,marginTop:13}}>
      <label>Bike FTP (watts, if known)
       <input type="number" min={60} max={650} inputMode="numeric" placeholder="e.g. 250" value={ftpWatts} onChange={e=>setFtpWatts(e.target.value)}/>
      </label>
      <label>Swim CSS (min:sec per 100m, if known)
       <input type="text" inputMode="decimal" placeholder="e.g. 1:45" value={swimCss} onChange={e=>setSwimCss(e.target.value)} />
      </label>
      <label>Run threshold pace (min:sec per km, if known)
       <input type="text" inputMode="decimal" placeholder="e.g. 4:15" value={runPace} onChange={e=>setRunPace(e.target.value)} />
      </label>
      <p style={{fontSize:12,margin:0}}>Values you supply are athlete-reported until your coach verifies them. Leave any unknown field blank.</p>
     </div>}
   </fieldset>
  </div>}
  <div className="azur-onboarding-actions">
   {step>0&&<button type="button" onClick={()=>{setStep(s=>s-1);setReady(false)}}>Back</button>}
   {step<2?<button type="button" disabled={saving} onClick={()=>{if(step===0 && !displayName.trim()){setMessage('Enter your name to continue.');return;}void save(step+1)}}>Continue</button>
   :<button type="button" disabled={saving} onClick={()=>void save(3)}>Finish setup</button>}
  </div>
  {message && <p role="status" className="azur-onboarding-message">{message}</p>}
  {ready&&<div role="status" className="azur-onboarding-recap"><strong>Draft setup</strong>
   <p>{race.toUpperCase()} {raceDate?'· '+raceDate:''} · {hours} h/week · {device==='none'?'Manual logging':device.toUpperCase()}</p>
   <small>These onboarding preferences are saved to your account. No performance profile, coach assignment, Garmin connection or training plan has been created or activated.</small>
  </div>}
 </section>;
}
