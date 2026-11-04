import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type PlanSession={date:string;sport:'swim'|'bike'|'run';title:string;duration_min:number;
 selection_source?:'approved_coach_library'|'conservative_rpe_foundation';selection_reason?:string;family?:string};
type PlanPreview={
 status:'ready_for_confirmation'|'coach_review_required';
 reason?:string|null;week_start:string;week_cap_minutes:number;training_tier:string;
 capacity_basis:string;athlete_reported:boolean;total_minutes:number;existing_peak_week_minutes?:number;
 sessions:PlanSession[];calendar_fingerprint:string;
};
type Inputs={training_background:string;training_consistency:string;recent_weekly_hours:number|null;weekly_hours:number;training_days:number[];can_swim_200m:boolean};
const names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const minutes=(value:number)=>value>=60?`${Math.floor(value/60)}h ${value%60?value%60+'m':''}`.trim():value+'m';

/** Athlete-only preview: read-only until an explicit second confirmation. */
export default function FoundationReassessment({onApplied}:{onApplied:()=>Promise<void>|void}){
 const [eligible,setEligible]=useState(false);
 const [open,setOpen]=useState(false);
 const [inputs,setInputs]=useState<Inputs>({
   training_background:'unknown',training_consistency:'unknown',recent_weekly_hours:null,
   weekly_hours:8,training_days:[],can_swim_200m:false
 });
 const [recentInput,setRecentInput]=useState('');
 const [preview,setPreview]=useState<PlanPreview|null>(null);
 const [previewInputs,setPreviewInputs]=useState<Inputs|null>(null);
 const [loading,setLoading]=useState(false);
 const [reviewStatus,setReviewStatus]=useState<'none'|'pending'|'approved'|'rejected'>('none');
 const [reviewNote,setReviewNote]=useState('');
 const [latestDecision,setLatestDecision]=useState<{status:string;coach_note?:string;active_sessions?:number}|null>(null);
 const [reviewSubmissionMessage,setReviewSubmissionMessage]=useState('');
 const [reviewNeedsAssignment,setReviewNeedsAssignment]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let cancelled=false;
  void (async()=>{
   const {data:{user}}=await supabase.auth.getUser();
   if(!user || user.app_metadata?.role==='coach')return;
   const {data:setup,error}=await supabase.from('athlete_onboarding')
    .select('onboarding_step,training_background,training_consistency,recent_weekly_hours,weekly_hours,training_days,can_swim_200m,current_training_concern')
    .eq('user_id',user.id).maybeSingle();
   if(cancelled||error||!setup||setup.onboarding_step!==3)return;
   setEligible(true);
   const recentDecision=await supabase.rpc('latest_foundation_coach_decision');
   if(!cancelled&&!recentDecision.error)setLatestDecision(recentDecision.data);
   setInputs({
    training_background:setup.training_background||'unknown',
    training_consistency:setup.training_consistency||'unknown',
    recent_weekly_hours:setup.recent_weekly_hours==null?null:Number(setup.recent_weekly_hours),
    weekly_hours:Number(setup.weekly_hours),
    training_days:Array.isArray(setup.training_days)?setup.training_days:[],
    can_swim_200m:setup.can_swim_200m===true
   });
   setRecentInput(setup.recent_weekly_hours==null?'':String(setup.recent_weekly_hours));
   if(setup.current_training_concern!=='none')
     setMessage('Training concerns are held for coach review. Please do not increase training until cleared.');
  })();
  return ()=>{cancelled=true};
 },[]);
 function edit(patch:Partial<Inputs>){setInputs(i=>({...i,...patch}));setPreview(null);setPreviewInputs(null);setReviewStatus('none');setReviewSubmissionMessage('');setReviewNeedsAssignment(false);setMessage('');}
 async function loadReviewState(proposed:Inputs,data:PlanPreview){
  if(data.status!=='coach_review_required')return;
  const response=await supabase.rpc('foundation_coach_review_state',{p_inputs:proposed,p_expected_preview:data});
  if(response.error){setMessage('Unable to check coach review: '+response.error.message);return;}
  setReviewStatus(response.data?.status||'none');
  setReviewNote(response.data?.coach_note||'');
 }
 async function requestCoachReview(){
  if(!preview||!previewInputs||loading)return;
  setLoading(true);setMessage('');setReviewSubmissionMessage('');setReviewNeedsAssignment(false);
  const response=await supabase.rpc('submit_foundation_coach_review',{p_inputs:previewInputs,p_expected_preview:preview});
  setLoading(false);
  if(response.error){setReviewSubmissionMessage('Request not sent: '+response.error.message);return;}
  if(response.data?.status==='coach_assignment_required'){
    setReviewNeedsAssignment(true);
    setReviewSubmissionMessage('Request NOT sent. This athlete account is not connected to an AZUR coach. Go to More → Coach Invitations and accept an invitation from your coach, then retry here.');return;
  }
  if(response.data?.status!=='submitted'){setReviewSubmissionMessage('Request not sent: '+(response.data?.reason||'Coach review not available.'));return;}
  setReviewStatus('pending');setReviewSubmissionMessage('Request saved and sent to your assigned AZUR coach. Your current training remains unchanged.');
 }
 async function makePreview(){
  const recent=recentInput.trim()===''?null:Number(recentInput);
  if(!['novice','regular','established'].includes(inputs.training_background) ||
     !['under4','4to7','8plus'].includes(inputs.training_consistency)){
   setMessage('Choose your endurance background and recent consistency.');return;
  }
  if(!Number.isFinite(inputs.weekly_hours)||inputs.weekly_hours<2||inputs.weekly_hours>25||
      (recent!==null&&(!Number.isFinite(recent)||recent<0||recent>25))||
      inputs.training_days.length===0){
   setMessage('Check available days and training hours (0–25 completed hours; 2–25 available).');return;
  }
  const proposed:Inputs={...inputs,recent_weekly_hours:recent};
  setLoading(true);setMessage('');setPreview(null);setReviewStatus('none');setReviewSubmissionMessage('');setReviewNeedsAssignment(false);
  const {data,error}=await supabase.rpc('preview_foundation_reassessment',{p_inputs:proposed});
  setLoading(false);
  if(error){setMessage('Unable to preview: '+error.message);return;}
  if(!data||!Array.isArray(data.sessions)){
   setMessage(data?.reason||'A safe reassessment preview is unavailable.');return;
  }
  setPreview(data as PlanPreview);setPreviewInputs(proposed);
  await loadReviewState(proposed,data as PlanPreview);
 }
 async function confirm(){
  if(!preview||!previewInputs||loading||
   preview.status!=='ready_for_confirmation')return;
  setLoading(true);setMessage('');
  const {data,error}=await supabase.rpc('apply_foundation_reassessment',{
    p_inputs:previewInputs,p_expected_preview:preview,p_confirm:true
  });
  if(error){setLoading(false);setMessage('No calendar changes were made: '+error.message);return;}
  if(data?.status!=='applied'){setLoading(false);setMessage('Unable to confirm the calendar update.');return;}
  try{
   await onApplied();
   setMessage(`Reassessment applied: ${data.sessions} future sessions published. Current week preserved.`);
   setPreview(null);setPreviewInputs(null);setOpen(false);
  }catch{setMessage('Training saved, but calendar refresh failed. Reopen your calendar.');}
  setLoading(false);
 }
 if(!eligible)return null;
 const daysPerWeek=preview?.sessions.reduce<Record<string,PlanSession[]>>((acc,s)=>{
   const week=new Date(s.date+'T12:00:00Z');
   const offset=(week.getUTCDay()+6)%7;
   week.setUTCDate(week.getUTCDate()-offset);
   const key=week.toISOString().slice(0,10);
   (acc[key]??=[]).push(s);
   return acc;
 },{})??{};
 return <section aria-label="Reassess your training baseline" style={{
   padding:12,border:'1px solid #9ac4dd',borderRadius:14,
   background:'#f2f8fd',marginBottom:10,color:'#17354b'}}>
   <strong style={{fontSize:15}}>Review your training baseline</strong>
   <p style={{fontSize:12,lineHeight:1.4,margin:'4px 0 8px'}}>
     Has your training changed? Preview an updated programme. Your current calendar stays unchanged until you confirm; larger increases require coach approval.
   </p>
   {latestDecision?.status==='approved_and_applied'&&<div role="status" style={{
     background:'#eaf6ef',border:'1px solid #a9cfb9',borderRadius:10,padding:12,margin:'10px 0',fontSize:13}}>
     <strong>Coach-approved programme now active.</strong> {latestDecision.active_sessions||0} future sessions were saved automatically.
     Refresh the calendar if necessary to view the updated training.
   </div>}
   {latestDecision?.status==='declined'&&<div role="status" style={{
     background:'#fff4e6',border:'1px solid #d6b486',borderRadius:10,padding:12,margin:'10px 0',fontSize:13}}>
     Your coach declined the latest proposed revision. Your existing calendar is unchanged.
     {latestDecision.coach_note&&<p>Coach feedback: {latestDecision.coach_note}</p>}
   </div>}
   {!open?<button type="button" onClick={()=>setOpen(true)}
      style={{padding:'10px 14px',borderRadius:10}}>Reassess my programme</button>:<div style={{display:'grid',gap:12}}>
     <label>Current endurance training background
       <select value={inputs.training_background} onChange={e=>edit({training_background:e.target.value})}>
         <option value="unknown">Choose your background</option>
         <option value="novice">New to regular endurance training</option>
         <option value="regular">Regular endurance athlete</option>
         <option value="established">Established endurance athlete</option>
       </select>
     </label>
     <label>Consistent training recently
       <select value={inputs.training_consistency} onChange={e=>edit({training_consistency:e.target.value})}>
         <option value="unknown">Choose your consistency</option>
         <option value="under4">Fewer than 4 weeks</option>
         <option value="4to7">4–7 weeks</option>
         <option value="8plus">8+ weeks</option>
       </select>
     </label>
     <label>Actual weekly training completed recently (hours)
       <input type="number" inputMode="decimal" step="0.5" min="0" max="25"
         placeholder="Leave blank if unknown" value={recentInput}
         onChange={e=>{setRecentInput(e.target.value);setPreview(null);setPreviewInputs(null);}}/>
     </label>
     <label>Hours available each week
       <input type="number" inputMode="decimal" step="0.5" min="2" max="25"
        value={inputs.weekly_hours} onChange={e=>edit({weekly_hours:Number(e.target.value)})}/>
     </label>
     <fieldset style={{border:'1px solid #c7dbe8',borderRadius:10,padding:10}}>
       <legend>Days available</legend>
       <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
         {names.map((name,day)=><label key={name} style={{display:'flex',gap:4,alignItems:'center'}}>
           <input type="checkbox" checked={inputs.training_days.includes(day)}
             onChange={e=>edit({training_days:e.target.checked?
               [...inputs.training_days,day].sort():inputs.training_days.filter(d=>d!==day)})}/>{name}
         </label>)}
       </div>
     </fieldset>
     <label style={{display:'flex',gap:8,alignItems:'flex-start'}}>
       <input type="checkbox" checked={inputs.can_swim_200m}
         onChange={e=>edit({can_swim_200m:e.target.checked})}/>
       I can swim 200 metres comfortably and safely with access to a suitable pool
     </label>
     <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
       <button type="button" disabled={loading} onClick={()=>void makePreview()}>
         {loading?'Checking…':'Preview next two weeks'}
       </button>
       <button type="button" disabled={loading} onClick={()=>{setOpen(false);setPreview(null);}}>Cancel</button>
     </div>
     {preview&&<div style={{borderTop:'1px solid #c7dbe8',paddingTop:12}}>
       <strong>Preview · {preview.training_tier.replaceAll('_',' ')}</strong>
       <p style={{fontSize:13,margin:'7px 0'}}>
         Max {minutes(preview.week_cap_minutes)}/week · {minutes(preview.total_minutes)}
         {' '}across the two weeks · {preview.sessions.length} sessions.
         Based on athlete-reported history, not verified device load.
       </p>
       <div style={{display:'flex',gap:10,flexWrap:'wrap',fontSize:12,margin:'8px 0 14px'}}>
         <span>Current highest planned week: {minutes(preview.existing_peak_week_minutes||0)}</span>
         <span>Proposed maximum: {minutes(preview.week_cap_minutes)}/week</span>
       </div>
       <p style={{fontSize:12,lineHeight:1.5}}>
         Coach-approved low-intensity library workouts are identified below.
         Other sessions use conservative RPE instructions. Tempo, threshold,
         and hard intervals remain outside this automatic reassessment.
       </p>
       {Object.entries(daysPerWeek).map(([week,sessions])=>
         <section key={week} aria-label={'Week of '+week} style={{margin:'16px 0'}}>
           <strong style={{display:'block',marginBottom:10,fontSize:15}}>
             Week of {new Date(week+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})}
             {' · '}{minutes(sessions.reduce((n,s)=>n+s.duration_min,0))}
           </strong>
           <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,185px),1fr))',gap:9}}>
             {Array.from({length:7},(_,index)=>{
               const date=new Date(week+'T12:00:00Z');
               date.setUTCDate(date.getUTCDate()+index);
               const key=date.toISOString().slice(0,10);
               const daySessions=sessions.filter(session=>session.date===key);
               const sport=daySessions[0]?.sport;
               const accent=sport==='bike'?'#1576b6':sport==='run'?'#c88419':sport==='swim'?'#008f9d':'#9eb4c5';
               return <article key={key} style={{
                 border:'1px solid #cadbe7',borderLeft:'4px solid '+accent,
                 borderRadius:12,padding:11,minHeight:92,
                 background:daySessions.length?'#fff':'#eaf1f5'
               }}>
                 <strong style={{display:'block',fontSize:12,color:'#31536a'}}>
                   {names[index]} {date.getUTCDate()} {date.toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'})}
                 </strong>
                 {daySessions.length?daySessions.map((session,i)=><div key={i}>
                   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,margin:'7px 0'}}>
                     <span style={{fontSize:11,fontWeight:800,color:accent}}>{session.sport.toUpperCase()}</span>
                     <strong style={{fontSize:13}}>{minutes(session.duration_min)}</strong>
                   </div>
                   <strong style={{display:'block',fontSize:13,lineHeight:1.35}}>{session.title}</strong>
                   <small style={{display:'block',marginTop:6,fontSize:11,color:'#526b7f'}}>
                     {session.selection_source==='approved_coach_library'?'Approved AZUR workout':'RPE-based foundation'}
                   </small>
                   {session.selection_reason&&<small style={{display:'block',fontSize:11,color:'#526b7f',marginTop:4}}>
                     {session.selection_reason}
                   </small>}
                 </div>):<span style={{display:'block',marginTop:10,fontSize:12,color:'#64788a'}}>Rest / no planned session</span>}
               </article>;
             })}
           </div>
         </section>)}
       {preview.status==='coach_review_required'&&<p role="status" style={{color:'#784317',fontWeight:600}}>
         Coach review required: {preview.reason}. Your existing calendar has not changed.
       </p>}
       {reviewNote&&<p style={{fontSize:13}}>Coach note: {reviewNote}</p>}
       {preview.status==='coach_review_required' && reviewStatus==='none'
         && preview.reason?.startsWith('Material increase beyond 20%') &&
         <button type="button" disabled={loading} onClick={()=>void requestCoachReview()}>
           {loading?'Submitting…':'Request review from my coach'}
         </button>}
       {reviewSubmissionMessage&&<div role="alert" style={{
         margin:'12px 0',padding:12,border:'1px solid #d3a259',borderRadius:10,
         background:'#fff7e7',color:'#5b3b15',fontSize:13,fontWeight:650,lineHeight:1.5
       }}>
         {reviewSubmissionMessage}
         {reviewNeedsAssignment&&<div style={{marginTop:7,fontWeight:500}}>
           The programme stays in preview; this account has no coach approval request in the queue.
         </div>}
       </div>}
       {reviewStatus==='pending'&&<p role="status" style={{fontSize:13,fontWeight:600}}>
         Waiting for your assigned coach to review this exact programme.
         Preview again to refresh the decision.
       </p>}
       {reviewStatus==='rejected'&&<p role="status" style={{fontSize:13,fontWeight:600}}>
         Your coach has declined this version. Revise your training baseline or contact your coach.
       </p>}
       {reviewStatus==='approved'&&<p role="status" style={{fontSize:13,fontWeight:650}}>
         Your coach approved this proposal. AZUR applies approvals automatically.
         Refresh Calendar to see the resulting programme; do not confirm a second time.
       </p>}
       {preview.status==='ready_for_confirmation'&&<>
         <p style={{fontSize:12}}>
           Routine change: 
           Only future, uncompleted and unlocked starter sessions will be replaced.
           This week's sessions and coach-created workouts remain protected.
         </p>
         <button type="button" disabled={loading} onClick={()=>void confirm()}>
           {loading?'Applying…':'Confirm routine update'}
         </button>
       </>}
     </div>}
   </div>}
   {message&&<p role="status" style={{fontSize:13,marginTop:10}}>{message}</p>}
 </section>;
}
