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
 const [introAthletes,setIntroAthletes]=useState<{id:string;name:string}[]>([]);
 const [introAthlete,setIntroAthlete]=useState('');
 const [introPreview,setIntroPreview]=useState<any>(null);
 const [introMessage,setIntroMessage]=useState('');
 const [publishedAthletes,setPublishedAthletes]=useState<string[]>([]);
 const [nextWeekPublished,setNextWeekPublished]=useState<string[]>([]);
 const [nextWeekPreview,setNextWeekPreview]=useState<any>(null);
 const [setupStatus,setSetupStatus]=useState<{status:string;label:string;safe_to_use_no_history_path:boolean}|null>(null);
 const [swimAssessment,setSwimAssessment]=useState<{recommended_focus:string;recommended_practice:string;execution_cue:string;why_today_matters:string;focus_source:string;css_status:string;next_evidence:string}|null>(null);
 const [coachingModel,setCoachingModel]=useState<any>(null);
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
   const [drafts,profiles,baselines,history,planned]=await Promise.all([
     supabase.from('weekly_plan_draft').select('id,athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_at').in('athlete_id',ids).order('created_at',{ascending:false}).limit(150),
     supabase.from('athlete_profile').select('id,display_name').in('id',ids),
     supabase.from('coach_history_baseline_review').select('athlete_id,decision,approved_weekly_hours').in('athlete_id',ids),
     supabase.from('athlete_history_baseline').select('athlete_id,validation_status').in('athlete_id',ids),
     supabase.from('planned_session').select('athlete_id,planned_date').in('athlete_id',ids).gte('planned_date',weekStart).lte('planned_date',nextEnd).eq('is_active_version',true)
   ]);
   if(drafts.error||profiles.error||baselines.error||history.error||planned.error)throw new Error(drafts.error?.message||profiles.error?.message||baselines.error?.message||history.error?.message||planned.error?.message||'Unable to load weekly drafts');
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
   if(live){const candidates=(profiles.data??[]).filter(p=>!statuses.has(p.id)).map(p=>({id:p.id,name:p.display_name||'Assigned athlete'}));setIntroAthletes(candidates);setIntroAthlete(old=>candidates.some(a=>a.id===old)?old:(candidates[0]?.id||''));}
   const latest=new Map<string,Draft>();
   for(const d of all){const key=d.athlete_id+':'+d.week_start;const previous=latest.get(key);if(!previous||d.revision>previous.revision)latest.set(key,d);}
   if(live)setRows([...latest.values()].map(d=>({...d,athleteName:names.get(d.athlete_id)||'Assigned athlete',decision:last.get(d.id)?.decision||'pending',approvedWeeklyHours:approved.get(d.athlete_id)?.decision==='validated'?Number(approved.get(d.athlete_id)?.approved_weekly_hours):null,baselineValidated:statuses.get(d.athlete_id)==='validated'&&approved.get(d.athlete_id)?.decision==='validated'})).sort((a,b)=>b.week_start.localeCompare(a.week_start)));
  }catch(e){if(live)setError(e instanceof Error?e.message:'Could not load weekly reviews');}
  finally{if(live)setLoading(false);}
 })();return()=>{live=false};},[reload]);
 useEffect(()=>{
  let live=true;
  setSetupStatus(null);setSwimAssessment(null);setCoachingModel(null);setNextWeekPreview(null);
  if(!introAthlete||loading)return()=>{live=false};
  (async()=>{
   const [{data,error},{data:swimData,error:swimError},{data:modelData,error:modelError}]=await Promise.all([
     supabase.rpc('coach_athlete_setup_status',{p_athlete_id:introAthlete}),
     supabase.rpc('coach_swim_intelligence_preview',{p_athlete_id:introAthlete}),
     supabase.rpc('coach_training_intelligence_preview',{p_athlete_id:introAthlete})
   ]);
   if(!live)return;
   if(!swimError&&swimData?.status==='review_only')setSwimAssessment(swimData);
   if(!modelError&&modelData?.model_version==='coach_intelligence_v2')setCoachingModel(modelData);
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
 const activeRow=rows.find(row=>row.athlete_id===introAthlete && row.phase==='foundation_no_history');
 const otherRows=rows.filter(row=>row.id!==activeRow?.id);
 const selectedName=introAthletes.find(a=>a.id===introAthlete)?.name||'Athlete';
 const total=(row:Row)=>Array.isArray(row.sessions)?row.sessions.reduce((n:number,x:any)=>n+(Number(x?.session?.durationMin)||0),0):0;
 const sessionList=(sessions:any[])=>sessions.map((item:any,i:number)=>{
  const x=item.session||item;
  return <details key={i} style={{padding:'10px 0',borderBottom:'1px solid #284b62'}}>
    <summary style={{cursor:'pointer',fontSize:14}}><strong>{String(x.title||'Workout')}</strong> <span style={{color:'#9bbbd0'}}>{Number(x.durationMin||0)} min · {String(x.sport||'').toUpperCase()}</span></summary>
    <p style={{fontSize:13,color:'#c8dce9',lineHeight:1.5}}>{String(x.rationale||'Controlled introductory session')}</p>
    <div style={{fontSize:12,color:'#b7d0df'}}>{Array.isArray(x.prescription?.steps)?x.prescription.steps.map((s:any,j:number)=><p key={j} style={{margin:'5px 0'}}>{s.durationMin} min · {s.target}</p>):null}
      {Array.isArray(x.prescription?.poolSegments)&&x.prescription.poolSegments.length>0&&<details><summary>Swim sets · {x.prescription.totalDistanceMeters} m</summary>
       {x.prescription.poolSegments.map((s:any,j:number)=><p key={j}>{s.repeats} × {s.distanceMeters}m · {s.target} · {s.restSeconds}s rest</p>)}
      </details>}
    </div>
  </details>;
 });
 return <section className="coach-attention-v2" aria-label="Weekly plan reviews">
  <header className="coach-attention-heading"><div><h3>Prepare training week</h3><p>Select an athlete and approve their proposed week in one action.</p></div>
   <button type="button" disabled={loading||Boolean(busy)} onClick={()=>setReload(x=>x+1)}>Refresh</button></header>
  {error&&<p role="alert" style={{color:'#ffc7a6'}}>{error}</p>}
  <div style={{padding:16,borderRadius:18,background:'#102b42',border:'1px solid #31566e',display:'grid',gap:12,color:'#ecf6ff'}}>
   <label style={{fontSize:13,fontWeight:700}}>Athlete
    <select style={{display:'block',width:'100%',marginTop:6,padding:12,borderRadius:10,background:'#173c55',color:'white'}} value={introAthlete} onChange={e=>{setIntroAthlete(e.target.value);setIntroPreview(null);setNextWeekPreview(null);setIntroMessage('');}}>
     <option value="">Choose athlete</option>{introAthletes.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
    </select></label>
   {introAthlete&&<div style={{fontSize:13,color:'#c4daeb'}}><strong>{selectedName}</strong> · {setupStatus?.label||'Checking training-history status…'}</div>}
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