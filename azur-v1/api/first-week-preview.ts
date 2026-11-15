import {draftApprovedTrainingWeek} from '../src/lib/calculations/weeklyDraftGenerator.ts';
import {assessFirstWeekProfile} from '../src/lib/calculations/firstWeekProfileAssessment.ts';

/** Athlete-authenticated first-week preview. Never inserts drafts or publishes sessions.
 * No privileged credentials, coach impersonation or use of reported hours as verified history.
 */
export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
 const key=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))return res.status(503).json({error:'Planning unavailable'});
 if(!req.headers.origin||!req.headers.host||new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origin not allowed'});
 const token=String(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
 if(!token)return res.status(401).json({error:'Sign in required'});
 const headers={apikey:key,Authorization:'Bearer '+token};
 try{
  const auth=await fetch(url+'/auth/v1/user',{headers});
  if(!auth.ok)return res.status(401).json({error:'Invalid session'});
  const user=await auth.json();
  if(user.app_metadata?.role==='coach')return res.status(403).json({error:'Athlete account required'});
  const read=async(path:string)=>{const r=await fetch(url+'/rest/v1/'+path,{headers});if(!r.ok)throw Error('Read failed');return r.json()};
  const [onboarding,profile,invitation,library]=await Promise.all([
   read('athlete_onboarding?user_id=eq.'+encodeURIComponent(user.id)+'&select=onboarding_step,weekly_hours,recent_weekly_hours,training_background,training_consistency,current_training_concern,can_swim_200m,training_days&limit=2'),
   read('athlete_profile?user_id=eq.'+encodeURIComponent(user.id)+'&select=id&limit=2'),
   read('coach_athlete_invitation?accepted_by=eq.'+encodeURIComponent(user.id)+'&accepted_at=not.is.null&select=id&limit=2'),
   read('coach_workout_library?approved=eq.true&select=workout_key,title,sport,family,duration_min,level,phases,prescription,approved&limit=500')
  ]);
  if(onboarding.length!==1||profile.length!==1||invitation.length!==1)return res.status(409).json({error:'Complete your invited athlete setup first'});
  const o=onboarding[0],days=Array.isArray(o.training_days)?o.training_days:[];
  const assessment=assessFirstWeekProfile({
   onboardingComplete:Number(o.onboarding_step)>=5,availableHours:Number(o.weekly_hours),
   recentReportedHours:o.recent_weekly_hours==null?null:Number(o.recent_weekly_hours),
   background:o.training_background,consistency:o.training_consistency,
   concern:o.current_training_concern,trainingDays:days,canSwim200m:o.can_swim_200m
  });
  if(!assessment.canPropose)return res.status(200).json({status:'coach_review',reasons:assessment.reasons,published:false});
  const today=new Date();const monday=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate()+((8-monday.getUTCDay())%7||7));
  const weekStart=monday.toISOString().slice(0,10);
  const end=new Date(monday);end.setUTCDate(end.getUTCDate()+6);
  const [existing,weeks]=await Promise.all([
   read('planned_session?athlete_id=eq.'+profile[0].id+'&planned_date=gte.'+weekStart+'&planned_date=lte.'+end.toISOString().slice(0,10)+'&is_active_version=eq.true&select=id&limit=1'),
   read('season_week?athlete_id=eq.'+profile[0].id+'&week_start=eq.'+weekStart+'&select=id,locked&limit=2')
  ]);
  if(existing.length||weeks.some((w:any)=>w.locked))return res.status(200).json({status:'coach_review',reasons:['Existing or locked training week'],published:false});
  const slots=[
   {sport:'swim',family:'technique',maxMinutes:45,maxLevel:1},
   {sport:'bike',family:'aerobic_endurance',maxMinutes:90,maxLevel:1},
   {sport:'run',family:'aerobic_endurance',maxMinutes:45,maxLevel:1}
  ].map((s,i)=>({...s,day:assessment.days[i]??-1}));
  const proposal=draftApprovedTrainingWeek({
   weekStart,phase:'base',slots:slots as any,
   library:library.map((x:any)=>({id:x.workout_key,title:x.title,sport:x.sport,family:x.family,durationMin:Number(x.duration_min),level:Number(x.level),phases:x.phases,prescription:x.prescription,approved:x.approved})),
   weeklyLimitMinutes:Math.round(assessment.proposedHours!*60),targetWeekMinutes:Math.round(assessment.proposedHours!*60),
   existingActiveSessions:existing.length,athleteProfileReady:true
  });
  if(proposal.status==='blocked')return res.status(200).json({status:'coach_review',reasons:proposal.reasons,published:false});
  return res.status(200).json({status:'proposal_ready',weekStart,proposedHours:assessment.proposedHours,
   sessions:proposal.sessions.map(x=>({date:x.date,sport:x.session.sport,title:x.session.title,durationMin:x.session.durationMin,reason:x.reason})),
   published:false,requiresCoachReview:true});
 }catch(err){console.error('[first-week-preview]',err instanceof Error?err.message:'unknown');return res.status(503).json({error:'First-week assessment temporarily unavailable'});}
}
