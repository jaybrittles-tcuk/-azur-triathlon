import { proxyStagingImport } from '../../src/lib/stagingImportProxy.ts';
import { reviewIntervalsActivity } from '../../src/lib/intervalsImportReview.mjs';
// Read-only preflight: no athlete activities are written or plans altered.
export function createActivityPreviewHandler(fetcher: typeof fetch = globalThis.fetch) { return async function handler(req:any,res:any){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const url=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:'Backend configuration unavailable'});
 const bearer=String(req.headers.authorization||'');
 if(!bearer.startsWith('Bearer '))return res.status(401).json({error:'Sign in to AZUR'});
 const userReq=await fetcher(url+'/auth/v1/user',{headers:{apikey:key,Authorization:bearer}});
 if(!userReq.ok)return res.status(401).json({error:'Invalid session'});
 const user=await userReq.json();
 const headers={apikey:key,Authorization:'Bearer '+key};
 const athleteReq=await fetcher(url+'/rest/v1/athlete_profile?user_id=eq.'+encodeURIComponent(user.id)+'&select=id&limit=1',{headers});
 if(!athleteReq.ok)return res.status(502).json({error:'Athlete lookup unavailable'});
 const athlete=(await athleteReq.json())?.[0];
 if(!athlete)return res.status(404).json({error:'Athlete profile not found'});
 const integrationReq=await fetcher(url+'/rest/v1/athlete_integration?athlete_id=eq.'+encodeURIComponent(athlete.id)+'&provider=eq.intervals&select=access_token&limit=1',{headers});
 if(!integrationReq.ok)return res.status(502).json({error:'Integration lookup unavailable'});
 const integration=(await integrationReq.json())?.[0];
 if(!integration?.access_token)return res.status(409).json({error:'Intervals.icu approval and athlete authorisation required'});
 const days=Math.max(1,Math.min(90,Number(req.query.days)||7));
 const oldest=new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10);
 const newest=new Date().toISOString().slice(0,10);
 const endpoint='https://intervals.icu/api/v1/athlete/0/activities?oldest='+oldest+'&newest='+newest;
 const upstream=await fetcher(endpoint,{headers:{Authorization:'Bearer '+integration.access_token,Accept:'application/json'}});
 if(!upstream.ok)return res.status(502).json({error:'Intervals.icu activity read failed',upstreamStatus:upstream.status});
 const entries=await upstream.json();
 if(!Array.isArray(entries))return res.status(502).json({error:'Unexpected upstream response'});
 const historyMode=req.query.mode==='history';
 const upstreamTypes=historyMode ? Object.entries(entries.reduce((counts:Record<string,number>,activity:any)=>{const type=String(activity.type??'unknown');counts[type]=(counts[type]??0)+1;return counts;},{})).map(([type,count])=>({type,count})) : [];
 const rides=entries.filter((a:any)=>historyMode ? ['ride','virtualride','indoorride','virtualcycling','run','virtualrun','treadmill','trailrun','trackrun','swim','poolswim','openwaterswim','openwaterswimming','swimming','lap swimming'.replace(/[^a-z]/g,'')].includes(String(a.type??'').toLowerCase().replace(/[^a-z]/g,'')) : ['ride','virtualride','indoorride','virtualcycling'].includes(String(a.type??'').toLowerCase().replace(/[^a-z]/g,'')));
 // Read-only review of existing activities; never change completion status here.
 const existingResponse=await fetcher(url+'/rest/v1/completed_activity?athlete_id=eq.'+encodeURIComponent(athlete.id)+'&start_time=gte.'+encodeURIComponent(oldest+'T00:00:00Z')+'&select=source,source_activity_id,sport,start_time,duration_sec,distance_m&limit=500',{headers});
 if(!existingResponse.ok)return res.status(502).json({error:'Could not perform duplicate review'});
 const existing=await existingResponse.json();
 const plannedResponse=await fetcher(url+'/rest/v1/planned_session?athlete_id=eq.'+encodeURIComponent(athlete.id)+'&planned_date=gte.'+oldest+'&planned_date=lte.'+newest+'&select=id,sport,title,planned_date,duration_min,status,is_active_version&limit=500',{headers});
 if(!plannedResponse.ok)return res.status(502).json({error:'Could not review planned sessions'});
 const plans=await plannedResponse.json();
 const sportFor=(a:any)=>/swim/i.test(String(a.type))?'swim':/run|treadmill/i.test(String(a.type))?'run':'bike';
 const historySummary=historyMode?(()=>{
  const accepted=rides.filter((a:any)=>Number.isFinite(Number(a.moving_time??a.elapsed_time))&&Number(a.moving_time??a.elapsed_time)>0&&Number.isFinite(Date.parse(a.start_date??a.start_date_local??'')));
  const weeks:Record<string,{week:string;swim:number;bike:number;run:number;total:number}>={};
  const sports={swim:{count:0,minutes:0,distanceKm:0,longestMinutes:0},bike:{count:0,minutes:0,distanceKm:0,longestMinutes:0},run:{count:0,minutes:0,distanceKm:0,longestMinutes:0}};
  let recentMinutes=0,previousMinutes=0;
  const now=Date.now();
  for(const a of accepted){
   const sport=sportFor(a) as 'swim'|'bike'|'run';
   const minutes=Number(a.moving_time??a.elapsed_time)/60;
   const distance=Number(a.distance);
   const date=new Date(a.start_date??a.start_date_local);
   const monday=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
   monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
   const week=monday.toISOString().slice(0,10);
   const row=weeks[week]??={week,swim:0,bike:0,run:0,total:0};
   row[sport]+=minutes;row.total+=minutes;
   sports[sport].count++;sports[sport].minutes+=minutes;
   if(Number.isFinite(distance)&&distance>=0)sports[sport].distanceKm+=distance/1000;
   sports[sport].longestMinutes=Math.max(sports[sport].longestMinutes,minutes);
   const age=now-date.getTime();
   if(age>=0&&age<28*86400000)recentMinutes+=minutes;
   else if(age>=28*86400000&&age<56*86400000)previousMinutes+=minutes;
  }
  return {activityCount:accepted.length,excludedCount:rides.length-accepted.length,sports,weekly:Object.values(weeks).sort((a,b)=>a.week.localeCompare(b.week)),recentFourWeekHours:Math.round(recentMinutes/60*10)/10,previousFourWeekHours:Math.round(previousMinutes/60*10)/10,source:'intervals.icu',readOnly:true};
 })():undefined;
 const assess=(a:any)=>reviewIntervalsActivity(a,existing,plans);
 res.setHeader('Cache-Control','private, no-store');
 return res.status(200).json({mode:historyMode?'history_preview_only':'preview_only',stagingEnabled:process.env.INTERVALS_STAGING_ENABLED==='true',acceptanceEnabled:process.env.INTERVALS_ACCEPTANCE_ENABLED==='true',loadValidationEnabled:process.env.INTERVALS_LOAD_VALIDATION_ENABLED==='true',dateRange:{oldest,newest},upstreamCount:historyMode?entries.length:undefined,upstreamTypes,historySummary,activities:rides.map((a:any)=>({sourceId:a.id,type:a.type,sport:/swim/i.test(String(a.type))?'swim':/run|treadmill/i.test(String(a.type))?'run':'bike',name:a.name,start:a.start_date_local,durationSec:a.moving_time??a.elapsed_time??null,distanceMeters:a.distance??null,averageWatts:a.icu_average_watts??a.average_watts??null,normalizedWatts:a.icu_weighted_avg_watts??null,origin:a.source??null,...assess(a)})),count:rides.length});
}
}
export default async function handler(req:any,res:any) {
 if(await proxyStagingImport(req,res,'activity-preview'))return;
 return createActivityPreviewHandler()(req,res);
}
