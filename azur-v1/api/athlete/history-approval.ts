// Read-only athlete-scoped coach approval status. Never publishes or modifies workouts.
export default async function handler(req:any,res:any){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const url=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return res.status(503).json({error:'History approval service unavailable'});
  const bearer=String(req.headers.authorization||'');
  if(!bearer.startsWith('Bearer '))return res.status(401).json({error:'Sign in required'});
  try{
    const headers={apikey:key,Authorization:'Bearer '+key};
    const identity=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:bearer}});
    if(!identity.ok)return res.status(401).json({error:'Session expired'});
    const user=await identity.json();
    if(!user?.id)return res.status(401).json({error:'Session expired'});
    const profile=await fetch(url+'/rest/v1/athlete_profile?user_id=eq.'+encodeURIComponent(user.id)+'&select=id&limit=2',{headers});
    if(!profile.ok)return res.status(502).json({error:'Profile lookup unavailable'});
    const profiles=await profile.json();
    if(profiles.length!==1)return res.status(409).json({error:'Athlete profile requires review'});
    const athleteId=profiles[0].id;
    const today=new Date();
    const weekday=(today.getUTCDay()+6)%7;
    const monday=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-weekday));
    const mondayKey=monday.toISOString().slice(0,10);
    const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6);
    const sundayKey=sunday.toISOString().slice(0,10);
    const [approval,baseline,week,sessions]=await Promise.all([
      fetch(url+'/rest/v1/coach_history_baseline_review?athlete_id=eq.'+encodeURIComponent(athleteId)+'&select=decision,approved_weekly_hours,spike_verified,recovery_reviewed,reviewed_at&limit=2',{headers}),
      fetch(url+'/rest/v1/athlete_history_baseline?athlete_id=eq.'+encodeURIComponent(athleteId)+'&owner_user_id=eq.'+encodeURIComponent(user.id)+'&select=validation_status,activity_count,excluded_count&limit=2',{headers}),
      fetch(url+'/rest/v1/season_week?athlete_id=eq.'+encodeURIComponent(athleteId)+'&week_start=eq.'+mondayKey+'&select=target_hours,phase,locked&limit=2',{headers}),
      fetch(url+'/rest/v1/planned_session?athlete_id=eq.'+encodeURIComponent(athleteId)+'&planned_date=gte.'+mondayKey+'&planned_date=lte.'+sundayKey+'&is_active_version=eq.true&select=duration_min,status,locked',{headers})
    ]);
    if(!approval.ok||!baseline.ok||!week.ok||!sessions.ok)return res.status(502).json({error:'History review lookup unavailable'});
    const approvals=await approval.json(),baselines=await baseline.json(),weeks=await week.json(),workouts=await sessions.json();
    if(approvals.length>1||baselines.length>1||weeks.length>1)return res.status(409).json({error:'Conflicting historical reviews require coach review'});
    const a=approvals[0],b=baselines[0];
    const approved=!!(a&&b&&a.decision==='validated'&&b.validation_status==='validated'&&a.spike_verified===true&&a.recovery_reviewed===true&&Number(a.approved_weekly_hours)>0);
    return res.status(200).json({status:approved?'approved':'review_required',approvedWeeklyHours:approved?Number(a.approved_weekly_hours):null,historyActivities:b?.activity_count??null,excludedActivities:b?.excluded_count??null,reviewedAt:approved?a.reviewed_at:null,currentWeek:{start:mondayKey,phase:weeks[0]?.phase??null,storedTargetHours:weeks[0]?.target_hours==null?null:Number(weeks[0].target_hours),scheduledHours:Math.round(workouts.reduce((sum:number,w:any)=>sum+(Number(w.duration_min)||0),0)/6)/10,sessionCount:workouts.length,completedCount:workouts.filter((w:any)=>w.status==='completed').length,hasLockedSessions:workouts.some((w:any)=>w.locked===true),requiresReplanning:approved&&weeks[0]&&Number(weeks[0].target_hours)<Number(a.approved_weekly_hours)},planPublished:workouts.length>0});
  }catch{return res.status(502).json({error:'Unable to check coach approval'});}
}
