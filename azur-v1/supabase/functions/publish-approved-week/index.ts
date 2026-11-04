// AZUR staging-only coach-authorised initial-week publisher.
// Uses managed Supabase Edge secrets; no service key is exposed to the browser.
// The database RPC owns the atomic publication and content readback.
const STAGING_PROJECT='juvceqrzkeethontnezw';
const ORIGIN='https://azur-staging.vercel.app';
const url=Deno.env.get('SUPABASE_URL')??'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors={
 'Access-Control-Allow-Origin':ORIGIN,
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 'Vary':'Origin'
};
const respond=(status:number,data:Record<string,unknown>)=>
 new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const headers=()=>({apikey:serviceKey,Authorization:'Bearer '+serviceKey});
async function rows(path:string){
 const res=await fetch(url+'/rest/v1/'+path,{headers:headers()});
 if(!res.ok)throw new Error('Database read failed');
 const data=await res.json();
 if(!Array.isArray(data))throw new Error('Invalid database response');
 return data;
}
Deno.serve(async request=>{
 const origin=request.headers.get('origin');
 if(origin!==ORIGIN)return respond(403,{error:'Staging origin required'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return respond(405,{error:'POST required'});
 if(!serviceKey||!url||new URL(url).hostname!==STAGING_PROJECT+'.supabase.co')
  return respond(503,{error:'Isolated staging publisher unavailable'});
 const authorization=request.headers.get('authorization')??'';
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(authorization))
  return respond(401,{error:'Coach sign-in required'});
 const payloadText=await request.text().catch(()=>null);
 if(!payloadText||payloadText.length>1200)return respond(400,{error:'Invalid request'});
 let draftId='';
 try{
  const data=JSON.parse(payloadText);
  if(data?.mode!=='full'||typeof data?.draftId!=='string'||!uuid.test(data.draftId)||
    Object.keys(data).some((key:string)=>!['mode','draftId'].includes(key)))
   return respond(400,{error:'An approved draft ID and full-week mode are required'});
  draftId=data.draftId;
 }catch{return respond(400,{error:'Invalid JSON request'});}
 try{
  const auth=await fetch(url+'/auth/v1/user',{headers:{...headers(),Authorization:authorization}});
  if(!auth.ok)return respond(401,{error:'Coach session invalid'});
  const coach=await auth.json();
  if(typeof coach?.id!=='string'||!uuid.test(coach.id)||coach.app_metadata?.role!=='coach')
   return respond(403,{error:'Verified coach required'});
  const drafts=await rows('weekly_plan_draft?id=eq.'+encodeURIComponent(draftId)+
   '&select=id,athlete_id,week_start&limit=1');
  const draft=drafts[0];
  if(!draft||!uuid.test(draft.athlete_id))return respond(404,{error:'Draft not found'});
  const assignment=await rows('coach_athlete_assignment?coach_user_id=eq.'+
   encodeURIComponent(coach.id)+'&athlete_id=eq.'+encodeURIComponent(draft.athlete_id)+
   '&select=athlete_id&limit=1');
  if(!assignment.length)return respond(403,{error:'Coach is not assigned to athlete'});
  const [approval,target]=await Promise.all([
   rows('coach_initial_target_approval?athlete_id=eq.'+encodeURIComponent(draft.athlete_id)+
    '&week_start=eq.'+encodeURIComponent(draft.week_start)+
    '&coach_user_id=eq.'+encodeURIComponent(coach.id)+'&select=target_hours&limit=1'),
   rows('season_week?athlete_id=eq.'+encodeURIComponent(draft.athlete_id)+
    '&week_start=eq.'+encodeURIComponent(draft.week_start)+
    '&select=target_hours,locked&limit=1')
  ]);
  if(!approval.length||!target.length||target[0].locked||
   Number(target[0].target_hours)!==Number(approval[0].target_hours))
   return respond(409,{error:'An unchanged, coach-audited weekly training target is required'});
  // Latest approval, revision, race guards, duplicate prevention, prescription
  // validation and exact calendar content readback occur in one DB transaction.
  const published=await fetch(url+'/rest/v1/rpc/publish_verified_weekly_draft',{
   method:'POST',headers:{...headers(),'Content-Type':'application/json'},
   body:JSON.stringify({p_draft_id:draftId})
  });
  if(!published.ok)return respond(409,{error:'Database approval or calendar validation declined publication'});
  const result=await published.json();
  if(result?.status!=='published_verified'||result?.draft_id!==draftId)
   return respond(502,{error:'Publication result could not be verified'});
  return respond(200,{status:'published_verified',sessions:result.sessions,
   minutes:result.minutes,athleteCalendarUpdated:true});
 }catch{return respond(503,{error:'Staging publication service unavailable'});}
});
