import {draftQuestionnaireWeek} from '../../src/lib/calculations/questionnaireCheckedWeeklyDraft.ts';
import { reconcileWeeklyDraft } from '../../src/lib/calculations/weeklyDraftReconciliation.ts';
import {previewVipaReplacements} from '../../src/lib/calculations/vipaReplacementPreview.ts';
import {inspectAthleteThresholds} from '../../src/lib/calculations/athleteThresholdReadiness.ts';
import {previewThresholdTargets} from '../../src/lib/calculations/verifiedWorkoutTargets.ts';
import {previewPersonalisedSteps} from '../../src/lib/calculations/personalisedWorkoutSteps.ts';
// Read-only coach planning review. This endpoint never publishes or modifies sessions.
export default async function handler(req:any,res:any){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))return res.status(503).json({error:'Staging coach review requires a configured server-side Supabase connection'});
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!token)return res.status(401).json({error:'Sign in required'});
 const auth=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+token}});
 if(!auth.ok)return res.status(401).json({error:'Invalid session'});
 const user=await auth.json();
 if(user.app_metadata?.role!=='coach')return res.status(403).json({error:'Verified coach account required'});
 const athleteId=String(req.query.athleteId||'');
 const weekStart=String(req.query.weekStart||'');
 if(!/^[0-9a-f-]{36}$/i.test(athleteId)||!/^\d{4}-\d{2}-\d{2}$/.test(weekStart))return res.status(400).json({error:'Valid athlete and week required'});
 const start=new Date(weekStart+'T00:00:00Z');
 if(Number.isNaN(start.valueOf())||start.toISOString().slice(0,10)!==weekStart||start.getUTCDay()!==1)return res.status(400).json({error:'Week must begin on Monday'});
 const end=new Date(start);end.setUTCDate(end.getUTCDate()+6);
 // Use the verified coach's JWT and database RLS rather than a privileged service-role key.
 const headers={apikey:key,Authorization:'Bearer '+token};
 res.setHeader('Cache-Control','no-store');
 const get=async(path:string)=>{const r=await fetch(url+'/rest/v1/'+path,{headers});if(!r.ok){const resource=path.split('?')[0];console.error('[coach-weekly-review] database read failed',resource,r.status);throw Error('REVIEW_READ_'+resource.toUpperCase()+'_'+r.status)}return r.json()};
 try{
  const assignment=await get('coach_athlete_assignment?coach_user_id=eq.'+encodeURIComponent(user.id)+'&athlete_id=eq.'+athleteId+'&select=athlete_id&limit=2');
  if(assignment.length!==1)return res.status(403).json({error:'Coach assignment required'});
  const [week,history,baseline,review,sessions,library,profiles,onboarding,validatedThresholdRows]=await Promise.all([
   get('season_week?athlete_id=eq.'+athleteId+'&week_start=eq.'+weekStart+'&select=id,phase,target_hours,locked&limit=2'),
   get('athlete_history_robust_review?athlete_id=eq.'+athleteId+'&select=validation_status,recent_weeks,recent_median_hours,recent_mean_hours,three_sport_weeks&limit=2'),
   get('athlete_history_baseline?athlete_id=eq.'+athleteId+'&select=validation_status,activity_count,excluded_count&limit=2'),
   get('coach_history_baseline_review?athlete_id=eq.'+athleteId+'&coach_user_id=eq.'+encodeURIComponent(user.id)+'&select=decision,approved_weekly_hours,spike_verified,recovery_reviewed&limit=2'),
   get('planned_session?athlete_id=eq.'+athleteId+'&planned_date=gte.'+weekStart+'&planned_date=lte.'+end.toISOString().slice(0,10)+'&is_active_version=eq.true&select=id,planned_date,sport,title,duration_min,status,locked&order=planned_date.asc'),
   get('coach_workout_library?approved=eq.true&select=workout_key,title,sport,family,duration_min,level,phases,prescription,approved&limit=500'),
   get('athlete_profile?id=eq.'+athleteId+'&select=user_id,ftp_w,swim_threshold_sec_per_100m,run_threshold_sec_per_km&limit=2'),
   Promise.resolve([]),
   get('coach_threshold_validation?athlete_id=eq.'+athleteId+'&coach_user_id=eq.'+user.id+'&select=ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km,validated_at&limit=2')
  ]);
  if([week,history,baseline,review,profiles,onboarding,validatedThresholdRows].some(a=>a.length>1))return res.status(409).json({error:'Conflicting review records'});
  const h=history[0],b=baseline[0],a=review[0],w=week[0];
  const setupRows=profiles[0]?.user_id?await get('athlete_onboarding?user_id=eq.'+profiles[0].user_id+'&select=onboarding_step,weekly_hours,recent_weekly_hours,training_background,training_consistency,current_training_concern,can_swim_200m,race_distance,device&limit=2'):[];
  if(setupRows.length>1)return res.status(409).json({error:'Conflicting athlete onboarding records'});
  const setup=setupRows[0]||null;
  const questionnaireComplete=!!(setup&&Number(setup.onboarding_step)>=5&&Number.isFinite(Number(setup.weekly_hours))&&Number(setup.weekly_hours)>=2&&Number(setup.weekly_hours)<=25&&['novice','regular','established'].includes(setup.training_background)&&['under4','4to7','8plus'].includes(setup.training_consistency));
  const questionnaireReview={eligibleForCoachAssessment:questionnaireComplete,source:'athlete_reported',historyRequired:false,requestedWeeklyHours:questionnaireComplete?Number(setup.weekly_hours):null,recentWeeklyHours:setup?.recent_weekly_hours==null?null:Number(setup.recent_weekly_hours),trainingConcern:setup?.current_training_concern||'unknown',swimReadiness:setup?.can_swim_200m??null,coachApprovalRequired:true,canPublish:false};
  const approved=!!(h&&b&&a&&h.validation_status==='validated'&&h.recent_weeks>=4&&b.validation_status==='validated'&&a.decision==='validated'&&a.spike_verified&&a.recovery_reviewed&&Number(a.approved_weekly_hours)>0);
  const questionnaireDraftPreview=questionnaireComplete?draftQuestionnaireWeek({
   weekStart,phase:'base',targetWeekMinutes:Math.round(Math.min(Number(setup.weekly_hours),4)*60),
   existingActiveSessions:sessions.length,athleteProfileReady:true,
   slots:[{day:0,sport:'swim',family:'technique',maxMinutes:45,maxLevel:1},{day:2,sport:'bike',family:'aerobic_endurance',maxMinutes:60,maxLevel:1},{day:4,sport:'run',family:'aerobic_endurance',maxMinutes:40,maxLevel:1}],
   library:library.map((item:any)=>({id:item.workout_key,title:item.title,sport:item.sport,family:item.family,durationMin:Number(item.duration_min),level:Number(item.level),phases:item.phases,prescription:item.prescription,approved:item.approved})),
   baseline:{onboardingComplete:true,requestedWeeklyHours:Number(setup.weekly_hours),recentWeeklyHours:setup.recent_weekly_hours==null?null:Number(setup.recent_weekly_hours),trainingBackground:setup.training_background,trainingConsistency:setup.training_consistency,trainingConcern:setup.current_training_concern||'unsure',canSwim200m:setup.can_swim_200m===true,coachApproved:false,approvedWeeklyHours:null}
  }):null;
  const scheduledMinutes=sessions.reduce((n:number,s:any)=>n+Number(s.duration_min||0),0);
  const blockers=[
   ...(!approved?[questionnaireComplete?'Questionnaire baseline available for coach assessment; approval and safe plan publication path not yet enabled':'Coach-validated history or completed questionnaire baseline and safety checks required']:[]),
   ...(!w?['No season week exists']:[]),
   ...(w?.locked?['Season week is locked']:[]),
   ...(sessions.some((s:any)=>s.locked||s.status!=='planned')?['Week includes locked or modified/completed sessions']:[])
  ];
  // Read-only pre-publication assessment. The database publisher remains the final authority.
  const drafts=await get('weekly_plan_draft?athlete_id=eq.'+athleteId+'&week_start=eq.'+weekStart+'&select=id,revision,sessions,created_at&order=revision.desc&limit=2');
  const latestDraft=drafts[0]||null;
  let latestDecision:any=null;
  if(latestDraft){
   const decisions=await get('weekly_plan_decision?draft_id=eq.'+latestDraft.id+'&select=decision,coach_user_id,decided_at&order=decided_at.desc&limit=1');
   latestDecision=decisions[0]||null;
  }
  const draftSessions=Array.isArray(latestDraft?.sessions)?latestDraft.sessions:[];
  const proposedMinutes=draftSessions.reduce((sum:number,item:any)=>sum+(Number(item?.session?.durationMin)||0),0);
  const draftShapeValid=draftSessions.length>0&&draftSessions.length<=21&&draftSessions.every((item:any)=>{
   const x=item?.session;
   return typeof item?.date==='string'&&item.date>=weekStart&&item.date<=end.toISOString().slice(0,10)&&
    ['swim','bike','run'].includes(x?.sport)&&typeof x?.title==='string'&&x.title.trim().length>0&&
    Number.isInteger(x?.durationMin)&&x.durationMin>=10&&x.durationMin<=240&&
    [1,2,3].includes(Number(x?.priority))&&typeof x?.sessionClass==='string'&&x.sessionClass.length>0&&
    x.targets&&typeof x.targets==='object'&&!Array.isArray(x.targets)&&
    x.prescription&&typeof x.prescription==='object'&&!Array.isArray(x.prescription);
  });
  const sportDates=draftSessions.map((item:any)=>String(item?.date)+'/'+String(item?.session?.sport));
  const reconciliation=latestDraft?reconcileWeeklyDraft({
   weekStart,existing:sessions.map((s:any)=>({...s,is_active_version:true})),
   proposed:draftSessions.map((item:any)=>({date:item?.date,session:{id:String(item?.session?.id||''),sport:item?.session?.sport,durationMin:item?.session?.durationMin}})),
   approvedCapacityMinutes:approved?Math.round(Number(a.approved_weekly_hours)*60):0,
   weekTargetMinutes:w?Math.round(Number(w.target_hours)*60):0
  }):null;
  const preflightBlockers=[
   ...blockers,
   ...(!latestDraft?['No saved draft for this week']:[]),
   ...(reconciliation?.blockers||[]),
   ...(latestDraft&&!draftShapeValid?['Draft contains incomplete or invalid workouts']:[]),
   ...(new Set(sportDates).size!==sportDates.length?['Duplicate sport and date in draft']:[]),
   ...(latestDraft&&(!latestDecision||latestDecision.decision!=='approved'||latestDecision.coach_user_id!==user.id)?['Latest draft lacks approval by this assigned coach']:[]),
   ...(sessions.length?['Existing calendar sessions require reconciliation before full publication']:[]),
   ...(w&&approved&&proposedMinutes>Math.min(Number(w.target_hours),Number(a.approved_weekly_hours))*60?['Draft exceeds approved capacity or saved week target']:[])
  ];
  const savedProposal=latestDraft?{
   id:latestDraft.id,revision:latestDraft.revision,createdAt:latestDraft.created_at,
   sessions:draftSessions.map((item:any)=>({date:item.date,sport:item.session?.sport||null,
    title:item.session?.title||null,durationMin:item.session?.durationMin||null,
    prescription:item.session?.prescription||null,targets:item.session?.targets||null,
    reason:item.reason||null})),
   decision:latestDecision?.decision||'pending',shapeValid:draftShapeValid
  }:null;
  const preflight={draftId:latestDraft?.id||null,revision:latestDraft?.revision||null,proposedSessions:draftSessions.length,proposedHours:Math.round(proposedMinutes/6)/10,readyForFullPublication:preflightBlockers.length===0,blockers:[...new Set(preflightBlockers)],readOnly:true};
  // Read-only VIPA preview: never writes to planned_session or weekly_plan_draft.
  // Preserve every existing day/sport; preview only structured replacements.
  const slots=sessions.map((s:any)=>({
   day:Math.round((Date.parse(s.planned_date+'T12:00:00Z')-Date.parse(weekStart+'T12:00:00Z'))/86400000),
   sport:s.sport,
   family:s.sport==='swim'?(s.planned_date===weekStart?'threshold':'technique'):
    s.sport==='bike'?(s.planned_date===weekStart?'strength_endurance':'aerobic_endurance'):
    (s.planned_date===weekStart?'technique':'aerobic_endurance'),
   maxMinutes:Number(s.duration_min)+15,maxLevel:2
  }));
  // For each sport, prefer a quality session on its first appearance and aerobic/technique thereafter.
  for(const sport of ['swim','bike','run']){
   const sportSlots=slots.filter((s:any)=>s.sport===sport);
   if(sportSlots.length){
    sportSlots[0].family=sport==='swim'?'threshold':sport==='bike'?'strength_endurance':'technique';
    for(const later of sportSlots.slice(1))later.family=sport==='swim'?'technique':'aerobic_endurance';
   }
  }
  const vipaPreview=previewVipaReplacements({
   weekStart,phase:'base',targetMinutes:w?Math.round(Number(w.target_hours)*60):0,
   approvedCapacityMinutes:approved?Math.round(Number(a.approved_weekly_hours)*60):0,
   historyValidated:approved,recoveryReviewed:!!a?.recovery_reviewed,spikeVerified:!!a?.spike_verified,
   fatigueFlag:false,injuryFlag:false,
   existing:sessions.map((s:any)=>({...s,is_active_version:true})),slots:slots as any,
   library:library.map((s:any)=>({id:s.workout_key,title:s.title,sport:s.sport,family:s.family,durationMin:Number(s.duration_min),level:s.level,phases:s.phases,prescription:s.prescription,approved:s.approved}))
  });
  const onboardingForProfile=profiles[0]?.user_id?await get('athlete_onboarding?user_id=eq.'+profiles[0].user_id+'&select=ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km&limit=2'):[];
  if(onboardingForProfile.length>1)return res.status(409).json({error:'Conflicting onboarding records'});
  const thresholdReadiness=inspectAthleteThresholds(profiles[0]||null,onboardingForProfile[0]||null);
  const validated=validatedThresholdRows[0]||null;
  const validatedValues={ftpWatts:validated?.ftp_watts??null,swimCssSecondsPer100m:validated?.swim_css_seconds_per_100m??null,runThresholdSecondsPerKm:validated?.run_threshold_seconds_per_km??null};
  const verifiedSource={values:validatedValues,coachValidated:!!validated,validatedAt:validated?.validated_at??null};
  const verifiedTargetReferences=(['swim','bike','run'] as const).map(sport=>previewThresholdTargets(sport,verifiedSource));
  const personalisedStepPreviews=(vipaPreview.proposed||[]).map((proposal:any)=>({existingId:proposal.existingId,...previewPersonalisedSteps(proposal.replacement,verifiedSource)}));
  const ceiling=approved?Number(a.approved_weekly_hours):null;
  return res.status(200).json({weekStart,phase:w?.phase||null,storedTargetHours:w?Number(w.target_hours):null,approvedCapacityHours:ceiling,scheduledHours:Math.round(scheduledMinutes/6)/10,vipaPreview,thresholdReadiness,verifiedTargetReferences,personalisedStepPreviews,activityCount:b?.activity_count||0,questionnaireReview,questionnaireDraftPreview:questionnaireDraftPreview?{status:questionnaireDraftPreview.status,reasons:questionnaireDraftPreview.status==='blocked'?questionnaireDraftPreview.reasons:[],sessionCount:questionnaireDraftPreview.sessions.length,readOnly:true}:null,sessionCount:sessions.length,sessions,blockers,preflight,reconciliation,savedProposal,requiresReview:true,canPublish:false,message:'Coach review only. No calendar changes have been made.'});
 }catch(err){const code=err instanceof Error&&/^REVIEW_READ_[A-Z_]+_\d+$/.test(err.message)?err.message:'REVIEW_PROCESSING_ERROR';console.error('[coach-weekly-review] failed',code);return res.status(503).json({error:'Unable to load planning review',diagnosticCode:code});}
}
