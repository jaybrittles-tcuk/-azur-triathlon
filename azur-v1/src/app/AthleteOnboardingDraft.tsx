import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Device = 'garmin'|'coros'|'polar'|'apple'|'other'|'none';
type Race = 'sprint'|'olympic'|'70.3'|'ironman'|'other';
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
 const [experience,setExperience]=useState('first');
 const [sessionsPerWeek,setSessionsPerWeek]=useState('');
 const [swimsPerWeek,setSwimsPerWeek]=useState('');
 const [longestRide,setLongestRide]=useState('');
 const [longestRun,setLongestRun]=useState('');
 const [baselineConfirmed,setBaselineConfirmed]=useState(false);
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
   const {data,error}=await supabase.from('athlete_onboarding').select('race_distance,race_date,experience,weekly_hours,device,onboarding_step').eq('user_id',user.id).maybeSingle();
   if(cancelled)return;
   if(error)setMessage('Could not load your saved setup: '+error.message);
   else if(data){
    setRace(data.race_distance as Race);setRaceDate(data.race_date||'');
    setExperience(data.experience);setHours(Number(data.weekly_hours));
    setDevice(data.device as Device);setStep(Math.min(2,Math.max(0,data.onboarding_step)));
   }
   setLoading(false);
  }
  void load();
  return ()=>{cancelled=true};
 },[]);
 async function save(nextStep:number){
  if(!userId){setMessage('Sign in to save your setup.');return;}
  if(!Number.isFinite(hours)||hours<2||hours>25){setMessage('Weekly hours must be between 2 and 25.');return;}
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
   updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  if(error){setSaving(false);setMessage('Unable to save setup: '+error.message);return;}
  // Onboarding is the source of availability. Seed only missing baseline values;
  // never overwrite coach-confirmed limits, previous training, or session history.
  if(nextStep===3){
   const {data:profile,error:profileError}=await supabase.from('athlete_profile').select('id,normal_weekly_hours').eq('user_id',userId).maybeSingle();
   if(profileError||!profile){setSaving(false);setMessage('Setup saved, but the athlete profile could not be checked. Please retry.');return;}
   // A confirmed training baseline requires session frequency and longest
   // ride/run evidence. Do not invent those values from weekly availability.
   // A coach or the dedicated baseline assessment must confirm them.
   if(baselineConfirmed){
    const values=[sessionsPerWeek,swimsPerWeek,longestRide,longestRun];
    const parsed=values.map(value=>Number(value));
    if(values.some(value=>value.trim()==='') || parsed.some(value=>!Number.isInteger(value)||value<0)
      || parsed[0]>21 || parsed[1]>parsed[0] || parsed[2]>600 || parsed[3]>300){
     setSaving(false);setMessage('Check session counts and longest ride/run minutes before confirming your training baseline.');return;
    }
    const {data:existingBaseline,error:baselineLookupError}=await supabase.from('athlete_training_baseline').select('athlete_id').eq('athlete_id',profile.id).maybeSingle();
    if(baselineLookupError){setSaving(false);setMessage('Unable to check your existing training baseline: '+baselineLookupError.message);return;}
    if(!existingBaseline){
     const {error:baselineSaveError}=await supabase.from('athlete_training_baseline').insert({
      athlete_id:profile.id,weekly_hours:hours,max_weekly_hours:hours,
      sessions_per_week:parsed[0],swims_per_week:parsed[1],
      longest_ride_minutes:parsed[2],longest_run_minutes:parsed[3]
     });
     if(baselineSaveError){setSaving(false);setMessage('Your setup was saved, but baseline confirmation failed: '+baselineSaveError.message);return;}
    }
   }
   if(profile.normal_weekly_hours==null){
    const {error:hoursError}=await supabase.from('athlete_profile').update({normal_weekly_hours:hours}).eq('id',profile.id).is('normal_weekly_hours',null);
    if(hoursError){setSaving(false);setMessage('Setup saved, but weekly hours could not be added to your profile: '+hoursError.message);return;}
   }
  }
  setSaving(false);
  setStep(Math.min(2,nextStep));
  if(nextStep===3){if(window.location.pathname==='/onboarding'){window.location.assign('/');return;}setReady(true);setMessage('Your weekly availability has been saved. Any confirmed training baseline is recorded separately; a coach review is still required before publishing your plan.');}
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
   <p>We use your availability to design training that fits your life, not the other way around.</p>
   <h4>Your recent training baseline (optional)</h4>
   <p>Enter real recent training figures, not your goal workload. Leave this unconfirmed if you're unsure; your coach can assess it safely.</p>
   <label>Typical sessions per week<input type="number" min="0" max="21" value={sessionsPerWeek} onChange={e=>setSessionsPerWeek(e.target.value)}/></label>
   <label>Swim sessions per week<input type="number" min="0" max="21" value={swimsPerWeek} onChange={e=>setSwimsPerWeek(e.target.value)}/></label>
   <label>Longest recent bike ride (minutes)<input type="number" min="0" max="600" value={longestRide} onChange={e=>setLongestRide(e.target.value)}/></label>
   <label>Longest recent run (minutes)<input type="number" min="0" max="300" value={longestRun} onChange={e=>setLongestRun(e.target.value)}/></label>
   <label><input type="checkbox" checked={baselineConfirmed} onChange={e=>setBaselineConfirmed(e.target.checked)}/> I confirm these reflect my recent training</label>
  </div>}
  {step===2&&<div>
   <h3>How do you track training?</h3>
   <div className="azur-onboarding-options">{devices.map(d=><label key={d.id} className={device===d.id?'selected':''}>
    <input type="radio" name="azur-device" checked={device===d.id} onChange={()=>setDevice(d.id)}/>{d.label}
   </label>)}</div>
   <p>{device==='garmin'?'Garmin connection will be offered after setup where available.':device==='none'?'You can record workouts, RPE and benchmarks manually.':'You can start with manual workout logging. Direct syncing for this device is not yet available.'}</p>
  </div>}
  <div className="azur-onboarding-actions">
   {step>0&&<button type="button" onClick={()=>{setStep(s=>s-1);setReady(false)}}>Back</button>}
   {step<2?<button type="button" disabled={saving} onClick={()=>{if(step===0 && !displayName.trim()){setMessage('Enter your name to continue.');return;}void save(step+1)}}>Continue</button>
   :<button type="button" disabled={saving} onClick={()=>void save(3)}>Review setup</button>}
  </div>
  {message && <p role="status" className="azur-onboarding-message">{message}</p>}
  {ready&&<div role="status" className="azur-onboarding-recap"><strong>Draft setup</strong>
   <p>{race.toUpperCase()} {raceDate?'· '+raceDate:''} · {hours} h/week · {device==='none'?'Manual logging':device.toUpperCase()}</p>
   <small>Your weekly availability is saved. A full training baseline, coach assignment and training plan are not automatically created.</small>
  </div>}
 </section>;
}
