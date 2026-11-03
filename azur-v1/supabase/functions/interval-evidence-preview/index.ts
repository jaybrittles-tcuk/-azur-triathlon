import {summarizeIntervalDetail} from '../../../src/lib/intervalDetailPreview.mjs';
// Isolated staging-only, read-only interval preview. No database modifications.
// Supabase's Edge runtime keeps service credentials server-side.
const url=Deno.env.get('SUPABASE_URL')??'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const STAGING='juvceqrzkeethontnezw';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sourcePattern=/^i[0-9]{1,30}$/;
const response=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}
});
const serviceHeaders=()=>({apikey:serviceKey,Authorization:'Bearer '+serviceKey});
async function fetchRows(path:string){
 const res=await fetch(url+'/rest/v1/'+path,{headers:serviceHeaders()});
 if(!res.ok)throw new Error('database');
 const data=await res.json();if(!Array.isArray(data))throw new Error('data');return data;
}
Deno.serve(async request=>{
 if(request.method!=='GET')return response(405,{error:'Method not allowed'});
 if(!url.includes(STAGING+'.supabase.co')||!serviceKey)
  return response(503,{error:'Staging backend unavailable'});
 const auth=request.headers.get('authorization')??'';
 if(!auth.startsWith('Bearer ')||auth.length<12)return response(401,{error:'Sign in required'});
 const activityId=new URL(request.url).searchParams.get('activityId')??'';
 if(!uuid.test(activityId))return response(400,{error:'Valid AZUR activity ID required'});
 try {
  const verified=await fetch(url+'/auth/v1/user',{headers:{apikey:serviceKey,Authorization:auth}});
  if(!verified.ok)return response(401,{error:'Invalid session'});
  const user=await verified.json();
  if(typeof user?.id!=='string'||!uuid.test(user.id))return response(401,{error:'Invalid session'});
  const roles=user.app_metadata?.role;
  const rows=await fetchRows('completed_activity?id=eq.'+encodeURIComponent(activityId)+
   '&source=eq.intervals&select=id,athlete_id,source_activity_id,sport,processed_metrics&limit=1');
  const activity=rows[0];
  if(!activity)return response(404,{error:'Activity not found'});
  const athleteId=String(activity.athlete_id??'');
  if(!uuid.test(athleteId))return response(404,{error:'Activity not found'});
  let authorised=false;
  if(roles==='coach'){
   const assigned=await fetchRows('coach_athlete_assignment?coach_user_id=eq.'+
    encodeURIComponent(user.id)+'&athlete_id=eq.'+encodeURIComponent(athleteId)+'&select=athlete_id&limit=1');
   authorised=assigned.length>0;
  }else{
   const own=await fetchRows('athlete_profile?id=eq.'+encodeURIComponent(athleteId)+
    '&user_id=eq.'+encodeURIComponent(user.id)+'&select=id&limit=1');
   authorised=own.length>0;
  }
  if(!authorised)return response(404,{error:'Activity not found'});
  const metrics=activity.processed_metrics??{};
  if(activity.sport!=='bike'||metrics.load_status!=='validated'||metrics.load_validation_version!==1||
    metrics.is_test===true||metrics.test_fixture===true)
   return response(409,{error:'Only validated cycling activities can be previewed'});
  const sourceId=String(activity.source_activity_id??'');
  if(!sourcePattern.test(sourceId))return response(409,{error:'No real Intervals.icu activity reference is available for this staging record'});
  const connected=await fetchRows('athlete_integration?athlete_id=eq.'+
   encodeURIComponent(athleteId)+'&provider=eq.intervals&select=access_token&limit=1');
  const token=connected[0]?.access_token;
  if(typeof token!=='string'||!token)return response(409,{error:'Intervals.icu connection unavailable'});
  const upstream=await fetch('https://intervals.icu/api/v1/activity/'+encodeURIComponent(sourceId)+'?intervals=true',{
   headers:{Authorization:'Bearer '+token,Accept:'application/json'}
  });
  if(!upstream.ok)return response(502,{error:'Provider interval detail unavailable'});
  const length=Number(upstream.headers.get('content-length')??0);
  if(length>2_000_000)return response(502,{error:'Provider response too large'});
  const raw=await upstream.text();
  if(raw.length>2_000_000)return response(502,{error:'Provider response too large'});
  const preview=summarizeIntervalDetail(JSON.parse(raw),sourceId);
  return response(200,{activityId,mode:'read_only',calendarChanged:false,
   sessionCompleted:false,trainingLoadChanged:false,...preview});
 }catch{return response(502,{error:'Interval preview unavailable'});}
});
