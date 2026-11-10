import CoachWorkoutLibrary from './CoachWorkoutLibrary';
import CoachWeekReconciliationPreview from './CoachWeekReconciliationPreview';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
type Draft={id:string;athlete_id:string;week_start:string;revision:number;phase:string;sessions:unknown;proposal_fingerprint:string;created_at:string};
type Decision={draft_id:string;decision:string;decided_at:string};
type Row=Draft&{athleteName:string;decision:string;approvedWeeklyHours:number|null;baselineValidated:boolean};
function readiness(row:Row){
 const sessions=Array.isArray(row.sessions)?row.sessions:[];
 const problems:string[]=[];
 if(row.decision!=='approved')problems.push('Latest coach approval required');
 if(row.phase!=='foundation_no_history'&&(!row.baselineValidated||!row.approvedWeeklyHours))problems.push('Validated coach-approved historical baseline required');
 if(row.phase==='foundation_no_history'&&sessions.reduce((n:number,x:any)=>n+(Number(x?.session?.durationMin)||0),0)>240)problems.push('Introductory limit exceeded');
 const totalMinutes=sessions.reduce((sum:number,item:any)=>sum+(Number(item?.session?.durationMin)||0),0);
 if(row.approvedWeeklyHours&&totalMinutes>row.approvedWeeklyHours*60+5)problems.push('Draft exceeds coach-approved weekly hours');
 if(!sessions.length)problems.push('No proposed sessions');
 for(const item of sessions){const x=item as {date?:string;session?:{title?:string;durationMin?:number;sport?:string;prescription?:unknown;sessionClass?:string;priority?:number;targets?:unknown}};if(!x.session?.title||!x.date||!Number.isFinite(x.session.durationMin)||!x.session.sport||!x.session.prescription||!x.session.sessionClass||!x.session.priority||!x.session.targets)problems.push('Draft has incomplete workout fields');}
 return [...new Set(problems)];
}
export default function CoachWeeklyReview(){
 const [rows,setRows]=useState<Row[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState('');
 const [note,setNote]=useState('');
 const [reload,setReload]=useState(0);
 const [introAthletes,setIntroAthletes]=useState<{id:string;name:string;onboardingReady:boolean}[]>([]);
 const [introAthlete,setIntroAthlete]=useState('');
 const [introPreview,setIntroPreview]=useState<any>(null);
 const [introMessage,setIntroMessage]=useState('');
 const [publishedAthletes,setPublishedAthletes]=useState<string[]>([]);
 const [nextWeekPublished,setNextWeekPublished]=useState<string[]>([]);
 const [nextWeekPreview,setNextWeekPreview]=useState<any>(null);
 const [setupStatus,setSetupStatus]=useState<{status:string;label:string;safe_to_use_no_history_path:boolean}|null>(null);
 const [swimAssessment,setSwimAssessment]=useState<{recommended_focus:string;recommended_practice:string;execution_cue:string;why_today_matters:string;focus_source:string;css_status:string;next_evidence:string}|null>(null);
 const [coachingModel,setCoachingModel]=useState<any>(null);
 const [trainingResponse,setTrainingResponse]=useState<any>(null);
 const [adaptiveSelection,setAdaptiveSelection]=useState<any>(null);
 const [merseyBeta,setMerseyBeta]=useState(false);
 const [merseyLoading,setMerseyLoading]=useState(false);
 const [purposePreview,setPurposePreview]=useState<any>(null);
 const [autoPreviewLoading,setAutoPreviewLoading]=useState(false);
 const nextMonday=(()=>{const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)+7);return d.toISOString().slice(0,10)})();
 useEffect(()=>{let live=true;(async()=>{
  setLoading(true);setError('');
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach login required');
   const {data:assign,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
   if(ae)throw ae;
   const ids=(assign??[]).map(a=>a.athlete_id);
   if(!ids.length){if(live)setRows([]);return;}
   const weekStart=(()=>{const d=new Date();const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);return d.toISOString().slice(0,10)})();
   const weekEnd=(()=>{const d=new Date(weekStart+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+6);return d.toISOString().slice(0,10)})();
   const nextEnd=(()=>{const d=new Date(weekStart+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+13);return d.toISOString().slice(0,10)})();
   const [drafts,profiles,baselines,history,planned,onboardings]=await Promise.all([
     supabase.from('weekly_plan_draft').select('id,athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_at').in('athlete_id',ids).order('created_at',{ascending:false}).limit(150),
     supabase.from('athlete_profile').select('id,user_id,display_name').in('id',ids),
     supabase.from('coach_history_baseline_review').select('athlete_id,decision,approved_weekly_hours').in('athlete_id',ids),
     supabase.from('athlete_history_baseline').select('athlete_id,validation_status').in('athlete_id',ids),
     supabase.from('planned_session').select('athlete_id,planned_date').in('athlete_id',ids).gte('planned_date',weekStart).lte('planned_date',nextEnd).eq('is_active_version',true),
     supabase.from('athlete_onboarding').select('user_id,onboarding_step').eq('onboarding_step',4)
   ]);
   if(drafts.error||profiles.error||baselines.error||history.error||planned.error||onboardings.error)throw new Error(drafts.error?.message||profiles.error?.message||baselines.error?.message||history.error?.message||planned.error?.message||onboardings.error?.message||'Unable to load weekly drafts');
   if(live){
    setPublishedAthletes([...new Set((planned.data??[]).filter(s=>s.planned_date<=weekEnd).map(s=>s.athlete_id))]);
    setNextWeekPublished([...new Set((planned.data??[]).filter(s=>s.planned_date>weekEnd).map(s=>s.athlete_id))]);
   }
   const all=drafts.data??[];
   const decisions=all.length?await supabase.from('weekly_plan_decision').select('draft_id,decision,decided_at').in('draft_id',all.map(d=>d.id)).order('decided_at',{ascending:false}):{data:[] as Decision[],error:null};
   if(decisions.error)throw decisions.error;
   const last=new Map<string,Decision>();
   for(const d of decisions.data??[])if(!last.has(d.draft_id))last.set(d.draft_id,d);
   const names=new Map((profiles.data??[]).map(p=>[p.id,p.display_name||'Assigned athlete']));
   const approved=new Map((baselines.data??[]).map(x=>[x.athlete_id,x]));
   const statuses=new Map((history.data??[]).map(x=>[x.athlete_id,x.validation_status]));
   if(live){
    const readyUsers=new Set((onboardings.data??[]).map(o=>o.user_id));
    const candidates=(profiles.data??[]).map(p=>({id:p.id,name:p.display_name||'Assigned athlete',onboardingReady:readyUsers.has(p.user_id)}))
      .sort((a,b)=>Number(b.onboardingReady)-Number(a.onboardingReady)||a.name.localeCompare(b.name));
    setIntroAthletes(candidates);
    setIntroAthlete(old=>candidates.some(a=>a.id===old)?old:(candidates.find(a=>a.onboardingReady)?.id||candidates[0]?.id||''));
   }
   const latest=new Map<string,Draft>();
   for(const d of all){const key=d.athlete_id+':'+d.week_start;const previous=latest.get(key);if(!previous||d.revision>previous.revision)latest.set(key,d);}
   if(live)setRows([...latest.values()].map(d=>({...d,athleteName:names.get(d.athlete_id)||'Assigned athlete',decision:last.get(d.id)?.decision||'pending',approvedWeeklyHours:approved.get(d.athlete_id)?.decision==='validated'?Number(approved.get(d.athlete_id)?.approved_weekly_hours):null,baselineValidated:statuses.get(d.athlete_id)==='validated'&&approved.get(d.athlete_id)?.decision==='validated'})).sort((a,b)=>b.week_start.localeCompare(a.week_start)));
  }catch(e){if(live)setError(e instanceof Error?e.message:'Could not load weekly reviews');}
  finally{if(live)setLoading(false);}
 })();return()=>{live=false};},[reload]);
 useEffect(()=>{
  let live=true;
  setSetupStatus(null);setSwimAssessment(null);setCoachingModel(null);setTrainingResponse(null);setAdaptiveSelection(null);setNextWeekPreview(null);setPurposePreview(null);
  if(!introAthlete||loading)return()=>{live=false};
  (async()=>{
   const [{data,error},{data:swimData,error:swimError},{data:modelData,error:modelError},{data:responseData,error:responseError},{data:adaptiveData,error:adaptiveError}]=await Promise.all([
     supabase.rpc('coach_athlete_setup_status',{p_athlete_id:introAthlete}),
     supabase.rpc('coach_swim_intelligence_preview',{p_athlete_id:introAthlete}),
     supabase.rpc('coach_training_intelligence_preview',{p_athlete_id:introAthlete}),
     supabase.rpc('coach_training_response_preview',{p_athlete_id:introAthlete}),
     supabase.rpc('coach_adaptive_session_selection_v1',{p_athlete_id:introAthlete,p_primary_focus:'aerobic_development'})
   ]);
   if(!live)return;
   if(!swimError&&swimData?.status==='review_only')setSwimAssessment(swimData);
   if(!modelError&&modelData?.model_version==='coach_intelligence_v2')setCoachingModel(modelData);
   if(!responseError&&responseData?.status==='review_only')setTrainingResponse(responseData);
   if(!adaptiveError&&adaptiveData?.model_version==='adaptive_selection_v1')setAdaptiveSelection(adaptiveData);
   if(error){setError('Unable to check athlete history status: '+error.message);return;}
   const status=data as {status:string;label:string;safe_to_use_no_history_path:boolean};
   setSetupStatus(status);
   // The coach may review the proposed week immediately. No workouts or drafts are written here.
   if(status.safe_to_use_no_history_path&&publishedAthletes.includes(introAthlete)&&!nextWeekPublished.includes(introAthlete)){
    setAutoPreviewLoading(true);
    const preview=await supabase.rpc('coach_preview_intro_v2',{p_athlete_id:introAthlete,p_week_start:nextMonday});
    if(live){
      if(preview.error)setError('Next-week proposal needs attention: '+preview.error.message);
      else if(preview.data?.planner_version==='intro_v2'&&preview.data.status==='preview_only')setNextWeekPreview(preview.data);
      setAutoPreviewLoading(false);
    }
   }
  })();
  return()=>{live=false};
 },[introAthlete,loading,reload]);
 async function publish(row:Row,mode:'full'|'additive'){
  setBusy(row.id);setError('');
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error('Coach sign-in required');
   if(row.phase==='foundation_no_history'){if(readiness(row).length)throw new Error(readiness(row).join('; '));const {data,error}=await supabase.rpc('coach_publish_no_history_week',{p_draft_id:row.id,p_confirm:true});if(error)throw error;if(data?.status!=='published')throw new Error('Publication not verified');setIntroMessage('Approved sessions published to athlete calendar.');setReload(x=>x+1);return;}
   if(readiness(row).length)throw new Error(readiness(row).join('; '));
   const response=await fetch('/api/publish-week',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({draftId:row.id,mode})});
   const payload=await response.json();
   if(!response.ok)throw new Error(payload.error||'Publication declined');
   setReload(x=>x+1);
  }catch(e){setError(e instanceof Error?e.message:'Unable to publish');}
  finally{setBusy('')}
 }
 async function decide(row:Row,decision:'approved'|'rejected'){
  setError('');setBusy(row.id);
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach required');
   if(!Array.isArray(row.sessions)||!row.sessions.length)throw new Error('Cannot approve an empty weekly draft');
   if(row.phase==='foundation_no_history'){const {data,error}=await supabase.rpc('coach_decide_no_history_week',{p_draft_id:row.id,p_decision:decision,p_reason:note.trim()});if(error)throw error;if(data?.status!=='decision_recorded')throw new Error('Decision not verified');setNote('');setReload(k=>k+1);return;}
   if(decision==='approved'&&(!row.baselineValidated||!row.approvedWeeklyHours))throw new Error('Coach-approved historical baseline required before draft approval');
   if(decision==='approved'&&row.sessions.reduce((sum:number,item:any)=>sum+(Number(item?.session?.durationMin)||0),0)>row.approvedWeeklyHours!*60+5)throw new Error('Draft exceeds coach-approved weekly volume');
   const {data:latest,error:le}=await supabase.from('weekly_plan_draft').select('id,revision').eq('athlete_id',row.athlete_id).eq('week_start',row.week_start).order('revision',{ascending:false}).limit(1);
   if(le)throw le;
   if(latest?.[0]?.id!==row.id)throw new Error('This draft has been revised. Refresh before reviewing.');
   const {data:prior,error:pe}=await supabase.from('weekly_plan_decision').select('decision').eq('draft_id',row.id).order('decided_at',{ascending:false}).limit(1);
   if(pe)throw pe;
   if(prior?.[0]?.decision===decision)throw new Error('This decision is already recorded.');
   const {error}=await supabase.from('weekly_plan_decision').insert({draft_id:row.id,coach_user_id:user.id,decision,reason:note.trim()||null});
   if(error)throw error;
   setNote('');setReload(k=>k+1);
  }catch(e){setError(e instanceof Error?e.message:'Unable to record coach decision')}
  finally{setBusy('')}
 }
 async function prepareIntro(save:boolean){setBusy('intro');setError('');setIntroMessage('');try{if(!introAthlete)throw new Error('Choose an athlete');const {data,error}=await supabase.rpc('coach_prepare_no_history_week',{p_athlete_id:introAthlete,p_save:save});if(error)throw error;if(!data||(!save&&data.status!=='preview_only')||(save&&!['draft_created','already_drafted'].includes(data.status)))throw new Error('Unable to prepare an introductory week');if(save){setIntroMessage('Draft saved for coach review. Calendar unchanged.');setIntroPreview(null);setReload(x=>x+1);}else{setIntroPreview(data);setIntroMessage('Read-only preview: no calendar changes.');}}catch(e){setError(e instanceof Error?e.message:'Introductory draft failed');}finally{setBusy('');}}
 async function approveAndPublishIntro(){
  setBusy('intro-publish');setError('');setIntroMessage('');
  try{
    if(!introAthlete)throw new Error('Choose an athlete');
    const {data,error}=await supabase.rpc('coach_approve_publish_no_history_week',{p_athlete_id:introAthlete,p_confirm:true});
    if(error)throw error;
    if(data?.status!=='published'||!data?.single_action)throw new Error('Calendar publication was not confirmed');
    const {data:readback,error:readError}=await supabase.from('planned_session').select('id,duration_min').eq('athlete_id',introAthlete).gte('planned_date',data.week_start).lte('planned_date',new Date(Date.parse(data.week_start+'T12:00:00Z')+6*86400000).toISOString().slice(0,10)).eq('is_active_version',true);
    if(readError)throw readError;
    if((readback||[]).length!==Number(data.sessions)||readback!.reduce((n,x)=>n+Number(x.duration_min),0)!==Number(data.total_minutes))throw new Error('Publication completed but calendar readback does not match. Refresh calendar or contact support.');
    setIntroMessage('Published: '+data.sessions+' workouts ('+data.total_minutes+' min) are now on the athlete calendar.');
    setIntroPreview(null);setReload(x=>x+1);
  }catch(e){setError(e instanceof Error?e.message:'Approval and publication failed');}
  finally{setBusy('');}
 }
 async function previewNextWeek(){
  setBusy('next-preview');setError('');setIntroMessage('');
  try{
    if(!introAthlete)throw new Error('Choose an athlete');
    const {data,error}=await supabase.rpc('coach_preview_intro_v2',{p_athlete_id:introAthlete,p_week_start:nextMonday});
    if(error)throw error;
    if(data?.planner_version!=='intro_v2'||data?.status!=='preview_only')throw new Error('Next-week proposal unavailable');
    setNextWeekPreview(data);
    setIntroMessage('Improved week ready to review · no calendar changes.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to preview next week');}
  finally{setBusy('');}
 }
 async function approveNextWeek(){
  setBusy('next-publish');setError('');setIntroMessage('');
  try{
    if(!introAthlete)throw new Error('Choose an athlete');
    if(!nextWeekPreview||nextWeekPreview.week_start!==nextMonday)throw new Error('Review the proposed week first');
    const {data,error}=await supabase.rpc('coach_approve_publish_intro_v2_next_week',{p_athlete_id:introAthlete,p_confirm:true});
    if(error)throw error;
    if(data?.status!=='published'||data?.calendar_verified!==true||data?.week_start!==nextMonday)throw new Error('Next-week calendar publication not verified');
    const endDate=(()=>{const d=new Date(nextMonday+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+6);return d.toISOString().slice(0,10)})();
    const {data:saved,error:readError}=await supabase.from('planned_session').select('id,duration_min').eq('athlete_id',introAthlete).gte('planned_date',nextMonday).lte('planned_date',endDate).eq('is_active_version',true);
    if(readError)throw readError;
    if((saved??[]).length!==Number(data.sessions)||(saved??[]).reduce((n,x)=>n+Number(x.duration_min),0)!==Number(data.total_minutes))throw new Error('Publication succeeded but calendar readback did not match');
    setIntroMessage('Published improved week: '+data.sessions+' sessions, '+data.total_minutes+' minutes. Recovery day included.');
    setNextWeekPreview(null);setReload(x=>x+1);
  }catch(e){setError(e instanceof Error?e.message:'Next-week publication failed');}
  finally{setBusy('');}
 }
 useEffect(()=>{
  let active=true;setMerseyLoading(false);setMerseyBeta(false);
  if(!introAthlete)return()=>{active=false};
  (async()=>{
   const {data,error}=await supabase.from('athlete_beta_cohort').select('cohort_key').eq('athlete_id',introAthlete).maybeSingle();
   if(active&&!error)setMerseyBeta(data?.cohort_key==='mersey_tri');
  })().catch(()=>{});
  return()=>{active=false};
 },[introAthlete,reload]);
 async function setMerseyCohort(){
  if(!introAthlete)return;
  setMerseyLoading(true);setError('');
  try{
   const {data,error}=await supabase.rpc('coach_set_beta_cohort',{p_athlete_id:introAthlete,p_cohort:merseyBeta?null:'mersey_tri'});
   if(error)throw error;
   if(data?.status!=='updated')throw new Error('Could not verify club assignment');
   setMerseyBeta(!merseyBeta);
   setIntroMessage(merseyBeta?'Mersey Tri beta branding removed for this athlete.':'Mersey Tri beta banner enabled for this athlete.');
  }catch(e){setError(e instanceof Error?e.message:'Could not update beta club');}
  finally{setMerseyLoading(false);}
 }
 async function previewPurposeSessions(){
  setBusy('purpose-preview');setError('');setPurposePreview(null);
  try{
   if(!introAthlete||!setupStatus?.safe_to_use_no_history_path)throw new Error('Verified introductory pathway required');
   // Skip all previously published / drafted weeks, not just next week.
   const beginning=new Date(nextMonday+'T12:00:00Z');
   const end=new Date(beginning);end.setUTCDate(end.getUTCDate()+27);
   const maxDate=end.toISOString().slice(0,10);
   const [{data:planned,error:plannedError},{data:drafts,error:draftsError}]=await Promise.all([
    supabase.from('planned_session').select('planned_date').eq('athlete_id',introAthlete)
      .gte('planned_date',nextMonday).lte('planned_date',maxDate),
    supabase.from('weekly_plan_draft').select('week_start').eq('athlete_id',introAthlete)
      .gte('week_start',nextMonday).lte('week_start',maxDate),
   ]);
   if(plannedError||draftsError)throw new Error(plannedError?.message||draftsError?.message||'Could not check existing weeks');
   const occupied=new Set<string>();
   for(const item of planned??[]){
     const d=new Date(item.planned_date+'T12:00:00Z');
     d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
     occupied.add(d.toISOString().slice(0,10));
   }
   for(const item of drafts??[])occupied.add(item.week_start);
   let previewWeek='';
   for(let week=0;week<4;week++){
     const d=new Date(beginning);d.setUTCDate(d.getUTCDate()+7*week);
     const candidate=d.toISOString().slice(0,10);
     if(!occupied.has(candidate)){previewWeek=candidate;break}
   }
   if(!previewWeek)throw new Error('Upcoming four weeks already contain drafts or planned workouts');
   const {data,error}=await supabase.rpc('coach_preview_session_purpose_v3',{p_athlete_id:introAthlete,p_week_start:previewWeek});
   if(error)throw error;
   if(data?.planner_version!=='purpose_v3_preview'||data?.calendar_changed!==false||
      data?.requires_coach_approval!==true||data?.week_start!==previewWeek)
      throw new Error('Purpose-model safety verification failed');
   setPurposePreview(data);
  }catch(e){setError(e instanceof Error?e.message:'Purpose preview unavailable');}
  finally{setBusy('');}
 }
 async function approvePurposeWeek(){
  setBusy('purpose-publish');setError('');
  try{
   if(!introAthlete||!setupStatus?.safe_to_use_no_history_path||!purposePreview?.sessions)
      throw new Error('Review the full purpose-based week first');
   const {data,error}=await supabase.rpc('coach_publish_session_purpose_v3',{
      p_athlete_id:introAthlete,
      p_week_start:purposePreview.week_start,
      p_expected_sessions:purposePreview.sessions,
      p_confirm:true
   });
   if(error)throw error;
   if(data?.status!=='published'||data?.planner_version!=='purpose_v3'||
      data?.calendar_verified!==true||data?.coach_approved!==true)
      throw new Error('Calendar publication was not verified');
   const end=new Date(data.week_start+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);
   const {data:saved,error:readError}=await supabase.from('planned_session')
     .select('id,duration_min,prescription').eq('athlete_id',introAthlete)
     .gte('planned_date',data.week_start).lte('planned_date',end.toISOString().slice(0,10)).eq('is_active_version',true);
   if(readError)throw readError;
   if((saved??[]).length!==Number(data.sessions)||
      (saved??[]).reduce((n,x)=>n+Number(x.duration_min),0)!==Number(data.total_minutes)||
      !(saved??[]).every(x=>Boolean(x.prescription?.purpose?.primaryAdaptation)))
     throw new Error('Published sessions need reconciliation; calendar readback does not match');
   setIntroMessage('V3 purpose-based week published: '+data.sessions+' workouts, '+data.total_minutes+' minutes. Coach approval recorded.');
   setPurposePreview(null);setReload(x=>x+1);
  }catch(e){setError(e instanceof Error?e.message:'Purpose-based publication failed');}
  finally{setBusy('');}
 }
 const activeRow=rows.find(row=>row.athlete_id===introAthlete && row.phase==='foundation_no_history');
 const otherRows=rows.filter(row=>row.id!==activeRow?.id);
 const selectedName=introAthletes.find(a=>a.id===introAthlete)?.name||'Athlete';
 const selectedOnboardingReady=introAthletes.find(a=>a.id===introAthlete)?.onboardingReady===true;
 const total=(row:Row)=>Array.isArray(row.sessions)?row.sessions.reduce((n:number,x:any)=>n+(Number(x?.session?.durationMin)||0),0):0;
 const sessionList=(sessions:any[])=>sessions.map((item:any,i:number)=>{
  const x=item.session||item;
  return <details key={i} style={{padding:'10px 0',borderBottom:'1px solid #284b62'}}>
    <summary style={{cursor:'pointer',fontSize:14}}><strong>{String(x.title||'Workout')}</strong> <span style={{color:'#9bbbd0'}}>{Number(x.durationMin||0)} min · {String(x.sport||'').toUpperCase()}</span></summary>
    {x.prescription?.purpose?<div style={{fontSize:13,color:'#cbe7f5',lineHeight:1.5,padding:'10px 0'}}>
      <p style={{margin:'0 0 6px'}}><strong>Main development:</strong> {x.prescription.purpose.primaryAdaptation}</p>
      {x.prescription.purpose.secondaryFocus&&<p style={{margin:'0 0 6px'}}><strong>Secondary focus:</strong> {x.prescription.purpose.secondaryFocus}</p>}
      <p style={{margin:'0 0 6px'}}>{x.prescription.purpose.executionCue}</p>
      {x.prescription.workoutSummary&&<p style={{margin:'12px 0 6px',fontWeight:700,color:'#fff'}}>{x.prescription.workoutSummary}</p>}
      <details style={{marginTop:10}}><summary style={{cursor:'pointer',color:'#b4dff5'}}>Coaching evidence and what to monitor</summary>
        <p>{x.prescription.purpose.selectionReason}</p>
        <p><strong>Monitor:</strong> {x.prescription.purpose.responseToMonitor}</p>
        {x.prescription.purpose.intensityDecision&&<p><strong>Intensity decision:</strong> {String(x.prescription.purpose.intensityDecision).replaceAll('_',' ')}</p>}
        <small>Evidence: {String(x.prescription.purpose.evidenceSource).replaceAll('_',' ')} · {x.prescription.purpose.evidenceConfidence} confidence</small>
      </details>
    </div>:<p style={{fontSize:13,color:'#c8dce9',lineHeight:1.5}}>{String(x.rationale||'Controlled introductory session')}</p>}
    {Array.isArray(x.prescription?.steps)&&<details style={{fontSize:12,color:'#b7d0df',marginTop:6}} open={!x.prescription?.workoutSummary&&x.prescription.steps.length<=3}>
       <summary style={{cursor:'pointer'}}>Detailed workout steps · {x.prescription.steps.length}</summary>
       {x.prescription.steps.map((s:any,j:number)=><p key={j} style={{margin:'7px 0'}}>{s.durationMin} min · {s.target}</p>)}
    </details>}
    {Array.isArray(x.prescription?.poolSegments)&&x.prescription.poolSegments.length>0&&<details style={{fontSize:12,color:'#b7d0df',marginTop:8}}><summary>Pool distance intervals · {x.prescription.totalDistanceMeters} m</summary>
       {x.prescription.poolSegments.map((s:any,j:number)=><p key={j}>{s.repeats} × {s.distanceMeters}m · {s.target} · {s.restSeconds}s rest</p>)}
    </details>}
  </details>;
 });
 return <section className="coach-attention-v2" aria-label="Weekly plan reviews">
  <header className="coach-attention-heading"><div><h3>Prepare training week</h3><p>Select an athlete and approve their proposed week in one action.</p></div>
   <button type="button" disabled={loading||Boolean(busy)} onClick={()=>setReload(x=>x+1)}>Refresh</button></header>
  {error&&<p role="alert" style={{color:'#ffc7a6'}}>{error}</p>}
  <div style={{padding:16,borderRadius:18,background:'#102b42',border:'1px solid #31566e',display:'grid',gap:12,color:'#ecf6ff'}}>
   <label style={{fontSize:13,fontWeight:700}}>Athlete
    <select style={{display:'block',width:'100%',marginTop:6,padding:12,borderRadius:10,background:'#173c55',color:'white'}} value={introAthlete} onChange={e=>{setIntroAthlete(e.target.value);setIntroPreview(null);setNextWeekPreview(null);setPurposePreview(null);setIntroMessage('');}}>
     <option value="">Choose athlete</option>{introAthletes.map(a=><option key={a.id} value={a.id}>{a.name}{a.onboardingReady?' · Ready for review':' · Setup incomplete'}</option>)}
    </select></label>
   {introAthlete&&<div style={{fontSize:13,color:'#c4daeb'}}><strong>{selectedName}</strong> · {setupStatus?.label||'Checking training-history status…'}</div>}
   {introAthlete&&!selectedOnboardingReady&&<p role="status" style={{fontSize:13,color:'#f3cf83',margin:0}}>This athlete has not completed onboarding. Select a ready athlete above to review V3 workouts and training intelligence.</p>}
   {introAthlete&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 12px',border:'1px solid #335973',borderRadius:12}}>
     <span style={{fontSize:13}}><strong>Mersey Tri beta branding</strong><small style={{display:'block',color:'#b8d2e3',marginTop:3}}>{merseyBeta?'Enabled for athlete dashboard':'Default AZUR dashboard header'}</small></span>
     <button type="button" disabled={merseyLoading||Boolean(busy)} onClick={()=>void setMerseyCohort()} style={{borderRadius:10,minWidth:78,background:merseyBeta?'#1779b0':'#203d51',color:'white',padding:'9px 12px'}}>{merseyLoading?'Saving…':merseyBeta?'Enabled':'Enable'}</button>
   </div>}
   {trainingResponse&&<details style={{padding:'12px',border:'1px solid #376a86',borderRadius:12,background:'#153751'}}>
      <summary style={{cursor:'pointer',fontWeight:800}}>Training Response · {trainingResponse.response_category==='insufficient_completed_evidence'?'Gather athlete feedback':'Coach evidence review'}</summary>
      <div style={{fontSize:13,paddingTop:10,display:'grid',gap:8}}>
       <p><strong>Recent 28 days:</strong> {trainingResponse.calendar_completed_sessions} calendar completions · {trainingResponse.recorded_activities_not_rejected} recorded activities · {trainingResponse.rpe_feedback_count} effort ratings</p>
       <p>{trainingResponse.coach_recommendation}</p>
       <small style={{color:'#b9d5e5'}}>Missing training records are not evidence of poor fitness. Coach approval required for major programme changes.</small>
      </div>
   </details>}
   {adaptiveSelection&&<details style={{padding:'12px',border:'1px solid #376a86',borderRadius:12,background:'#153751'}}>
     <summary style={{cursor:'pointer',fontWeight:800}}>Adaptive Session Selection · {String(adaptiveSelection.decision).replaceAll('_',' ')}</summary>
     <div style={{fontSize:13,lineHeight:1.5,paddingTop:9}}>
       <p><strong>Decision:</strong> {adaptiveSelection.decision_reason}</p>
       <p><strong>Primary focus:</strong> {String(adaptiveSelection.primary_block_focus).replaceAll('_',' ')}</p>
       <p><strong>Hard-session candidates:</strong> {adaptiveSelection.suggested_substantial_hard_sessions} · based on current available evidence, not a quota</p>
       {Array.isArray(adaptiveSelection.sport_options)&&adaptiveSelection.sport_options.map((item:any)=><details key={item.sport} style={{padding:'9px 0',borderTop:'1px solid #355d75'}}>
         <summary style={{cursor:'pointer',textTransform:'capitalize'}}><strong>{item.sport}:</strong> {item.secondary}</summary>
         <p>{item.intervalTemplate}</p><p><strong>Why:</strong> {item.adaptationRationale}</p>
         <p><strong>Needs:</strong> {item.progressionEvidence}</p>
       </details>)}
       <small style={{color:'#acd4e9'}}>Read-only coach suggestions. Never automatically published or escalated.</small>
     </div>
   </details>}
   {coachingModel&&<details style={{padding:'12px',border:'1px solid #376a86',borderRadius:12,background:'#153751'}}>
     <summary style={{cursor:'pointer',fontWeight:800}}>AZUR Coaching Intelligence · {coachingModel.primary_priority}</summary>
     <div style={{display:'grid',gap:9,paddingTop:12,fontSize:13}}>
       <p><strong>Priority:</strong> {coachingModel.priority_reason}</p>
       <p><strong>Phase emphasis:</strong> {String(coachingModel.suggested_phase_emphasis).replaceAll('_',' ')} · {coachingModel.race_days_remaining==null?'Race date not available':coachingModel.race_days_remaining+' days to race'}</p>
       <p>{coachingModel.phase_reason}</p>
       <p><strong>Confidence:</strong> {coachingModel.evidence_confidence} · {String(coachingModel.evidence_status).replaceAll('_',' ')}</p>
       <details><summary>Swim · {coachingModel.swim?.recommended_focus}</summary><p>{coachingModel.swim?.why_today_matters}</p><p>{coachingModel.swim?.recommended_practice}</p></details>
       <details><summary>Bike · {coachingModel.bike?.focus}</summary><p>{coachingModel.bike?.rationale}</p><p>Evidence needed: {coachingModel.bike?.next_evidence}</p></details>
       <details><summary>Run · {coachingModel.run?.focus}</summary><p>{coachingModel.run?.rationale}</p><p>Evidence needed: {coachingModel.run?.next_evidence}</p></details>
       <details><summary>Recovery and progression</summary><p>{coachingModel.recovery?.decision_rule}</p><p>{coachingModel.volume_guidance}</p></details>
       <p style={{color:'#f7d69b'}}>{coachingModel.review_warning}</p>
       <small style={{color:'#aec9d9'}}>Coach review only · No changes made to the athlete calendar</small>
     </div>
   </details>}
   {introAthlete&&setupStatus?.safe_to_use_no_history_path&&<details style={{padding:'12px',border:'1px solid #376a86',borderRadius:12,background:'#153751'}}>
     <summary style={{cursor:'pointer',fontWeight:700}}>Session Purpose Engine · V3 preview</summary>
     <p style={{fontSize:13,color:'#bfdaec',marginTop:10}}>See how AZUR selects each workout's purpose from the athlete's priority, phase and available evidence. Preview is read-only; publication requires your explicit approval and never overwrites existing workouts.</p>
     <button type="button" disabled={Boolean(busy)} onClick={()=>void previewPurposeSessions()}>{busy==='purpose-preview'?'Analysing purposes…':'Generate purpose-based preview'}</button>
     {purposePreview&&<div style={{marginTop:12}}>
        <strong>Week of {purposePreview.week_start} · {purposePreview.session_count} sessions · {purposePreview.total_minutes} minutes</strong>
        <p style={{fontSize:12,color:'#b6ccdc'}}>Preview only · No intensity increase · Existing calendar remains unchanged until approved</p>
        {purposePreview.purpose_engine?.under15hMixPolicy&&<details style={{border:'1px solid #3b637b',borderRadius:10,padding:'10px 12px',margin:'12px 0',fontSize:13}}>
          <summary style={{cursor:'pointer',fontWeight:700}}>Weekly intensity philosophy · Mixed zones under 15 hours</summary>
          <p style={{margin:'8px 0'}}>{purposePreview.purpose_engine.under15hMixPolicy.rationale}</p>
          <p style={{margin:'8px 0'}}><strong>Secondary stimulus:</strong> {String(purposePreview.purpose_engine.under15hMixPolicy.secondary_stimulus).replaceAll('_',' ')}</p>
          <p style={{margin:'8px 0'}}><strong>Readiness:</strong> {String(purposePreview.purpose_engine.under15hMixPolicy.readiness_status).replaceAll('_',' ')}</p>
          <p style={{fontSize:12,color:'#a5c5d8'}}>Suggested zone proportions are illustrative only, not a compulsory quota or a substitute for sport-specific thresholds and coach review.</p>
        </details>}
        {purposePreview.purpose_engine?.intervalVarietyGuide&&<details style={{border:'1px solid #3b637b',borderRadius:10,padding:'10px 12px',margin:'12px 0',fontSize:13}}>
          <summary style={{cursor:'pointer',fontWeight:700}}>Interval variety · Swim / Bike / Run progression</summary>
          <p style={{color:'#c6dfec'}}>{purposePreview.purpose_engine.intervalVarietyGuide.weekly_principle}</p>
          <p style={{color:'#f3d39e'}}>{purposePreview.purpose_engine.intervalVarietyGuide.current_selection}</p>
          {(['swim','bike','run'] as const).map(sport=><details key={sport} style={{margin:'9px 0',padding:'8px 0',borderTop:'1px solid #355c75'}}>
             <summary style={{cursor:'pointer',fontWeight:700,textTransform:'capitalize'}}>{sport} · Foundation to race-specific examples</summary>
             <p><strong>Early phase:</strong> {purposePreview.purpose_engine.intervalVarietyGuide[sport]?.foundation?.session}</p>
             <p><strong>Race-specific option:</strong> {purposePreview.purpose_engine.intervalVarietyGuide[sport]?.race_specific?.session}</p>
             <p><strong>Only when ready:</strong> {purposePreview.purpose_engine.intervalVarietyGuide[sport]?.next_evidence}</p>
          </details>)}
          <p style={{fontSize:12,color:'#b9d4e3'}}>{purposePreview.purpose_engine.intervalVarietyGuide.weekly_dose_guard}</p>
          <small style={{color:'#b9d4e3'}}>Coach guidance only · These examples are not extra scheduled workouts</small>
        </details>}
        <div>{sessionList(purposePreview.sessions||[])}</div>
        <button type="button" style={{background:'#1592ef',color:'#fff',borderRadius:12,minHeight:48,fontWeight:700,marginTop:12}} disabled={Boolean(busy)}
         onClick={()=>void approvePurposeWeek()}>{busy==='purpose-publish'?'Publishing approved V3 week…':'Approve & Publish V3 week'}</button>
     </div>}
   </details>}
   {swimAssessment&&<details style={{padding:'10px 12px',border:'1px solid #35627d',borderRadius:12,background:'#153751'}}>
     <summary style={{cursor:'pointer',fontWeight:700}}>AZUR Swim Intelligence · {swimAssessment.recommended_focus}</summary>
     <p style={{fontSize:13,margin:'10px 0'}}><strong>Recommended practice:</strong> {swimAssessment.recommended_practice}</p>
     <p style={{fontSize:13}}><strong>Execution:</strong> {swimAssessment.execution_cue}</p>
     <p style={{fontSize:13}}><strong>Why it matters:</strong> {swimAssessment.why_today_matters}</p>
     <p style={{fontSize:12,color:'#c2dbe8'}}>Focus evidence: {swimAssessment.focus_source==='athlete_self_report'?'Athlete-reported, not coach-confirmed':'Not yet assessed'} · CSS: {swimAssessment.css_status==='unknown_no_pace_prescription'?'Unknown — no CSS pace targets':'Reported, pending validation'}</p>
     <p style={{fontSize:12,color:'#c2dbe8'}}>Next: {swimAssessment.next_evidence}</p>
   </details>}
   {!activeRow&&!publishedAthletes.includes(introAthlete)&&setupStatus?.safe_to_use_no_history_path&&<button type="button" disabled={!introAthlete||Boolean(busy)} onClick={()=>void prepareIntro(false)}>Preview workouts (optional)</button>}
   {introAthlete&&(publishedAthletes.includes(introAthlete)?<p role="status" style={{color:'#a5e6cc',fontWeight:700}}>Week published · Training is on the athlete calendar</p>:setupStatus?.safe_to_use_no_history_path?<button type="button" style={{background:'#1592ef',color:'#fff',borderRadius:12,minHeight:48,fontWeight:700}} disabled={Boolean(busy)} onClick={()=>void approveAndPublishIntro()}>{busy==='intro-publish'?'Approving and publishing…':'Approve & Publish first week'}</button>:<p style={{fontSize:13,color:'#f8d27a'}}>Training assessment required before coach publication. Device import is optional, but unresolved import states must not be mistaken for zero history.</p>)}
   {introPreview&&!activeRow&&setupStatus?.safe_to_use_no_history_path&&<>
    <div><strong>{introPreview.session_count} sessions · {introPreview.total_minutes} min</strong><p style={{fontSize:12,color:'#b6ccdc'}}>Easy RPE training, no assumed FTP or historical fitness. Not yet on the athlete calendar.</p></div>
    <details><summary>View proposed workouts</summary>{sessionList(introPreview.sessions||[])}</details>

   </>}
   {activeRow&&!publishedAthletes.includes(introAthlete)&&<>
    <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
      <strong>{Array.isArray(activeRow.sessions)?activeRow.sessions.length:0} sessions · {total(activeRow)} min</strong>
      <span style={{fontSize:12,color:activeRow.decision==='approved'?'#79dcbf':'#f8d27a'}}>{activeRow.decision==='approved'?'Approved':activeRow.decision==='rejected'?'Rejected':'Awaiting approval'}</span>
    </div>
    <details><summary>View workout details</summary>{sessionList(Array.isArray(activeRow.sessions)?activeRow.sessions:[])}</details>
    <p style={{fontSize:12,color:'#b6ccdc'}}>Coach approval and calendar publication happen together with one action. Nothing is scheduled until you approve.</p>
   </>}
   {introAthlete&&setupStatus?.safe_to_use_no_history_path&&publishedAthletes.includes(introAthlete)&&<div style={{marginTop:10,paddingTop:14,borderTop:'1px solid #34556c',display:'grid',gap:9}}>
     <strong style={{fontSize:16}}>Improved training · Week of {nextMonday}</strong>
     {nextWeekPublished.includes(introAthlete)?<p role="status" style={{color:'#a5e6cc'}}>Next week is published to the athlete calendar.</p>:<>
       <p style={{fontSize:13,color:'#c2d9e8'}}>Sport-specific intervals, distance-based swims and a recovery day. Current week stays unchanged.</p>
       {autoPreviewLoading?<p role="status">Preparing next week's draft for review…</p>:!nextWeekPreview?<button type="button" disabled={Boolean(busy)} onClick={()=>void previewNextWeek()}>Retry training preview</button>:null}
       {nextWeekPreview&&<>
         <p><strong>{nextWeekPreview.session_count} workouts · {nextWeekPreview.total_minutes} minutes</strong> · {Array.isArray(nextWeekPreview.recovery_days)?nextWeekPreview.recovery_days.length:0} recovery day</p>
         <details><summary>Review workouts and intervals</summary>{sessionList(nextWeekPreview.sessions||[])}</details>
         <button type="button" style={{background:'#1592ef',color:'white',minHeight:48,borderRadius:12,fontWeight:700}} disabled={Boolean(busy)} onClick={()=>void approveNextWeek()}>{busy==='next-publish'?'Publishing…':'Approve & Publish improved week'}</button>
       </>}
     </>}
   </div>}
   {introMessage&&<p role="status" style={{fontSize:13,color:'#b8e9d8'}}>{introMessage}</p>}
  </div>
  <details style={{marginTop:16,padding:12,border:'1px solid #304d63',borderRadius:12}}>
   <summary>Advanced coaching tools and other reviews</summary>
   <div style={{marginTop:12,display:'grid',gap:12}}>
    <CoachWorkoutLibrary/>
    <CoachWeekReconciliationPreview/>
    {otherRows.map(row=><div key={row.id} style={{padding:12,border:'1px solid #304d63',borderRadius:10}}>
      <strong>{row.athleteName} · {row.week_start}</strong><p style={{fontSize:12}}>{row.phase} · {row.decision}</p>
      <details><summary>Workouts and checks</summary>{sessionList(Array.isArray(row.sessions)?row.sessions:[])}<p>{readiness(row).join('; ')||'Ready for publication'}</p></details>
      {row.decision==='pending'&&<button type="button" disabled={Boolean(busy)} onClick={()=>void decide(row,'approved')}>Approve after review</button>}
      {row.decision==='approved'&&<button type="button" disabled={Boolean(busy)||readiness(row).length>0} onClick={()=>void publish(row,'full')}>Publish approved week</button>}
    </div>)}
   </div>
  </details>
 </section>;
}