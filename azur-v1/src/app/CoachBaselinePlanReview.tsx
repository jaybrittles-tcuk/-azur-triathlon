import {useEffect,useRef,useState} from 'react';
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
   const response=await fetch('/api/coach/weekly-plan-review?'+new URLSearchParams({athleteId:selected,weekStart:monday(offset)}),{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'save_questionnaire_draft'})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save draft');
   await inspect();
  }catch(e){setError(e instanceof Error?e.message:'Could not save draft');setBusy(false)}
 }
 async function approveQuestionnaire(){
  if(!selected||!setup?.updated_at||!review?.questionnaireReview?.eligibleForCoachAssessment)return;
  const hours=Number(approvalHours);
  const ceiling=Math.min(Number(setup.weekly_hours||0),review.questionnaireReview.recentWeeklyHours!=null&&review.questionnaireReview.recentWeeklyHours>0?review.questionnaireReview.recentWeeklyHours*1.1:6,review.questionnaireReview.trainingConcern==='none'?6:0);
  if(!Number.isFinite(hours)||hours<=0||hours>ceiling){setError('Choose a positive starting volume no higher than availability, recent reported volume or the conservative safety cap. Training concerns require individual assessment.');return;}
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
 return <section className="coach-attention-group" aria-label="Validated baseline weekly plan review" style={{padding:'16px 14px',paddingBottom:96}}>
  <header className="coach-attention-heading"><div><h3>History-informed weekly review</h3><p>Automatic capacity, calendar and safety checks. Read-only.</p></div></header>
  <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'end'}}>
   <label>Athlete<select value={selected} onChange={e=>{setSelected(e.target.value);setReview(null)}}>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}</select></label>
   <label>Week<select value={offset} onChange={e=>{setOffset(Number(e.target.value));setReview(null)}}><option value={0}>Current week</option><option value={1}>Next week</option><option value={2}>Following week</option></select></label>
   <button type="button" disabled={!selected||busy} onClick={()=>void inspect()}>{busy?'Checking…':'Refresh review'}</button>
  </div>
  {error&&<p role="alert">{error}</p>}
  {review&&<div style={{marginTop:16}}>
   <strong>{review.weekStart} · {review.phase||'No phase set'}</strong>
   <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,margin:'12px 0'}}>{[['Approved capacity',review.approvedCapacityHours==null?'Pending':review.approvedCapacityHours.toFixed(1)+' h'],['Weekly target',review.storedTargetHours==null?'Not set':review.storedTargetHours.toFixed(2)+' h'],['Calendar',review.scheduledHours.toFixed(2)+' h · '+review.sessionCount+' sessions'],['History',review.activityCount+' activities']].map(([label,value])=><div key={label} style={{background:'rgba(10,31,49,.5)',border:'1px solid rgba(120,177,212,.18)',borderRadius:12,padding:'10px 12px',minWidth:0}}><small style={{display:'block',opacity:.75,marginBottom:4}}>{label}</small><strong style={{fontSize:16}}>{value}</strong></div>)}</div>
   <section aria-label="First week readiness" style={{border:'1px solid rgba(120,177,212,.24)',borderRadius:12,padding:12,margin:'12px 0'}}><strong>First-week readiness</strong><div style={{display:'grid',gap:6,marginTop:8}}><span>{setup?.onboarding_step===5?'✓ Athlete onboarding completed':'• Athlete onboarding incomplete or missing'}</span><span>{setup?.device?'✓ Device selected: '+setup.device:'• Device selection missing'}</span><span>{baseline?.validation_status==='validated'?'✓ Saved training history validated':'• Saved training history awaiting validation'}</span><span>{review.approvedCapacityHours!=null?'✓ Starting capacity approved: '+review.approvedCapacityHours+' h':'• Starting capacity awaiting coach approval'}</span><span>{drafts.length>0?'✓ Weekly proposal saved for review':'• Weekly proposal not generated'}</span></div><p style={{fontSize:12,opacity:.8}}>Read-only readiness indicators. No workouts are published by this screen.</p></section>
   {review.questionnaireReview&&<section aria-label="Questionnaire baseline pathway" style={{border:"1px solid rgba(120,177,212,.24)",borderRadius:12,padding:12,margin:"12px 0"}}><strong>No-device athlete pathway</strong><p>{review.questionnaireReview.eligibleForCoachAssessment?"Completed athlete questionnaire available for coach assessment. Device history is not required.":"Athlete questionnaire is not yet complete enough for baseline assessment."}</p>{review.questionnaireReview.eligibleForCoachAssessment&&<p>Available: {review.questionnaireReview.requestedWeeklyHours} h/week · Recently trained: {review.questionnaireReview.recentWeeklyHours??"not supplied"} h/week · Concern: {review.questionnaireReview.trainingConcern}. These are athlete-reported values, not validated training load.</p>}{review.questionnaireReview.eligibleForCoachAssessment&&<div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'end',margin:'12px 0'}}><label>Approved starting hours<input type='number' min='0.5' max='6' step='0.5' value={approvalHours} onChange={e=>setApprovalHours(e.target.value)} style={{display:'block',width:110}} /></label><button type='button' disabled={busy||review.questionnaireApproval?.approved} onClick={()=>void approveQuestionnaire()}>{review.questionnaireApproval?.approved?'Baseline approved':'Approve baseline'}</button></div>}<small>Coach approval is required. This preview cannot generate or publish a plan.</small></section>}
   {review.questionnaireDraftPreview&&<details style={{border:'1px solid rgba(120,177,212,.24)',borderRadius:12,padding:12,margin:'12px 0'}}><summary style={{fontWeight:700,cursor:'pointer'}}>Introductory draft safety · {review.questionnaireDraftPreview.status==='blocked'?'Awaiting approval':'Ready for coach review'}</summary><p>Questionnaire-only · {review.questionnaireDraftPreview.sessionCount} selected workouts · read-only</p>{review.questionnaireDraftPreview.reasons.map((reason,i)=><p key={i} style={{fontSize:13}}>• {reason}</p>)}{review.questionnaireDraftPreview.sessions.map((session,i)=><div key={i} style={{padding:'9px 0',borderBottom:'1px solid #31536d'}}><strong>{session.date} · {session.sport} · {session.durationMin} min</strong><p style={{margin:'3px 0',fontSize:13}}>{session.title}</p><small>{session.reason}</small></div>)}{review.questionnaireDraftPreview.status==='ready_for_coach_review'&&drafts.length===0&&<button type='button' disabled={busy} onClick={()=>void saveQuestionnaireDraft()} style={{display:'block',margin:'12px 0'}}>Save introductory week for coach review</button>}<small>{drafts.length?'Saved proposal exists; no workouts have been delivered.':'Preview only. No workouts have been delivered to the athlete.'}</small></details>}
   <section aria-label="Historical baseline evidence" style={{border:'1px solid rgba(120,177,212,.24)',borderRadius:12,padding:12,margin:'12px 0'}}><strong>Training history evidence</strong>{!baseline?<p>No saved multisport baseline. Athlete device preview alone does not establish an approved starting capacity.</p>:<><p>{baseline.activity_count} activities · {baseline.excluded_count} excluded · {baseline.window_start} to {baseline.window_end}</p><p>Source: {baseline.source} · {baseline.validation_status==='validated'?'Validated historical summary':'Coach validation required'}</p><div style={{display:'flex',gap:12,flexWrap:'wrap'}}>{(['swim','bike','run'] as const).map(sport=><span key={sport} style={{fontSize:13,textTransform:'capitalize'}}>{sport}: {baseline.sport_summary?.[sport]?.count??0} activities · {Math.round((baseline.sport_summary?.[sport]?.minutes??0)/60)} h</span>)}</div></>}</section>
   {review.blockers.length>0&&<div role="status"><strong>Publication blockers</strong>{review.blockers.map((b,i)=><p key={i}>{b}</p>)}</div>}
   {review.preflight&&<details style={{marginTop:12,padding:'12px',border:'1px solid rgba(120,177,212,.24)',borderRadius:12}}><summary style={{cursor:'pointer',fontWeight:700}}>Publication safety check · {review.preflight.readyForFullPublication?'Draft passes checks':'Not ready'}</summary><div style={{paddingTop:10,fontSize:13}}><p>Read-only assessment · {review.preflight.proposedSessions} proposed sessions · {review.preflight.proposedHours.toFixed(2)} hours</p>{review.preflight.blockers.length>0?<ul>{review.preflight.blockers.map((reason,i)=><li key={i}>{reason}</li>)}</ul>:<p>Preliminary checks passed. Publication is still disabled until the authenticated end-to-end test is complete.</p>}<p>No calendar changes are made by this check.</p></div></details>}
   <details style={{marginTop:12}}><summary style={{cursor:'pointer',padding:'10px 0',fontWeight:700}}>View {review.sessionCount} planned sessions</summary><div style={{paddingTop:6}}>{review.sessions.map(s=><div key={s.id} style={{padding:'9px 0',borderBottom:'1px solid #31536d'}}><strong>{s.planned_date} · {s.sport} · {s.duration_min} min</strong><div style={{opacity:.85,fontSize:13,marginTop:3}}>{s.title} · {s.status}</div></div>)}</div></details>
   <p style={{fontSize:13,opacity:.75,marginTop:12}}><strong>Read-only:</strong> {review.message}</p>
   <details style={{padding:'12px 0'}}><summary style={{cursor:'pointer',fontWeight:700}}>Saved weekly proposals ({drafts.length})</summary>{drafts.length===0?<p>No saved proposal exists for this week. Automatic generation is not connected.</p>:drafts.map(d=><details key={d.id} style={{marginTop:10}}><summary>Draft revision {d.revision} · {d.phase} · {Array.isArray(d.sessions)?d.sessions.length:0} sessions</summary><p>Draft ID: {d.id}</p><p>Created: {new Date(d.created_at).toLocaleString()}</p><p>{draftDecision==='approved'?'Approved by coach · not published':'Awaiting coach approval · not published'}</p>{draftDecision===null&&drafts.length===1&&review?.questionnaireApproval?.approved&&<button type='button' disabled={busy} onClick={()=>void approveSavedDraft()}>Approve saved introductory week</button>}</details>)}</details>
  </div>}
 </section>;
}
