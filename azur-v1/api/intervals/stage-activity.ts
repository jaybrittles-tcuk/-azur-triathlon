// Server-only staging endpoint. Deliberately disabled unless explicitly enabled after staging QA.
// No completed_activity or planned_session writes are performed.
import { reviewIntervalsActivity } from '../../src/lib/intervalsImportReview.mjs';
import { assessIntervalsImportGate } from '../../src/lib/intervalsImportGate.mjs';
const jsonHeaders=(key:string)=>({apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'});
export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
 if(process.env.INTERVALS_STAGING_ENABLED!=='true') return res.status(503).json({error:'Activity staging has not passed release checks'});
 const url=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:'Backend unavailable'});
 const auth=String(req.headers.authorization||'');
 if(!auth.startsWith('Bearer '))return res.status(401).json({error:'Sign in required'});
 const userResponse=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:auth}});
 if(!userResponse.ok)return res.status(401).json({error:'Invalid session'});
 const user=await userResponse.json();
 const headers=jsonHeaders(key);
 const lookup=async(path:string)=>{const result=await fetch(url+'/rest/v1/'+path,{headers});if(!result.ok)throw Error('Database read failed');return result.json();};
 try{
  const athlete=(await lookup('athlete_profile?user_id=eq.'+encodeURIComponent(user.id)+'&select=id&limit=1'))[0];
  if(!athlete)return res.status(404).json({error:'Athlete profile not found'});
  const sourceId=String(req.body?.sourceId??'');
  const plannedSessionId=req.body?.plannedSessionId==null?null:String(req.body.plannedSessionId);
  if(!sourceId||sourceId.length>150||req.body?.confirm!==true)return res.status(400).json({error:'Explicit activity confirmation is required'});
  const connected=(await lookup('athlete_integration?athlete_id=eq.'+athlete.id+'&provider=eq.intervals&select=access_token&limit=1'))[0];
  if(!connected?.access_token)return res.status(409).json({error:'Connect Intervals.icu first'});
  const today=new Date().toISOString().slice(0,10);
  const oldest=new Date(Date.now()-31*86400000).toISOString().slice(0,10);
  const activitiesResponse=await fetch('https://intervals.icu/api/v1/athlete/0/activities?oldest='+oldest+'&newest='+today,{headers:{Authorization:'Bearer '+connected.access_token}});
  if(!activitiesResponse.ok)return res.status(502).json({error:'Could not verify original Intervals activity'});
  const activities=await activitiesResponse.json();
  if(!Array.isArray(activities))return res.status(502).json({error:'Invalid upstream activity response'});
  const activity=activities.find((a:any)=>String(a.id)===sourceId);
  if(!activity)return res.status(404).json({error:'Activity not found in authorised Intervals account'});
  const rawDate=String(activity.start_date_local??activity.start_date??'').slice(0,10);
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(rawDate))return res.status(422).json({error:'Invalid activity date'});
  const existing=await lookup('completed_activity?athlete_id=eq.'+athlete.id+'&start_time=gte.'+encodeURIComponent(rawDate+'T00:00:00Z')+'&select=source,source_activity_id,sport,start_time,duration_sec,distance_m&limit=500');
  const planned=await lookup('planned_session?athlete_id=eq.'+athlete.id+'&planned_date=eq.'+rawDate+'&select=id,sport,title,planned_date,duration_min,status,is_active_version&limit=100');
  const review=reviewIntervalsActivity(activity,existing,planned);
  const gate=assessIntervalsImportGate(review,{kind:'explicit_athlete_confirmation',sourceId,plannedSessionId},activity);
  if(!gate.allowed)return res.status(409).json({error:'Activity requires further review',reason:gate.reason,reviewStatus:review.status});
  const duration=Number(activity.elapsed_time??activity.moving_time);
  const distance=activity.distance==null?null:Number(activity.distance);
  const average=activity.icu_average_watts??activity.average_watts??null;
  const weighted=activity.icu_weighted_avg_watts??null;
  const result=await fetch(url+'/rest/v1/rpc/stage_intervals_activity',{method:'POST',headers,body:JSON.stringify({
   p_athlete_id:athlete.id,p_source_id:sourceId,p_start:activity.start_date??activity.start_date_local,
   p_duration:duration,p_distance:distance,p_avg_power:average,p_normalized_power:weighted,
   p_source_payload:{source:'intervals',id:sourceId,type:activity.type,name:activity.name}
  })});
  if(!result.ok)return res.status(502).json({error:'Staging transaction failed'});
  const staged=await result.json();
  return res.status(200).json({stage:'review_inbox_only',outcome:staged?.[0]?.outcome??'unknown',trainingLoadChanged:false,sessionCompleted:false});
 }catch(error){return res.status(502).json({error:'Staging verification unavailable'});}
}
