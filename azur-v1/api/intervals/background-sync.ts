import {assessBackgroundImport} from '../../src/lib/intervalsBackgroundImport.mjs';
/**
 * Cron-only, fail-closed Intervals sync. Records safe unmatched rides; never validates
 * training load or completes planned workouts. Requires a separately configured CRON_SECRET
 * and INTERVALS_BACKGROUND_IMPORT_ENABLED=true. Do not enable before staging QA.
 */
export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(401).json({error:'Unauthorized'});
 if(process.env.INTERVALS_BACKGROUND_IMPORT_ENABLED!=='true')return res.status(503).json({error:'Background import disabled'});
 const url=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:'Backend unavailable'});
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 const get=async(path:string)=>{const r=await fetch(url+'/rest/v1/'+path,{headers});if(!r.ok)throw Error('Database read failed');return r.json();};
 const rpc=async(name:string,body:object)=>{const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body)});if(!r.ok)throw Error('Import transaction failed');return (await r.json())?.[0];};
 const now=new Date(),newest=now.toISOString().slice(0,10),oldest=new Date(now.getTime()-3*86400000).toISOString().slice(0,10);
 let checked=0,recorded=0,review=0,errors=0;
 try{
  // Bounded batch; production rollout must monitor pagination/backlog.
  const integrations=await get('athlete_integration?provider=eq.intervals&select=athlete_id,access_token&limit=100');
  // Fail closed on truncated athlete batches rather than silently claiming full coverage.
  if(integrations.length===100) return res.status(503).json({error:'Integration pagination required before enabling for more than 99 connected accounts'});
  for(const integration of integrations){
   if(!integration?.access_token)continue;
   checked++;
   try{
    const upstream=await fetch('https://intervals.icu/api/v1/athlete/0/activities?oldest='+oldest+'&newest='+newest,{headers:{Authorization:'Bearer '+integration.access_token,Accept:'application/json'}});
    if(!upstream.ok)throw Error('Intervals read failed');
    const activities=await upstream.json();if(!Array.isArray(activities))throw Error('Unexpected activity data');
    const athleteId=encodeURIComponent(integration.athlete_id);
    const existing=await get('completed_activity?athlete_id=eq.'+athleteId+'&start_time=gte.'+encodeURIComponent(oldest+'T00:00:00Z')+'&select=source,source_activity_id,sport,start_time,duration_sec&limit=500');
    const planned=await get('planned_session?athlete_id=eq.'+athleteId+'&planned_date=gte.'+oldest+'&planned_date=lte.'+newest+'&select=id,sport,planned_date,status,is_active_version&limit=500');
    for(const a of activities.slice(0,100)){
     const decision=assessBackgroundImport(a,existing,planned);
     // Existing staging/acceptance RPCs are ride-only. Do not write swim/run
     // records using a bike-specific database function.
     if(decision.allowed && decision.sport!=='bike'){review++;continue;}
     if(!decision.allowed && !['planned_session_requires_review'].includes(decision.reason)){if(decision.reason!=='already_imported'&&decision.reason!=='unsupported_sport')review++;continue;}
     const duration=Number(a.elapsed_time??a.moving_time),distance=a.distance==null?null:Number(a.distance);
     const avg=a.icu_average_watts??a.average_watts??null,weighted=a.icu_weighted_avg_watts??null;
     if([distance,avg,weighted].some(v=>v!==null&&(!Number.isFinite(Number(v))||Number(v)<0))){review++;continue;}
     const staged=await rpc('stage_intervals_activity',{p_athlete_id:integration.athlete_id,p_source_id:String(a.id),p_start:a.start_date,p_duration:duration,p_distance:distance,p_avg_power:avg,p_normalized_power:weighted,p_source_payload:{source:'intervals',id:String(a.id),type:a.type,name:a.name,auto:true}});
     if(!staged?.stage_id||!['pending_review','already_staged'].includes(staged.outcome)){review++;continue;}
     if(!decision.allowed){review++;continue;}
     const accepted=await rpc('accept_staged_intervals_ride',{p_athlete_id:integration.athlete_id,p_stage_id:staged.stage_id,p_confirm:true});
     if(!accepted?.activity_id||!['already_imported','imported_pending_load_review'].includes(accepted.outcome))throw Error('Acceptance failed');
     if(accepted.outcome==='imported_pending_load_review'){recorded++;existing.push({source:'intervals',source_activity_id:String(a.id),sport:'bike',start_time:a.start_date,duration_sec:duration});}
    }
   }catch{errors++;}
  }
  return res.status(errors?207:200).json({checked,recorded,review,errors,loadValidated:false,plannedSessionsCompleted:false});
 }catch{return res.status(502).json({error:'Background sync unavailable'});}
}
