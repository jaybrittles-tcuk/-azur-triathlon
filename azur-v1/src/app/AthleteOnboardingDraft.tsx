import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {parseAthletePace,formatAthletePace} from '../lib/athletePaceInput.mjs';

type Device = 'garmin'|'coros'|'polar'|'apple'|'other'|'none';
type Race = 'sprint'|'olympic'|'70.3'|'ironman'|'other';
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
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
 const [trainingBackground,setTrainingBackground]=useState('unknown');
 const [trainingConsistency,setTrainingConsistency]=useState('unknown');
 const [trainingConcern,setTrainingConcern]=useState<'none'|'yes'|'unsure'>('unsure');
 const [canSwim,setCanSwim]=useState(false);
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
   const {data,error}=await supabase.from('athlete_onboarding').select('race_distance,race_date,experience,weekly_hours,device,onboarding_step,training_days,recent_weekly_hours,current_training_concern,ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km,can_swim_200m,training_background,training_consistency').eq('user_id',user.id).maybeSingle();
   if(cancelled)return;
   if(error)setMessage('Could not load your saved setup: '+error.message);
   else if(data){
    setRace(data.race_distance as Race);setRaceDate(data.race_date||'');
    setExperience(data.experience);setHours(Number(data.weekly_hours));
    setDevice(data.device as Device);
    setTrainingDays(Array.isArray(data.training_days)?data.training_days:[]);
    setRecentHours(data.recent_weekly_hours==null?'':String(data.recent_weekly_hours));
    setTrainingBackground(data.training_background||'unknown');
    setTrainingConsistency(data.training_consistency||'unknown');
    setTrainingConcern(data.current_training_concern==='none'||data.current_training_concern==='yes'?data.current_training_concern:'unsure');
    setFtpWatts(data.ftp_watts==null?'':String(data.ftp_watts));
    setSwimCss(formatAthletePace(data.swim_css_seconds_per_100m));
    setRunPace(formatAthletePace(data.run_threshold_seconds_per_km));
    setCanSwim(data.can_swim_200m===true);
    setKnownTests(data.ftp_watts!=null||data.swim_css_seconds_per_100m!=null||data.run_threshold_seconds_per_km!=null);
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
  const css=knownTests?parseAthletePace(swimCss):null;
  const run=knownTests?parseAthletePace(runPace):null;
  if(ftp!==null&&(!Number.isInteger(ftp)||ftp<60||ftp>650)){setMessage('Bike FTP should be between 60 and 650 W, or left blank.');return;}
  if(css!==null&&(!Number.isInteger(css)||css<50||css>300)){setMessage('Swim CSS: use 1:45 or 1.45 for one minute 45 seconds per 100m (0:50–5:00).');return;}
  if(run!==null&&(!Number.isInteger(run)||run<150||run>900)){setMessage('Run threshold: use 4:20 or 4.20 for four minutes 20 seconds per km (2:30–15:00).');return;}
  if(nextStep===3 && (trainingBackground==='unknown'||trainingConsistency==='unknown')){setMessage('Please confirm your training background and recent consistency.');setStep(1);return;}
  if(nextStep===3 && !displayName.trim()){setMessage('Please enter your name before finishing setup.');return;}
  setSaving(true);setMessage('');
  if(nextStep===3){
    setMessage('Building and checking your first two weeks of training…');
    const payload={
      display_name:displayName.trim(),race_distance:race,race_date:raceDate||null,
      experience,weekly_hours:hours,device,
      training_days:[...trainingDays].sort((a,b)=>a-b),
      recent_weekly_hours:recent,current_training_concern:trainingConcern,
      training_background:trainingBackground,training_consistency:trainingConsistency,
      can_swim_200m:canSwim,
      ftp_watts:ftp,swim_css_seconds_per_100m:css,
      run_threshold_seconds_per_km:run,
    };
    // The RPC commits onboarding + profile + safe foundation workouts as one
    // transaction. A failed publication cannot strand a completed setup
    // with zero calendar sessions.
    const {data:result,error:finishError}=await supabase.rpc(
      'complete_athlete_onboarding_and_plan',{p_inputs:payload});
    if(finishError){
      setSaving(false);
      setMessage('We could not finish and verify your programme. Your earlier setup answers are saved; retry Finish setup: '+finishError.message);
      return;
    }
    if(result?.status==='review_required'){
      setSaving(false);setReady(true);
      setMessage(result.reason||'A training concern needs coach review before exercise is prescribed.');
      return;
    }
    if(result?.status!=='ready'||!(result.sessions>0)){
      setSaving(false);setMessage('We could not verify a safe starter programme. Please retry.');return;
    }
    // The server has already checked the committed calendar and exact
    // generated-session count. Keep the user on the setup page if the
    // calendar cannot be confirmed.
    setSaving(false);
    setMessage('Your '+result.sessions+' training sessions are ready. Opening your calendar…');
    const firstSessionDate=String(result.calendar?.[0]?.date||result.first_date||'');
    const focusDate=/^\d{4}-\d{2}-\d{2}$/.test(firstSessionDate)?firstSessionDate:'';
    window.location.assign('/?start=calendar'+(focusDate?'&focus='+encodeURIComponent(focusDate):''));
    return;
  }
  const {error}=await supabase.from('athlete_onboarding').upsert({
   user_id:userId,race_distance:race,race_date:raceDate||null,
   experience,weekly_hours:hours,device,onboarding_step:nextStep,
   training_days:[...trainingDays].sort((a,b)=>a-b),
   recent_weekly_hours:recent,current_training_concern:trainingConcern,
   training_background:trainingBackground,training_consistency:trainingConsistency,
   can_swim_200m:canSwim,
   ftp_watts:ftp,swim_css_seconds_per_100m:css,run_threshold_seconds_per_km:run,
   updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  if(error){setSaving(false);setMessage('Unable to save setup: '+error.message);return;}
  setStep(Math.min(2,nextStep));
  setSaving(false);setMessage('Progress saved.');
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
   <fieldset style={{border:'1px solid #4395c8',borderRadius:14,padding:14,margin:'18px 0',background:'rgba(29,129,194,0.10)'}}>
    <legend style={{fontWeight:800,fontSize:16,padding:'0 6px'}}>Swimming availability</legend>
    <p style={{margin:'0 0 10px',fontSize:13}}>AZUR needs to know whether swimming is appropriate before including it in your programme.</p>
    <label style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:14,lineHeight:1.5}}>
      <input type="checkbox" aria-label="I can swim 200 metres comfortably and safely" checked={canSwim} onChange={e=>setCanSwim(e.target.checked)}/>
      <span>I can swim at least 200 metres comfortably and safely, and I have access to a suitable pool.</span>
    </label>
    <small style={{display:'block',marginTop:8}}>Leave unticked if unsure. You can update this later; no swim sessions will be prescribed until confirmed.</small>
   </fieldset>
   <label>Current endurance training background
    <select value={trainingBackground} onChange={e=>setTrainingBackground(e.target.value)}>
      <option value="unknown">Select your current training background</option>
      <option value="novice">New to consistent swim, bike and run training</option>
      <option value="regular">Train regularly, building endurance</option>
      <option value="established">Established endurance athlete with substantial training history</option>
    </select>
   </label>
   <label>How consistently have you trained recently?
    <select value={trainingConsistency} onChange={e=>setTrainingConsistency(e.target.value)}>
      <option value="unknown">Choose your recent consistency</option>
      <option value="under4">Less than four consecutive weeks</option>
      <option value="4to7">Four to seven consecutive weeks</option>
      <option value="8plus">Eight or more consecutive weeks</option>
    </select>
   </label>
   <p>Being new to a race distance does not mean you are new to endurance training. AZUR uses your training background and consistent, actually completed hours to determine a safe starting point.</p>
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
    <p style={{fontSize:13,lineHeight:1.5}}>If you don't know them, that's fine. AZUR can start you with two weeks of easy, RPE-based endurance when your training readiness allows. Your coach reviews later progression. Suitable benchmark tests can follow once you are ready.</p>
    <label style={{display:'flex',gap:10,alignItems:'center',fontSize:14}}>
     <input type="checkbox" checked={knownTests} onChange={e=>setKnownTests(e.target.checked)}/> I have recent test values to enter
    </label>
    {knownTests&&<div style={{display:'grid',gap:12,marginTop:13}}>
      <label>Bike FTP (watts, if known)
       <input type="number" min={60} max={650} inputMode="numeric" placeholder="e.g. 250" value={ftpWatts} onChange={e=>setFtpWatts(e.target.value)}/>
      </label>
      <label>Swim CSS (min:sec per 100m, e.g. 1:45 or 1.45)
       <input type="text" inputMode="text" placeholder="1:45 or 1.45" value={swimCss} onChange={e=>setSwimCss(e.target.value)} />
      </label>
      <label>Run threshold pace (min:sec per km, e.g. 4:20 or 4.20)
       <input type="text" inputMode="text" placeholder="4:20 or 4.20" value={runPace} onChange={e=>setRunPace(e.target.value)} />
      </label>
      <p style={{fontSize:12,margin:0}}>Values you supply are athlete-reported until your coach verifies them. Leave any unknown field blank.</p>
     </div>}
   </fieldset>
  </div>}
  <div className="azur-onboarding-actions">
   {step>0&&<button type="button" onClick={()=>{setStep(s=>s-1);setReady(false)}}>Back</button>}
   {step<2?<button type="button" disabled={saving} onClick={()=>{if(step===0 && !displayName.trim()){setMessage('Enter your name to continue.');return;}void save(step+1)}}>Continue</button>
   :<button type="button" disabled={saving} onClick={()=>void save(3)}>{saving?'Creating your plan…':'Finish & build my programme'}</button>}
  </div>
  {message && <p role="status" className="azur-onboarding-message">{message}</p>}
  {ready&&<div role="status" className="azur-onboarding-recap"><strong>Draft setup</strong>
   <p>{race.toUpperCase()} {raceDate?'· '+raceDate:''} · {hours} h/week · {device==='none'?'Manual logging':device.toUpperCase()}</p>
   <small>Training is only activated when the onboarding safety checks pass. Health concerns are held for review.</small>
  </div>}
 </section>;
}
