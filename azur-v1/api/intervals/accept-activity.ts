// Acceptance records a ride only. Load validation and plan completion are separate.
export default async function handler(req:any,res:any) {
 res.setHeader('Cache-Control','private, no-store');
 if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
 if(process.env.INTERVALS_ACCEPTANCE_ENABLED!=='true') return res.status(503).json({error:'Reviewed imports are not enabled'});
 const url=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key) return res.status(503).json({error:'Backend unavailable'});
 const auth=String(req.headers.authorization??'');
 if(!auth.startsWith('Bearer ')) return res.status(401).json({error:'Sign in required'});
 try {
  const userResponse=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:auth}});
  if(!userResponse.ok) return res.status(401).json({error:'Invalid session'});
  const user=await userResponse.json();
  if(!user?.id) return res.status(401).json({error:'Invalid session'});
  const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const profileResponse=await fetch(url+'/rest/v1/athlete_profile?user_id=eq.'+encodeURIComponent(user.id)+'&select=id&limit=1',{headers});
  if(!profileResponse.ok) throw Error('Profile lookup failed');
  const athlete=(await profileResponse.json())?.[0];
  if(!athlete) return res.status(404).json({error:'Athlete profile not found'});
  if(req.method==='GET') {
   const inbox=await fetch(url+'/rest/v1/intervals_import_inbox?athlete_id=eq.'+encodeURIComponent(athlete.id)+'&select=id,source_activity_id,start_time,duration_sec,distance_m,status&order=start_time.desc&limit=100',{headers});
   if(!inbox.ok) throw Error('Inbox unavailable');
   return res.status(200).json({activities:await inbox.json()});
  }
  const stageId=req.body?.stageId;
  if(req.body?.confirm!==true||typeof stageId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stageId)) return res.status(400).json({error:'Explicit confirmation of a staged ride is required'});
  const result=await fetch(url+'/rest/v1/rpc/accept_staged_intervals_ride',{method:'POST',headers,body:JSON.stringify({p_athlete_id:athlete.id,p_stage_id:stageId,p_confirm:true})});
  if(!result.ok) {
   if(result.status>=500) throw Error('Transaction unavailable');
   return res.status(409).json({error:'Ride could not be accepted. Refresh the inbox; duplicate or ownership review may be required.'});
  }
  const accepted=(await result.json())?.[0];
  if(!accepted?.activity_id||!['already_imported','imported_pending_load_review'].includes(accepted.outcome)) throw Error('Invalid transaction result');
  return res.status(200).json({activityId:accepted.activity_id,outcome:accepted.outcome,trainingLoadChanged:false,sessionCompleted:false});
 } catch { return res.status(502).json({error:'Reviewed import unavailable. Refresh before retrying.'}); }
}
