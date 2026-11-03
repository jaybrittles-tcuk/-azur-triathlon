import {summarizeIntervalDetail} from '../../src/lib/intervalDetailPreview.mjs';
// Athlete-owned, read-only activity interval preview. Feature-gated separately from import acceptance.
// No writes to completed_activity, training load, planned sessions, or interval evidence.
export function createIntervalPreviewHandler(fetcher:typeof fetch=globalThis.fetch) {
 return async function handler(req:any,res:any) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  // The dedicated staging website delegates to the protected staging Edge backend.
  // No Supabase service key is required in Vercel, and production cannot use this route.
  if(process.env.AZUR_STAGING_BACKEND_URL){
   const backend='https://juvceqrzkeethontnezw.supabase.co/functions/v1/import-review';
   if(process.env.AZUR_STAGING_BACKEND_URL!==backend ||
      process.env.VITE_SUPABASE_URL!=='https://juvceqrzkeethontnezw.supabase.co')
    return res.status(503).json({error:'Staging target mismatch'});
   const bearer=String(req.headers?.authorization??'');
   if(!bearer.startsWith('Bearer ')||bearer.length<12)return res.status(401).json({error:'Sign in required'});
   const id=String(req.query?.activityId??'');
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return res.status(400).json({error:'Valid AZUR activity ID required'});
   try {
    const upstream=await fetcher('https://juvceqrzkeethontnezw.supabase.co/functions/v1/interval-evidence-preview?activityId='+encodeURIComponent(id),{
      method:'GET',headers:{Authorization:bearer,Accept:'application/json'}
    });
    const payload=await upstream.json();
    return res.status(upstream.status).json(payload);
   }catch{return res.status(502).json({error:'Staging interval detail unavailable'});}
  }
  if(process.env.AZUR_INTERVAL_DETAIL_PREVIEW_ENABLED!=='true')return res.status(503).json({error:'Interval detail preview not enabled'});
  const url=process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return res.status(503).json({error:'Preview backend unavailable'});
  const bearer=String(req.headers?.authorization??'');
  if(!bearer.startsWith('Bearer ')||bearer.length<12)return res.status(401).json({error:'Sign in required'});
  const id=String(req.query?.activityId??'');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
   return res.status(400).json({error:'Valid AZUR activity ID required'});
  const headers={apikey:key,Authorization:'Bearer '+key};
  try{
   const auth=await fetcher(url+'/auth/v1/user',{headers:{apikey:key,Authorization:bearer}});
   if(!auth.ok)return res.status(401).json({error:'Invalid session'});
   const user=await auth.json();
   if(typeof user?.id!=='string'||!user.id)return res.status(401).json({error:'Invalid session'});
   const profileReq=await fetcher(url+'/rest/v1/athlete_profile?user_id=eq.'+encodeURIComponent(user.id)+'&select=id&limit=1',{headers});
   if(!profileReq.ok)throw Error('Profile unavailable');
   const profile=(await profileReq.json())?.[0];
   if(!profile?.id)return res.status(404).json({error:'Athlete profile not found'});
   const activityReq=await fetcher(url+'/rest/v1/completed_activity?athlete_id=eq.'+encodeURIComponent(profile.id)+
    '&id=eq.'+encodeURIComponent(id)+'&source=eq.intervals&select=id,source_activity_id,sport,processed_metrics&limit=1',{headers});
   if(!activityReq.ok)throw Error('Activity lookup unavailable');
   const activity=(await activityReq.json())?.[0];
   if(!activity||!activity.source_activity_id)return res.status(404).json({error:'Owned Intervals activity not found'});
   if(activity.sport!=='bike'||activity.processed_metrics?.load_status!=='validated'||
      activity.processed_metrics?.load_validation_version!==1||
      activity.processed_metrics?.is_test===true||activity.processed_metrics?.test_fixture===true)
    return res.status(409).json({error:'Only validated cycling activity detail can be previewed'});
   const sourceId=String(activity.source_activity_id);
   if(!/^i?[A-Za-z0-9_-]{1,100}$/.test(sourceId))return res.status(409).json({error:'Invalid upstream activity reference'});
   const integrationReq=await fetcher(url+'/rest/v1/athlete_integration?athlete_id=eq.'+encodeURIComponent(profile.id)+
    '&provider=eq.intervals&select=access_token&limit=1',{headers});
   if(!integrationReq.ok)throw Error('Connection lookup unavailable');
   const integration=(await integrationReq.json())?.[0];
   if(!integration?.access_token)return res.status(409).json({error:'Reconnect Intervals.icu to preview details'});
   const upstream=await fetcher('https://intervals.icu/api/v1/activity/'+encodeURIComponent(sourceId)+'?intervals=true',{
    headers:{Authorization:'Bearer '+integration.access_token,Accept:'application/json'}
   });
   if(!upstream.ok)return res.status(502).json({error:'Intervals.icu detail unavailable'});
   // Protect against unusually large provider payloads; no raw stream is persisted.
   const declared=Number(upstream.headers?.get?.('content-length')??0);
   if(declared>2_000_000)return res.status(502).json({error:'Intervals.icu detail exceeds safe preview limit'});
   const detail=await upstream.json();
   const preview=summarizeIntervalDetail(detail,sourceId);
   return res.status(200).json({mode:'read_only',activityId:id,sessionCompleted:false,
    trainingLoadChanged:false,calendarChanged:false,...preview});
  }catch{return res.status(502).json({error:'Activity interval preview unavailable'});}
 };
}
export default createIntervalPreviewHandler();
