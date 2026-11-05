import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {starterWeekPreview} from '../lib/starterWeekPreview.mjs';
import {twoWeekFoundationPreview} from '../lib/twoWeekFoundation.mjs';
import {assessEntryPathway,entrySessionDistribution} from '../lib/athleteEntryPathway.mjs';
import {mapAutoWeek,proposeMissingRpeWorkout} from '../lib/automaticWeekDraft.mjs';

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
 const [entry,setEntry]=useState<ReturnType<typeof assessEntryPathway>|null>(null);
 const [distribution,setDistribution]=useState<ReturnType<typeof entrySessionDistribution>|null>(null);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [confirmHistory,setConfirmHistory]=useState(false);
 const [targetHours,setTargetHours]=useState('');
 const [existingTarget,setExistingTarget]=useState<number|null>(null);
 const [targetAudit,setTargetAudit]=useState<{phase:string;approved:boolean;locked:boolean}|null>(null);
 const [targetStatus,setTargetStatus]=useState('');
 const [draftStatus,setDraftStatus]=useState('');
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
 useEffect(()=>{setResult(null);setFoundation(null);setEntry(null);setDistribution(null);setExistingTarget(null);setTargetAudit(null);setConfirmHistory(false);setTargetHours('');setTargetStatus('');setDraftStatus('')},[selected,week]);
 async function preview(){
  setBusy(true);setMessage('');setResult(null);setFoundation(null);setEntry(null);setDistribution(null);setTargetStatus('');
  try{
   const athlete=athletes.find(a=>a.id===selected);
   if(!athlete?.user_id)throw new Error('Select an athlete with a verified account');
   const end=new Date(week+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+14);
   const [setup,workouts,existing,targetRecord,targetApproval]=await Promise.all([
    supabase.from('athlete_onboarding').select('weekly_hours,experience,onboarding_step,training_days,recent_weekly_hours,current_training_concern,ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km').eq('user_id',athlete.user_id).maybeSingle(),
    supabase.from('coach_workout_library').select('workout_key,title,sport,family,duration_min,level,phases,prescription,approved').eq('approved',true),
    supabase.from('planned_session').select('id').eq('athlete_id',athlete.id).gte('planned_date',week).lt('planned_date',end.toISOString().slice(0,10)).eq('is_active_version',true).neq('status','cancelled'),
    supabase.from('season_week').select('id,target_hours,phase,locked').eq('athlete_id',athlete.id).eq('week_start',week).maybeSingle(),
    supabase.from('coach_initial_target_approval').select('coach_user_id,target_hours').eq('athlete_id',athlete.id).eq('week_start',week).maybeSingle()
   ]);
   if(setup.error||workouts.error||existing.error||targetRecord.error||targetApproval.error)throw new Error(setup.error?.message||workouts.error?.message||existing.error?.message||targetRecord.error?.message||targetApproval.error?.message||'Data validation failed');
   const approvedHours=targetRecord.data?Number(targetRecord.data.target_hours):null;
   if(approvedHours!==null&&(!Number.isFinite(approvedHours)||approvedHours<=0))throw new Error('Invalid coach-approved weekly target');
   setExistingTarget(approvedHours);
   setTargetAudit(targetRecord.data?{phase:String(targetRecord.data.phase),locked:!!targetRecord.data.locked,approved:!!targetApproval.data&&Number(targetApproval.data.target_hours)===approvedHours}:null);
   if(!setup.data)throw new Error('No onboarding preferences available for this athlete. Ask them to finish setup.');
   const info=setup.data;
   const entryResult=assessEntryPathway({
      experience:info.experience,recentHours:info.recent_weekly_hours==null?null:Number(info.recent_weekly_hours),
      availableHours:Number(info.weekly_hours),trainingConcern:info.current_training_concern||'unsure',
      historyVerified:false,thresholdsVerified:false
   });
   setEntry(entryResult);
   setTargetHours(entryResult.targetMinutes===null?'':String(entryResult.targetMinutes/60));
   const reviewedMinutes=approvedHours===null?entryResult.targetMinutes:Math.min(entryResult.targetMinutes??approvedHours*60,approvedHours*60);
   setDistribution(entrySessionDistribution({pathway:entryResult.pathway,
    targetMinutes:reviewedMinutes,trainingDays:info.training_days||[],
    workouts:(workouts.data??[]) as Workout[]}));

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
 async function saveAutomaticDraft(){
  setBusy(true);setDraftStatus('');
  try{
   const athlete=athletes.find(a=>a.id===selected);
   if(!athlete?.user_id)throw new Error('Select a verified athlete');
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach required');
   const end=new Date(week+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);
   const [setup,targets,approvals,library,active,drafts]=await Promise.all([
    supabase.from('athlete_onboarding').select('onboarding_step,experience,weekly_hours,recent_weekly_hours,current_training_concern,training_days').eq('user_id',athlete.user_id).maybeSingle(),
    supabase.from('season_week').select('target_hours,phase,locked').eq('athlete_id',selected).eq('week_start',week).maybeSingle(),
    supabase.from('coach_initial_target_approval').select('target_hours,coach_user_id').eq('athlete_id',selected).eq('week_start',week).maybeSingle(),
    supabase.from('coach_workout_library').select('workout_key,title,sport,family,duration_min,level,phases,prescription,approved').eq('approved',true),
    supabase.from('planned_session').select('id').eq('athlete_id',selected).gte('planned_date',week).lt('planned_date',end.toISOString().slice(0,10)).eq('is_active_version',true).limit(1),
    supabase.from('weekly_plan_draft').select('id').eq('athlete_id',selected).eq('week_start',week).limit(1)
   ]);
   const failed=[setup,targets,approvals,library,active,drafts].find(x=>x.error);
   if(failed?.error)throw new Error(failed.error.message);
   const info=setup.data,target=targets.data,approval=approvals.data;
   if(!info||info.onboarding_step!==3||info.current_training_concern!=='none')
    throw new Error('Onboarding or training safety check is incomplete');
   if(!target)throw new Error('No weekly target exists for this date. Establish a coach-reviewed baseline first.');
   if(target.locked)throw new Error('This week is locked. Review the existing plan before generating another draft.');
   if(!['base','foundation'].includes(String(target.phase).toLowerCase()))
    throw new Error('This training phase needs a separate coach review before drafting.');
   if(!approval)throw new Error('Eight-hour target found, but the separate coach baseline approval is missing. Review and approve the athlete baseline before drafting; do not repeat onboarding.');
   if(approval.coach_user_id!==user.id||Number(approval.target_hours)!==Number(target.target_hours))
    throw new Error('The existing baseline approval does not match this coach and weekly target. Reconcile the approval before drafting.');
   if(String(target.phase).toLowerCase()==='foundation')
    throw new Error('Foundation week detected. This established-athlete Base draft generator cannot publish Foundation workouts; use the Foundation planning pathway or obtain an explicit coach-approved phase transition.');
   if(active.data?.length||drafts.data?.length)
    throw new Error('A calendar session or existing weekly draft must be reconciled before another is generated');
   const assessment=assessEntryPathway({experience:info.experience,
     recentHours:info.recent_weekly_hours==null?null:Number(info.recent_weekly_hours),
     availableHours:Number(info.weekly_hours),trainingConcern:info.current_training_concern,
     historyVerified:true,thresholdsVerified:false});
   if(assessment.pathway!=='continuation'||Number(target.target_hours)*60>(assessment.targetMinutes??0))
    throw new Error('Athlete training history does not support this proposed week');
   const suggested=entrySessionDistribution({pathway:assessment.pathway,targetMinutes:Number(target.target_hours)*60,
     trainingDays:info.training_days,workouts:library.data??[]});
   const mapped=mapAutoWeek({weekStart:week,targetHours:Number(target.target_hours),slots:suggested.slots,library:library.data??[]});
   if(!mapped.complete)throw new Error('Week not yet ready: '+mapped.blockers.join('; '));
   if(suggested.warnings.some(w=>/too few|five or more|exceeds four hours|rounding/.test(w)))
    throw new Error('Proposed distribution needs additional coach review');
   const canonical=JSON.stringify(mapped.sessions);
   const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
   const fingerprint=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
   const {error}=await supabase.from('weekly_plan_draft').insert({athlete_id:selected,week_start:week,
     revision:1,phase:'base',sessions:mapped.sessions,proposal_fingerprint:fingerprint,created_by:user.id});
   if(error)throw error;
   setDraftStatus('Complete week generated and saved for coach approval. No calendar changes made. Open Planning Tools → Weekly drafts to review.');
  }catch(e){setDraftStatus(e instanceof Error?e.message:'Unable to generate a safe weekly draft')}
  finally{setBusy(false)}
 }
 async function auditFoundation(){
  if(!confirmHistory||existingTarget===null||targetAudit?.phase?.toLowerCase()!=='foundation'||targetAudit.approved||targetAudit.locked)return;
  setBusy(true);setTargetStatus('');
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach required');
   const {data,error}=await supabase.rpc('audit_existing_foundation_target',{p_coach_id:user.id,p_athlete_id:selected,p_week_start:week,p_confirmed_history:true});
   if(error)throw error;
   if(!data||data.status!=='foundation_target_audited'||Number(data.target_hours)!==existingTarget)throw new Error('Foundation audit not confirmed');
   const {data:check,error:readError}=await supabase.from('coach_initial_target_approval').select('coach_user_id,target_hours').eq('athlete_id',selected).eq('week_start',week).maybeSingle();
   if(readError||!check||check.coach_user_id!==user.id||Number(check.target_hours)!==existingTarget)throw new Error('Approval readback failed; reconcile before retry');
   setTargetAudit({...targetAudit,approved:true});
   setTargetStatus('Foundation target audited. No training sessions or phases changed.');
  }catch(e){const err=e as {message?:string;details?:string;hint?:string;code?:string}|null;setTargetStatus([err?.message||'Foundation audit request failed',err?.code&&'Code: '+err.code,err?.details,err?.hint].filter(Boolean).join(' · '))}
  finally{setBusy(false)}
 }
 async function confirmTarget(){
  if(!entry||!confirmHistory||existingTarget!==null||entry.pathway!=='continuation')return;
  setBusy(true);setTargetStatus('');
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach required');
   const hours=Number(targetHours);
   if(!Number.isFinite(hours)||hours<2||entry.targetMinutes===null||hours*60>entry.targetMinutes)
    throw new Error('Choose a target no higher than recent verified training or availability');
   const {data,error}=await supabase.rpc('approve_initial_week_target',{
     p_coach_id:user.id,p_athlete_id:selected,p_week_start:week,
     p_target_hours:hours,p_confirmed_history:true
   });
   if(error)throw error;
   if(!data||data.status!=='coach_target_approved')throw new Error('Target approval was not confirmed');
   const {data:readback,error:rb}=await supabase.from('season_week')
    .select('target_hours').eq('athlete_id',selected).eq('week_start',week).maybeSingle();
   if(rb||!readback||Number(readback.target_hours)!==hours)throw new Error('Target saved, but calendar target readback failed. Do not retry without checking.');
   setExistingTarget(hours);
   setTargetStatus('Coach-reviewed training target saved. No sessions have been scheduled.');
  }catch(e){setTargetStatus(e instanceof Error?e.message:'Unable to verify target approval')}
  finally{setBusy(false)}
 }
 return <section aria-label="Automatic starter-week preview" style={{padding:16,background:'#102c44',border:'1px solid #335c77',borderRadius:15,color:'#edf8ff',minWidth:0}}>
  <h3 style={{fontSize:20,margin:'0 0 8px'}}>Automatic training plan</h3>
  <p style={{fontSize:11,color:'#7fcbee',margin:'0 0 8px'}}>Planner v3 · athlete-specific starting pathways</p>
  <p style={{fontSize:13,color:'#aec8d9',lineHeight:1.5}}>AZUR selects a starting pathway from training history, availability and thresholds. Beginner athletes receive a conservative foundation; established athletes receive a continuation proposal. Every plan requires coach review before publication.</p>
  <div style={{display:'grid',gap:12,margin:'14px 0'}}>
   <label style={{fontSize:13}}>Athlete<select style={{width:'100%',minHeight:44,marginTop:5}} value={selected} onChange={e=>setSelected(e.target.value)}>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}</select></label>
   <label style={{fontSize:13}}>Week starting Monday<input style={{display:'block',width:'100%',minHeight:44,marginTop:5}} type="date" value={week} onChange={e=>setWeek(e.target.value)}/></label>
  </div>
  <button type="button" disabled={loading||busy||!selected} onClick={()=>void preview()} style={{minHeight:46,padding:'10px 17px',borderRadius:12,border:'1px solid #53bce9',background:'#1576ab',fontWeight:700,color:'#fff'}}>{busy?'Checking…':'Generate training preview'}</button>
  {message&&<p role="alert">{message}</p>}
  {entry&&<section style={{marginTop:16,padding:13,borderRadius:12,border:'1px solid #39748d',background:'#133951'}}>
   <span style={{fontSize:11,color:'#83d5ff',fontWeight:700,letterSpacing:'0.07em'}}>AUTOMATIC ATHLETE CLASSIFICATION</span>
   <h4 style={{margin:'8px 0',fontSize:19}}>{entry.pathway==='continuation'?'Established-athlete continuation':entry.pathway==='return_to_training'?'Return-to-training review':entry.pathway==='continuation_review'?'Continuation needs checking':'Beginner foundation'}</h4>
   <p style={{fontSize:13,color:'#bad2e1'}}>Weekly volume reference: {entry.targetMinutes===null?'Needs review':Math.floor(entry.targetMinutes/60)+'h '+String(entry.targetMinutes%60).padStart(2,'0')+'m'} · not yet a validated training target.</p>
   {entry.blockers.map(item=><p key={item} style={{fontSize:13,color:'#ffda9c'}}>• {item}</p>)}
   {distribution&&<details style={{marginTop:10}} open>
     <summary style={{cursor:'pointer',fontSize:14,fontWeight:700,color:'#a9e1ff'}}>Proposed training distribution and library readiness</summary>
     {distribution.targetBySport&&<p style={{fontSize:13,color:'#c2d7e6',marginTop:12}}>
      {Object.entries(distribution.targetBySport).map(([sport,mins])=>sport.toUpperCase()+' '+Math.floor(Number(mins)/60)+'h '+String(Number(mins)%60).padStart(2,'0')+'m').join(' · ')}
     </p>}
     {distribution.slots.map((slot,index)=>{const proposal=!slot.approvedMatches.length?proposeMissingRpeWorkout({sport:slot.sport,minutes:slot.minutes}):null;return <div key={slot.day+'-'+slot.sport+'-'+index} style={{padding:'8px 0',borderBottom:'1px solid #345c77',fontSize:13}}>
      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][slot.day]} · {slot.sport.toUpperCase()} · {slot.minutes} min · {slot.approvedMatches.length?'Approved: '+slot.approvedMatches[0].title:proposal?'Structured candidate — coach approval required':'Needs manual coach prescription'}
      {proposal&&<details style={{margin:'7px 0',padding:9,background:'#102c44',borderRadius:9}}>
       <summary style={{cursor:'pointer',color:'#9edbff'}}>Review proposed intervals · {proposal.prescription.steps.length} steps</summary>
       <p style={{fontSize:12,color:'#bcd5e5'}}>{proposal.purpose}. Not approved or publishable.</p>
       {proposal.prescription.steps.map((step,i)=><div key={i} style={{fontSize:12,padding:'4px 0',color:'#e1eff8'}}>{step.durationMin} min · {step.target}</div>)}
      </details>}
     </div>})}
     <p style={{fontSize:12,color:'#bde2f6'}}>Suggested {distribution.proposedMinutes??0} min · matched to approved workout durations {distribution.mappedMinutes} min · {distribution.restDays??'—'} rest day(s). No sessions are published.</p>
     {distribution.warnings.map(w=><p key={w} style={{fontSize:12,color:'#ffdfaf'}}>{w}</p>)}
   </details>}
   {entry.pathway==='continuation'&&<section style={{padding:12,marginTop:12,border:'1px solid #4e8ab0',borderRadius:12}}>
    <strong style={{fontSize:14}}>Coach-approved weekly target</strong>
    <p style={{fontSize:12,color:'#b5d2e4'}}>Only confirm if you've checked the athlete's recent training and readiness. The athlete's availability is not proof of capacity.</p>
    {existingTarget!==null?<div role="status" style={{fontSize:13,lineHeight:1.5,color:'#dceef9'}}><p>Existing weekly target: <strong>{existingTarget} h</strong> · Phase: <strong>{targetAudit?.phase??'Unknown'}</strong></p><p style={{color:targetAudit?.approved?'#a9f0bd':'#ffd18a'}}>{targetAudit?.approved?'Separate coach baseline approval recorded.':'Separate coach baseline approval missing. An existing target alone is not a recorded approval.'}</p>{targetAudit?.phase?.toLowerCase()==='foundation'&&<><p>Foundation phase remains unchanged. This review records a coach decision only.</p>{!targetAudit.approved&&!targetAudit.locked&&<><label style={{display:'flex',gap:10,margin:'12px 0'}}><input type="checkbox" checked={confirmHistory} onChange={e=>setConfirmHistory(e.target.checked)}/>I have reviewed actual recent training and readiness for this target.</label><button type="button" disabled={busy||!confirmHistory} onClick={()=>void auditFoundation()}>{busy?'Auditing…':'Audit existing Foundation target'}</button></>}</>}</div>:<>
     <label style={{display:'block',fontSize:13}}>Target hours (maximum {entry.targetMinutes===null?'—':(entry.targetMinutes/60).toFixed(1)} h)
      <input type="number" min={2} max={entry.targetMinutes===null?2:entry.targetMinutes/60} step={0.5} value={targetHours} onChange={e=>setTargetHours(e.target.value)} style={{display:'block',minHeight:44,width:'100%',margin:'6px 0 12px'}}/>
     </label>
     <label style={{display:'flex',alignItems:'flex-start',gap:10,fontSize:13,lineHeight:1.5,margin:'12px 0'}}>
      <input type="checkbox" checked={confirmHistory} onChange={e=>setConfirmHistory(e.target.checked)} style={{width:20,height:20,flexShrink:0}}/>
      I have reviewed the athlete's actual recent training and confirmed this initial weekly target is appropriate.
     </label>
     <button type="button" disabled={busy||!confirmHistory} onClick={()=>void confirmTarget()} style={{minHeight:44,borderRadius:10,padding:'10px 16px',background:'#1776a7',color:'#fff',border:'1px solid #62c4e8',fontWeight:700}}>
      {busy?'Saving…':'Approve initial weekly target'}
     </button>
    </>}
    {targetStatus&&<p role="status" style={{fontSize:13,marginTop:10}}>{targetStatus}</p>}
    {existingTarget!==null&&<div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #345d79'}}>
     <strong style={{fontSize:14}}>Automatic weekly draft</strong>
     <p style={{fontSize:12,color:'#b5d2e4'}}>Generate from the approved RPE workout library, after all session gaps are resolved. A saved draft still needs a separate coach approval and secure publication.</p>
     <button type="button" disabled={busy} onClick={()=>void saveAutomaticDraft()} style={{minHeight:44,borderRadius:10,padding:'10px 16px',background:'#176c96',color:'#fff',border:'1px solid #55a9ce',fontWeight:700}}>
      {busy?'Checking approved workouts…':'Generate complete week for approval'}
     </button>
     {draftStatus&&<p role="status" style={{fontSize:13,marginTop:10}}>{draftStatus}</p>}
    </div>}
    <p style={{fontSize:12,color:'#9abed2'}}>This records a coach decision only. Workouts still require approved prescriptions, a complete draft and separate publication approval.</p>
   </section>}
      <p style={{fontSize:12,color:'#a7c5d8',marginTop:12}}>For now, AZUR uses RPE-based workouts only. Athlete-reported thresholds cannot be treated as verified coach targets.</p>
  </section>}
  {foundation&&entry?.pathway==='foundation'&&<div style={{marginTop:16}}>
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
  {result&&entry?.pathway==='foundation'&&<details style={{marginTop:14}}><summary style={{cursor:'pointer',fontSize:13,color:'#9accf4'}}>Existing approved-workout coverage</summary><div style={{marginTop:10}}> 
   <strong style={{color:'#ffdb8a'}}>Coach review required · not publishable</strong>
   <p style={{fontSize:13,color:'#a9c7d7'}}>{result.minutes} candidate minutes · availability ceiling {result.availabilityCeilingMinutes??'unknown'} minutes (not a training target)</p>
   <p style={{fontSize:12,color:'#a6c9db'}}>Template matches: {result.sessions.length}. This library check is separate from the athlete's day-specific two-week foundation above.</p>
   <div style={{padding:12,borderRadius:11,background:'#26392e',border:'1px solid #626a42'}}>
    <strong>Before the first week can be released</strong>
    <ul style={{fontSize:13,lineHeight:1.6,paddingLeft:20}}>{result.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
   </div>
  </div></details>}
 </section>;
}
