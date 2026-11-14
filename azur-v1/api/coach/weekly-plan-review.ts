// Read-only coach planning review. This endpoint never publishes or modifies sessions.
export default async function handler(req:any,res:any){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const url=process.env.VITE_SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!service||!key)return res.status(503).json({error:'Planning review unavailable'});
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!token)return res.status(401).json({error:'Sign in required'});
 const auth=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+token}});
 if(!auth.ok)return res.status(401).json({error:'Invalid session'});
 const user=await auth.json();
 const athleteId=String(req.query.athleteId||'');
 const weekStart=String(req.query.weekStart||'');
 if(!/^[0-9a-f-]{36}$/i.test(athleteId)||!/^\d{4}-\d{2}-\d{2}$/.test(weekStart))return res.status(400).json({error:'Valid athlete and week required'});
 const start=new Date(weekStart+'T00:00:00Z');
 if(Number.isNaN(start.valueOf())||start.getUTCDay()!==1)return res.status(400).json({error:'Week must begin on Monday'});
 const end=new Date(start);end.setUTCDate(end.getUTCDate()+6);
 const headers={apikey:service,Authorization:'Bearer '+service};
 const get=async(path:string)=>{const r=await fetch(url+'/rest/v1/'+path,{headers});if(!r.ok)throw Error('Database review unavailable');return r.json()};
 try{
  const assignment=await get('coach_athlete_assignment?coach_user_id=eq.'+encodeURIComponent(user.id)+'&athlete_id=eq.'+athleteId+'&select=athlete_id&limit=2');
  if(assignment.length!==1)return res.status(403).json({error:'Coach assignment required'});
  const [week,history,baseline,review,sessions]=await Promise.all([
   get('season_week?athlete_id=eq.'+athleteId+'&week_start=eq.'+weekStart+'&select=id,phase,target_hours,locked&limit=2'),
   get('athlete_history_robust_review?athlete_id=eq.'+athleteId+'&select=validation_status,recent_weeks,recent_median_hours,recent_mean_hours,three_sport_weeks&limit=2'),
   get('athlete_history_baseline?athlete_id=eq.'+athleteId+'&select=validation_status,activity_count,excluded_count&limit=2'),
   get('coach_history_baseline_review?athlete_id=eq.'+athleteId+'&select=decision,approved_weekly_hours,spike_verified,recovery_reviewed&limit=2'),
   get('planned_session?athlete_id=eq.'+athleteId+'&planned_date=gte.'+weekStart+'&planned_date=lte.'+end.toISOString().slice(0,10)+'&is_active_version=eq.true&select=id,planned_date,sport,title,duration_min,status,locked&order=planned_date.asc')
  ]);
  if([week,history,baseline,review].some(a=>a.length>1))return res.status(409).json({error:'Conflicting review records'});
  const h=history[0],b=baseline[0],a=review[0],w=week[0];
  const approved=!!(h&&b&&a&&h.validation_status==='validated'&&h.recent_weeks>=4&&b.validation_status==='validated'&&a.decision==='validated'&&a.spike_verified&&a.recovery_reviewed&&Number(a.approved_weekly_hours)>0);
  const scheduledMinutes=sessions.reduce((n:number,s:any)=>n+Number(s.duration_min||0),0);
  const blockers=[
   ...(!approved?['Coach-validated history and safety checks required']:[]),
   ...(!w?['No season week exists']:[]),
   ...(w?.locked?['Season week is locked']:[]),
   ...(sessions.some((s:any)=>s.locked||s.status!=='planned')?['Week includes locked or modified/completed sessions']:[])
  ];
  const ceiling=approved?Math.min(Number(a.approved_weekly_hours),Number(h.recent_median_hours)):null;
  return res.status(200).json({weekStart,phase:w?.phase||null,storedTargetHours:w?Number(w.target_hours):null,approvedCapacityHours:ceiling,scheduledHours:Math.round(scheduledMinutes/6)/10,activityCount:b?.activity_count||0,sessionCount:sessions.length,sessions,blockers,requiresReview:true,canPublish:false,message:'Coach review only. No calendar changes have been made.'});
 }catch{return res.status(503).json({error:'Unable to load planning review'});}
}
