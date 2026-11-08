import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Device = 'garmin'|'coros'|'polar'|'apple'|'other'|'none';
type Race = 'sprint'|'olympic'|'70.3'|'ironman'|'other';
const formatPace=(raw:string)=>{if(!raw)return '';if(raw.includes(':'))return raw;const n=Number(raw);return Number.isFinite(n)?`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`:raw};
const paceDigits=(raw:string)=>{const digits=raw.replace(/\D/g,'').slice(0,4);if(digits.length<=2)return digits;return `${digits.slice(0,-2)}:${digits.slice(-2)}`;};
const parsePace=(raw:string)=>{const v=raw.trim();if(!v)return null;if(/^\d{1,2}:\d{2}$/.test(v)){const [m,sec]=v.split(':').map(Number);return sec<60?m*60+sec:NaN;}return NaN;};
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
 const [hours,setHours]=useState('8');
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
 const [betaAcknowledged,setBetaAcknowledged]=useState(false);
 const [displayName,setDisplayName]=useState('');
 const [userId,setUserId]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 const [isCoach,setIsCoach]=useState(false);
 const [invitationVerified,setInvitationVerified]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  async function load(){
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(cancelled)return;
   if(authError || !user){setMessage('Sign in to save your athlete setup.');setLoading(false);return;}
   if(user.app_metadata?.role==='coach'){setIsCoach(true);setLoading(false);return;}
   setUserId(user.id);
   const {data:acceptedInvite,error:inviteError}=await supabase.from('coach_athlete_invitation').select('id').not('accepted_at','is',null).limit(1);
   if(cancelled)return;
   if(inviteError||!acceptedInvite?.length){setMessage('A coach invitation must be accepted from your email before you can begin setup. Please contact your coach for an invitation.');setLoading(false);return;}
   setInvitationVerified(true);
   const {data:profile}=await supabase.from('athlete_profile').select('display_name').eq('user_id',user.id).maybeSingle();
   if(!cancelled && profile?.display_name) setDisplayName(profile.display_name);
   const {data,error}=await supabase.from('athlete_onboarding').select('race_distance,race_date,experience,weekly_hours,training_days,recent_weekly_hours,ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km,training_background,training_consistency,current_training_concern,can_swim_200m,device,onboarding_step').eq('user_id',user.id).maybeSingle();
   if(cancelled)return;
   if(error)setMessage('Could not load your saved setup: '+error.message);
   else if(data){
    setRace(data.race_distance as Race);setRaceDate(data.race_date||'');
    setExperience(data.experience);setHours(String(data.weekly_hours));
    setDevice(data.device as Device);
    setBackground(data.training_background||'regular');setBackgroundTouched(true);setConsistency(data.training_consistency||'4to7');setConcern(data.current_training_concern||'none');setCanSwim(data.can_swim_200m??true);
    setTrainingDays((data.training_days||[]).map((day:number)=>weekdays[day]).filter(Boolean));setRecentHours(data.recent_weekly_hours==null?'':String(data.recent_weekly_hours));
    setFtp(data.ftp_watts==null?'':String(data.ftp_watts));setCss(data.swim_css_seconds_per_100m==null?'':formatPace(String(data.swim_css_seconds_per_100m)));setRunThreshold(data.run_threshold_seconds_per_km==null?'':formatPace(String(data.run_threshold_seconds_per_km)));setStep(Math.min(4,Math.max(0,data.onboarding_step)));
    // Existing athlete data is always preserved; no automatic plan changes.
   }
   setLoading(false);
  }
  void load();
  return ()=>{cancelled=true};
 },[]);
 useEffect(()=>{if(!loading){window.scrollTo({top:0,behavior:'smooth'});}},[step,loading]);
 async function save(nextStep:number){
  if(!userId){setMessage('Sign in to save your setup.');return;}
  if(hours.trim()===''||!Number.isFinite(Number(hours))||Number(hours)<2||Number(hours)>25){setMessage('Weekly hours must be between 2 and 25.');return;}
  if(trainingDays.length===0 && nextStep>=2){setMessage('Choose at least one day you can train.');return;}
  if(recentHours!=='' && (!Number.isFinite(Number(recentHours))||Number(recentHours)<0||Number(recentHours)>25)){setMessage('Recent weekly training must be between 0 and 25 hours.');return;}
  if(ftp!==''&&(!Number.isFinite(Number(ftp))||Number(ftp)<60||Number(ftp)>650)){setMessage('FTP must be between 60 and 650 watts.');return;}
  for(const [label,value,min,max] of [['Swim CSS',css,50,300],['Run threshold',runThreshold,150,900]] as const){const seconds=parsePace(value);if(value!==''&&(seconds===null||!Number.isFinite(seconds)||seconds<min||seconds>max)){setMessage(`${label}: enter a pace as minutes:seconds (e.g. ${label==='Swim CSS'?'1:45':'5:00'}). Leave blank if unknown.`);return;}}
  if(nextStep===5 && !betaAcknowledged){setMessage('Please acknowledge the beta limitations before creating your plan.');return;}
  if(nextStep===5 && !displayName.trim()){setMessage('Please enter your name before finishing setup.');return;}
  setSaving(true);setMessage('');
  if(nextStep===5){
   const {data,error}=await supabase.rpc('complete_athlete_onboarding_and_plan',{
    p_inputs:{
     display_name:displayName.trim(),race_distance:race,race_date:raceDate||null,
     experience,weekly_hours:Number(hours),training_days:trainingDays.map(day=>weekdays.indexOf(day)),
     recent_weekly_hours:recentHours===''?null:Number(recentHours),
     training_background:background,training_consistency:consistency,
     current_training_concern:concern,can_swim_200m:canSwim,
     ftp_watts:ftp===''?null:Number(ftp),
     swim_css_seconds_per_100m:parsePace(css),
     run_threshold_seconds_per_km:parsePace(runThreshold),device
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
   experience,weekly_hours:Number(hours),training_days:trainingDays.map(day=>weekdays.indexOf(day)),training_background:background,training_consistency:consistency,current_training_concern:concern,can_swim_200m:canSwim,recent_weekly_hours:recentHours===''?null:Number(recentHours),
   ftp_watts:ftp===''?null:Number(ftp),swim_css_seconds_per_100m:parsePace(css),run_threshold_seconds_per_km:parsePace(runThreshold),device,onboarding_step:nextStep,
   updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  setSaving(false);
  if(error){setMessage('Unable to save setup: '+error.message);return;}
  setStep(Math.min(4,nextStep));
  setMessage('');
 }
 if(loading)return <section className="azur-onboarding-draft"><p>Loading your setup…</p></section>;
 if(!invitationVerified&&!isCoach)return <section className="azur-onboarding-draft" role="status"><h3>Invitation required</h3><p>{message||'Please accept your coach invitation before onboarding.'}</p><p>Open the invitation email sent by your coach, sign in with that address, and accept the invitation.</p></section>;
 if(isCoach)return <section className="azur-onboarding-draft"><h3>Athlete onboarding</h3><p>This setup is for athlete accounts. Coach access and assignments are managed separately.</p></section>;
 return <section className="azur-onboarding-draft" aria-label="AZUR beta onboarding preview">
  <div className="azur-onboarding-progress"><strong>YOUR AZUR JOURNEY</strong><span>Step {step+1} of 5</span></div>
  <div className="azur-onboarding-track"><span style={{width:`${(step+1)/5*100}%`}}/></div>
  {step===0&&<div>
   <h3>What are you training towards?</h3><p>Your goal sets the direction. Your current fitness and availability determine where we begin.</p>
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
   <h3>Training that fits your life</h3><p>Choose the time you can consistently protect. AZUR will adapt training to your real week, not the other way around.</p>
   <label>Typical hours available per week<input type="number" min={2} max={25} value={hours} onFocus={e=>e.currentTarget.select()} onChange={e=>setHours(e.target.value)}/></label>
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

  </div>}
  {step===2&&<div>   <h3>Your current fitness</h3>
   <p>Enter recent reliable benchmarks to personalise training intensity. Unknown? Leave blank — AZUR will introduce appropriate testing when you're ready.</p>
   <label>Bike FTP (watts)<input type="number" min={60} max={650} value={ftp} onChange={e=>setFtp(e.target.value)} placeholder="Unknown"/></label>
   <label>Swim CSS (min:sec per 100m) <small>Example: 1:45</small><input type="text" inputMode="numeric" value={css} onChange={e=>setCss(paceDigits(e.target.value))} placeholder="Unknown"/></label>
   <label>Run threshold (min:sec per km) <small>Example: 4:20</small><input type="text" inputMode="numeric" value={runThreshold} onChange={e=>setRunThreshold(paceDigits(e.target.value))} placeholder="Unknown"/></label>
   <small>Leave unknown values blank — don't guess. AZUR will begin with appropriate endurance sessions and schedule benchmarks when you are ready.</small>
  </div>}
  {step===3&&<div>
   <h3>Connect your training</h3><p>Choose how you record sessions. You can connect supported services later.</p>

   <div className="azur-onboarding-options">{devices.map(d=><label key={d.id} className={device===d.id?'selected':''}>
    <input type="radio" name="azur-device" checked={device===d.id} onChange={()=>setDevice(d.id)}/>{d.label}
   </label>)}</div>
   <p>{device==='garmin'?'Garmin connection will be offered after setup where available.':device==='none'?'You can record workouts, RPE and benchmarks manually.':'You can start with manual workout logging. Direct syncing for this device is not yet available.'}</p>
  </div>}
  {step===4&&<div className="azur-beta-disclosure" role="group" aria-label="AZUR beta participation"><h3>Before you begin: AZUR beta</h3><p><strong>What AZUR offers:</strong> race-goal and availability-based setup, structured training plans, workout explanations, feedback and supported activity connections.</p><p><strong>What is still being tested:</strong> training adaptations, device imports, calendar syncing and some coaching insights may be incomplete or inaccurate. Training sessions may require coach review. Do not follow a workout that feels unsafe; report problems to your coach. AZUR is not medical advice.</p><label><input type="checkbox" checked={betaAcknowledged} onChange={e=>setBetaAcknowledged(e.target.checked)}/> I understand that AZUR is a beta product and will review any unsuitable sessions or missing data with my coach.</label><small>This acknowledgement is required to finish setup. It is not yet stored as a permanent consent record.</small></div>}
  {step===4&&<div className="azur-onboarding-recap"><h3>Your AZUR starting point</h3><p><strong>{displayName}</strong> · {race.toUpperCase()} {raceDate?'· '+raceDate:''}</p><p>{hours} hours available each week · {trainingDays.join(', ')}</p><p>{css?'Swim CSS '+css+'/100m':'Swim benchmark to be established'} · {runThreshold?'Run threshold '+runThreshold+'/km':'Run benchmark to be established'}</p><p><strong>Why your plan starts this way</strong></p><p>AZUR uses your recent training, availability and race goal to establish a sustainable starting point. Where benchmarks are missing, your first two weeks focus on manageable endurance and learning how your body responds before targeted intensity is introduced.</p></div>}
  <div className="azur-onboarding-actions" style={{position:"sticky",bottom:0,zIndex:5,display:"flex",gap:12,justifyContent:"flex-end",padding:"14px 8px max(14px, env(safe-area-inset-bottom))",background:"linear-gradient(180deg, rgba(9,28,46,0.96), #091c2e)",borderTop:"1px solid rgba(110,178,216,0.25)",borderRadius:12}}>
   {step>0&&<button type="button" onClick={()=>{setMessage("");setStep(s=>s-1);setReady(false)}}>Back</button>}
   {step<4?<button type="button" disabled={saving} onClick={()=>{if(step===0 && !displayName.trim()){setMessage('Enter your name to continue.');return;}void save(step+1)}}>{saving?"Saving…":"Continue"}</button>
   :<button type="button" disabled={saving} onClick={()=>void save(5)}>{saving?'Creating plan…':'Finish setup & create plan'}</button>}
  </div>
  {message && <p role="status" className="azur-onboarding-message">{message}</p>}
  {ready&&<div role="status" className="azur-onboarding-recap"><strong>Draft setup</strong>
   <p>{race.toUpperCase()} {raceDate?'· '+raceDate:''} · {hours} h/week · {device==='none'?'Manual logging':device.toUpperCase()}</p>
   <small>{message.startsWith('Your training plan is ready')?'Your plan has been created and verified.':'Your setup has been saved; your coach will review it before training is allocated.'}</small>
  </div>}
 </section>;
}
