import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {supabase} from '../lib/supabase';

type Review={questionnaireApproval?:{approved:boolean;approvedWeeklyHours:number|null};questionnaireDraftPreview?:{status:string;reasons:string[];sessionCount:number;sessions:Array<{date:string;sport:string;title:string;durationMin:number;reason:string}>;readOnly:boolean}|null;questionnaireReview?:{eligibleForCoachAssessment:boolean;source:string;historyRequired:boolean;requestedWeeklyHours:number|null;recentWeeklyHours:number|null;trainingConcern:string;swimReadiness:boolean|null;coachApprovalRequired:boolean;canPublish:boolean};preflight?:{draftId:string|null;revision:number|null;proposedSessions:number;proposedHours:number;readyForFullPublication:boolean;blockers:string[];readOnly:boolean};weekStart:string;phase:string|null;storedTargetHours:number|null;approvedCapacityHours:number|null;scheduledHours:number;activityCount:number;sessionCount:number;blockers:string[];sessions:Array<{id:string;planned_date:string;sport:string;title:string;duration_min:number;status:string}>;message:string};
type Athlete={id:string;display_name:string};
function monday(offset:number){const d=new Date();const weekday=(d.getDay()+6)%7;d.setDate(d.getDate()-weekday+offset*7);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export default function CoachBaselinePlanReview(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [selected,setSelected]=useState('');
 const [offset,setOffset]=useState(1);
 const [review,setReview]=useState<Review|null>(null);
 const [busy,setBusy]=useState(false);
 const [approvalHours,setApprovalHours]=useState('3');
 const [draftDecision,setDraftDecision]=useState<string|null>(null);
 const [drafts,setDrafts]=useState<Array<{id:string;week_start:string;revision:number;phase:string;sessions:unknown;created_at:string}>>([]);
 const [error,setError]=useState('');
 const [setup,setSetup]=useState<{onboarding_step:number;weekly_hours:number|null;updated_at:string;race_distance:string|null;device:string|null}|null>(null);
 const [baseline,setBaseline]=useState<{source:string;validation_status:string;activity_count:number;excluded_count:number;window_start:string;window_end:string;sport_summary:Record<string,{count?:number;minutes?:number}>}|null>(null);
 const requestId=useRef(0);
 useEffect(()=>{let live=true;void(async()=>{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user||user.app_metadata?.role!=='coach'){if(live)setError('Verified coach login required');return}
  const {data:assign,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
  if(ae){if(live)setError(ae.message);return}
  const ids=(assign||[]).map(a=>a.athlete_id);
  if(!ids.length)return;
  const {data,error:pe}=await supabase.from('athlete_profile').select('id,display_name').in('id',ids);
  if(!live)return;
  if(pe){setError(pe.message);return}
  const next=data||[];setAthletes(next);setSelected(next[0]?.id||'');
 })();return()=>{live=false}},[]);
 useEffect(()=>{if(selected)void inspect();},[selected,offset]);
 async function approveSavedDraft(){
  if(!selected||drafts.length!==1||draftDecision)return;
  setBusy(true);setError('');
  try{
   const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error('Coach sign-in required');
   const response=await fetch('/api/coach/weekly-plan-review?'+new URLSearchParams({athleteId:selected,weekStart:monday(offset)}),{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'approve_questionnaire_draft'})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Could not approve proposal');
   await inspect();
  }catch(e){setError(e instanceof Error?e.message:'Approval failed');setBusy(false)}
 }
 async function saveQuestionnaireDraft(){
  if(!selected||!review||review.questionnaireDraftPreview?.status!=='ready_for_coach_review'||drafts.length)return;
  setBusy(true);setError('');
  try{
   const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error('Coach sign-in required');
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);let response:Response;try{response=await fetch('/api/coach/weekly-plan-review?'+new URLSearchParams({athleteId:selected,weekStart:monday(offset)}),{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'save_questionnaire_draft'}),signal:controller.signal});}finally{clearTimeout(timeout)}
   const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save draft');
   await inspect();
  }catch(e){setError(e instanceof Error?(e.name==='AbortError'?'Saving timed out. No confirmation received; refresh before trying again.':e.message):'Could not save draft');setBusy(false)}
 }
 async function approveQuestionnaire(){
  if(!selected||!setup?.updated_at||!review?.questionnaireReview?.eligibleForCoachAssessment)return;
  const hours=Number(approvalHours);
  const ceiling=Math.min(Number(setup.weekly_hours||0),review.questionnaireReview.recentWeeklyHours!=null&&review.questionnaireReview.recentWeeklyHours>0?review.questionnaireReview.recentWeeklyHours*1.1:6,review.questionnaireReview.trainingConcern==='none'?6:0);
  if(!Number.isFinite(hours)||hours<=0||hours>ceiling){setError('Starting hours must be between 0.5 and '+Math.max(0,ceiling).toFixed(1)+' hours for this questionnaire-only review.');return;}
  setBusy(true);setError('');
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user||user.app_metadata?.role!=='coach')throw Error('Verified coach required');
   const {error:e}=await supabase.from('coach_questionnaire_baseline_approval').upsert({athlete_id:selected,coach_user_id:user.id,approved_weekly_hours:hours,questionnaire_updated_at:setup.updated_at,reviewed_at:new Date().toISOString()},{onConflict:'athlete_id,coach_user_id'});
   if(e)throw Error(e.message);
   await inspect();
  }catch(e){setError(e instanceof Error?e.message:'Approval could not be saved');setBusy(false)}
 }
 async function inspect(){
  if(!selected)return;
  const currentRequest=++requestId.current;
  setBusy(true);setError('');setReview(null);setDrafts([]);setDraftDecision(null);setBaseline(null);setSetup(null);
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw Error('Sign in to review athlete plans');
   const params=new URLSearchParams({athleteId:selected,weekStart:monday(offset)});
   const response=await fetch('/api/coach/weekly-plan-review?'+params.toString(),{headers:{Authorization:'Bearer '+session.access_token}});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Review unavailable');
   if(currentRequest!==requestId.current)return;
   setReview(result);
   const {data:draftRows,error:draftError}=await supabase.from('weekly_plan_draft').select('id,week_start,revision,phase,sessions,created_at').eq('athlete_id',selected).eq('week_start',monday(offset)).order('revision',{ascending:false}).limit(3);
   if(draftError)throw Error('Calendar review loaded, but saved drafts could not be inspected: '+draftError.message);
   if(currentRequest===requestId.current)setDrafts(draftRows||[]);
   if(draftRows?.[0]){const {data:decisions,error:de}=await supabase.from('weekly_plan_decision').select('decision').eq('draft_id',draftRows[0].id).order('decided_at',{ascending:false}).limit(1);if(de)throw Error('Draft approval status unavailable: '+de.message);if(currentRequest===requestId.current)setDraftDecision(decisions?.[0]?.decision||null)}
   const {data:history,error:historyError}=await supabase.from('athlete_history_baseline').select('source,validation_status,activity_count,excluded_count,window_start,window_end,sport_summary').eq('athlete_id',selected).order('window_end',{ascending:false}).limit(1).maybeSingle();
   if(historyError)throw Error('Historical baseline could not be inspected: '+historyError.message);
   if(currentRequest===requestId.current)setBaseline(history||null);
   const {data:profile,error:profileError}=await supabase.from('athlete_profile').select('user_id').eq('id',selected).maybeSingle();
   if(profileError)throw Error('Athlete ownership lookup unavailable: '+profileError.message);
   if(!profile?.user_id)throw Error('Assigned athlete profile missing');
   const {data:setupRow,error:setupError}=await supabase.from('athlete_onboarding').select('onboarding_step,weekly_hours,updated_at,race_distance,device').eq('user_id',profile.user_id).maybeSingle();
   if(setupError)throw Error('Athlete onboarding review unavailable: '+setupError.message);
   if(currentRequest===requestId.current)setSetup(setupRow||null);
  }catch(e){if(currentRequest===requestId.current)setError(e instanceof Error?e.message:'Review unavailable')}finally{if(currentRequest===requestId.current)setBusy(false)}
 }
 const athlete=athletes.find(a=>a.id===selected);
 const approved=Boolean(review?.questionnaireApproval?.approved);
 const preview=review?.questionnaireDraftPreview;
 const canSave=approved&&preview?.status==='ready_for_coach_review'&&drafts.length===0&&!review?.blockers?.some(b=>/locked|existing sessions/i.test(b));
 const canApprove=approved&&drafts.length===1&&draftDecision===null;
 const stage=!setup||setup.onboarding_step!==5?'setup':!approved?'baseline':drafts.length===0?'draft':draftDecision!=='approved'?'approve':'complete';
 const maxStartingHours=Math.max(0,Math.min(Number(setup?.weekly_hours||0),review?.questionnaireReview?.recentWeeklyHours!=null&&review.questionnaireReview.recentWeeklyHours>0?review.questionnaireReview.recentWeeklyHours*1.1:6,review?.questionnaireReview?.trainingConcern==='none'?6:0));
 const enteredHours=Number(approvalHours);
 const hoursValid=Number.isFinite(enteredHours)&&enteredHours>=0.5&&enteredHours<=maxStartingHours;
 const card:CSSProperties={background:'#102b40',border:'1px solid #31536d',borderRadius:16,padding:16};
 const primary:CSSProperties={background:'#148ec9',color:'#fff',border:0,borderRadius:12,padding:'13px 18px',fontWeight:700,width:'100%',cursor:'pointer'};
 return <section className="coach-attention-group" aria-label="Coach athlete review" style={{padding:'12px 12px 90px',maxWidth:900,margin:'auto'}}>
  <header style={{marginBottom:16}}><h3 style={{margin:'0 0 4px'}}>Athlete review</h3><p style={{margin:0,opacity:.75}}>One athlete. One decision at a time.</p></header>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:14}}>
   <label style={{display:'grid',gap:5,fontSize:13}}>Athlete<select value={selected} onChange={e=>setSelected(e.target.value)}>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}</select></label>
   <label style={{display:'grid',gap:5,fontSize:13}}>Training week<select value={offset} onChange={e=>setOffset(Number(e.target.value))}><option value={0}>This week</option><option value={1}>Next week</option><option value={2}>Following week</option></select></label>
  </div>
  {error&&<p role="alert" style={{padding:12,border:'1px solid #b86b6b',borderRadius:10}}>{error}</p>}
  {busy&&!review&&<p role="status">Loading athlete review…</p>}
  {review&&<div style={{display:'grid',gap:14}}>
   <section style={card}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
     <div><h4 style={{margin:'0 0 4px',fontSize:21}}>{athlete?.display_name||'Athlete'}</h4><span style={{opacity:.8,fontSize:13}}>{setup?.race_distance||'Training'} · Week of {review.weekStart}</span></div>
     <span style={{fontSize:12,padding:'5px 10px',borderRadius:20,background:stage==='complete'?'#164c48':'#244359',color:'#e4f7ff'}}>{stage==='complete'?'Plan approved · awaiting publication':stage==='setup'?'Setup incomplete':stage==='baseline'?'Needs starting-load review':stage==='draft'?'Ready to build a week':'Week needs approval'}</span>
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}>
     <span style={{padding:'8px 10px',borderRadius:9,background:'#1b3c53',fontSize:13}}>{setup?.weekly_hours??'—'}h available</span>
     <span style={{padding:'8px 10px',borderRadius:9,background:'#1b3c53',fontSize:13}}>{review.questionnaireReview?.recentWeeklyHours??'—'}h reported recently</span>
     <span style={{padding:'8px 10px',borderRadius:9,background:'#1b3c53',fontSize:13}}>{baseline?.validation_status==='validated'?'History validated':'No validated history'}</span>
    </div>
   </section>
   <section style={card} aria-label="Next coaching action">
    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,fontSize:12,opacity:.85}}><span>1 · Starting load</span><span>›</span><span>2 · Training week</span><span>›</span><span>3 · Publish</span></div>
    {stage==='setup'?<><h4>Awaiting athlete setup</h4><p>The athlete must finish onboarding before you can approve their starting training load.</p></>:null}
    {stage==='baseline'&&<><h4 style={{margin:'0 0 8px'}}>Approve a safe starting load</h4><p style={{margin:'0 0 14px',fontSize:14,opacity:.85}}>Reported training is not verified activity history. Start conservatively and adjust once you have evidence.</p>
     {review.questionnaireReview?.eligibleForCoachAssessment?<><label style={{display:'grid',gap:6,maxWidth:240,marginBottom:12}}>Starting hours per week<input type="number" min="0.5" max={maxStartingHours} step="0.5" value={approvalHours} aria-invalid={!hoursValid} aria-describedby="starting-load-help" onChange={e=>{setApprovalHours(e.target.value);setError('')}} /></label><p id="starting-load-help" style={{fontSize:13,margin:'0 0 12px',color:hoursValid?'#b5d4e8':'#ffc49c'}}>Allowed range: 0.5–{maxStartingHours.toFixed(1)} hours. {hoursValid?'This is a conservative initial cap, not Claire’s full training potential.':'Enter a value within this range to continue.'}</p><button type="button" style={primary} disabled={busy||!hoursValid} onClick={()=>void approveQuestionnaire()}>{busy?'Saving…':'Approve starting load'}</button></>:<p>Questionnaire requires further assessment before approval.</p>}</>}
    {stage==='draft'&&<><h4 style={{margin:'0 0 8px'}}>Build the first training week</h4><p style={{fontSize:14,opacity:.85}}>Starting load approved: {review.questionnaireApproval?.approvedWeeklyHours??'—'}h. Review the proposed sessions below before saving.</p>
     {preview?.sessions?.length?<div style={{display:'grid',gap:8,marginBottom:14}}>{preview.sessions.map((x,i)=><div key={i} style={{borderBottom:'1px solid #31536d',padding:'7px 0'}}><strong>{x.sport.toUpperCase()} · {x.durationMin} min</strong><div style={{fontSize:13,opacity:.85}}>{x.date} · {x.title}</div></div>)}</div>:null}
     {canSave&&review?.storedTargetHours==null?<p role="status">The training-week record will be prepared automatically when you save this proposal.</p>:null}
     {canSave?<button type="button" style={primary} disabled={busy} onClick={()=>void saveQuestionnaireDraft()}>{busy?'Saving…':'Save training week for review'}</button>:<p role="status">{preview?.reasons?.join(' · ')||'No suitable draft available yet.'}</p>}</>}
    {stage==='approve'&&<><h4 style={{margin:'0 0 8px'}}>Approve the training week</h4><p style={{fontSize:14,opacity:.85}}>The proposal is saved, but no workouts have been sent to the athlete.</p>
     {drafts[0]&&Array.isArray(drafts[0].sessions)&&<div style={{marginBottom:12,fontSize:14}}>{drafts[0].sessions.length} sessions in this draft</div>}
     {canApprove?<button type="button" style={primary} disabled={busy} onClick={()=>void approveSavedDraft()}>{busy?'Approving…':'Approve training week'}</button>:<p>Approval unavailable. See safety details below.</p>}</>}
    {stage==='complete'&&<><h4 style={{margin:'0 0 8px'}}>Training week approved</h4><p style={{fontSize:14,opacity:.85}}>The coach has approved this proposal. Publication is still gated for testing, so the athlete calendar has not been updated by this action.</p></>}
   </section>
   <details style={{...card,padding:14}}><summary style={{cursor:'pointer',fontWeight:700}}>Athlete profile and training evidence</summary>
    <div style={{paddingTop:12,fontSize:14}}><p>Onboarding: {setup?.onboarding_step===5?'Complete':'Incomplete'} · Availability: {setup?.weekly_hours??'—'}h · Reported recent training: {review.questionnaireReview?.recentWeeklyHours??'—'}h</p><p>Training concern: {review.questionnaireReview?.trainingConcern??'Not supplied'} · Device: {setup?.device||'Not connected'}</p><p>Historical data: {baseline?baseline.activity_count+' activities · '+baseline.validation_status:'No validated baseline'}</p></div>
   </details>
   <details style={{...card,padding:14}}><summary style={{cursor:'pointer',fontWeight:700}}>Advanced safety checks</summary>
    <div style={{paddingTop:12,fontSize:13}}><p>Target: {review.storedTargetHours??'Not set'}h · Scheduled: {review.scheduledHours.toFixed(2)}h · {review.sessionCount} sessions · Phase: {review.phase||'Not set'}</p>
     {review.blockers.map((x,i)=><p key={i}>• {x}</p>)}{review.preflight?.blockers.map((x,i)=><p key={'p'+i}>• {x}</p>)}{preview?.reasons.map((x,i)=><p key={'r'+i}>• {x}</p>)}
     <p>{review.message}</p><button type="button" disabled={busy} onClick={()=>void inspect()}>Refresh checks</button>
    </div>
   </details>
  </div>}
 </section>;
}
