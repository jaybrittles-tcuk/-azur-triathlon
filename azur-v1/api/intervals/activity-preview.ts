// Read-only preflight: no athlete activities are written or plans altered.
export default async function handler(req:any,res:any){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const url=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:'Backend configuration unavailable'});
 const bearer=String(req.headers.authorization||'');
 if(!bearer.startsWith('Bearer '))return res.status(401).json({error:'Sign in to AZUR'});
 const userReq=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:bearer}});
 if(!userReq.ok)return res.status(401).json({error:'Invalid session'});
 const user=await userReq.json();
 const headers={apikey:key,Authorization:'Bearer '+key};
 const athleteReq=await fetch(url+'/rest/v1/athlete_profile?user_id=eq.'+encodeURIComponent(user.id)+'&select=id&limit=1',{headers});
 if(!athleteReq.ok)return res.status(502).json({error:'Athlete lookup unavailable'});
 const athlete=(await athleteReq.json())?.[0];
 if(!athlete)return res.status(404).json({error:'Athlete profile not found'});
 const integrationReq=await fetch(url+'/rest/v1/athlete_integration?athlete_id=eq.'+encodeURIComponent(athlete.id)+'&provider=eq.intervals&select=access_token&limit=1',{headers});
 if(!integrationReq.ok)return res.status(502).json({error:'Integration lookup unavailable'});
 const integration=(await integrationReq.json())?.[0];
 if(!integration?.access_token)return res.status(409).json({error:'Intervals.icu approval and athlete authorisation required'});
 const days=Math.max(1,Math.min(31,Number(req.query.days)||7));
 const oldest=new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10);
 const newest=new Date().toISOString().slice(0,10);
 const endpoint='https://intervals.icu/api/v1/athlete/0/activities?oldest='+oldest+'&newest='+newest+'&limit=100';
 const upstream=await fetch(endpoint,{headers:{Authorization:'Bearer '+integration.access_token,Accept:'application/json'}});
 if(!upstream.ok)return res.status(502).json({error:'Intervals.icu activity read failed',upstreamStatus:upstream.status});
 const entries=await upstream.json();
 if(!Array.isArray(entries))return res.status(502).json({error:'Unexpected upstream response'});
 const rides=entries.filter((a:any)=>['Ride','VirtualRide','IndoorRide','VirtualCycling'].includes(String(a.type)));
 res.setHeader('Cache-Control','private, no-store');
 return res.status(200).json({mode:'preview_only',dateRange:{oldest,newest},activities:rides.map((a:any)=>({sourceId:a.id,type:a.type,name:a.name,start:a.start_date_local,durationSec:a.moving_time??a.elapsed_time??null,distanceMeters:a.distance??null,averageWatts:a.average_watts??null,origin:a.source??null})),count:rides.length});
}
