const redirectUri='https://azur-triathlon.vercel.app/api/intervals/callback';
export default async function handler(req:any,res:any){
 if(req.method!=='GET')return res.status(405).send('Method not allowed');
 const code=typeof req.query.code==='string'?req.query.code:null;
 const state=typeof req.query.state==='string'?req.query.state:null;
 if(!code||!state)return res.status(400).send('Intervals authorisation was not completed');
 const url=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const clientId=process.env.INTERVALS_CLIENT_ID,clientSecret=process.env.INTERVALS_CLIENT_SECRET;
 if(!url||!key||!clientId||!clientSecret)return res.status(503).send('Intervals integration not configured');
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 const query=url+'/rest/v1/intervals_oauth_state?state=eq.'+encodeURIComponent(state)+'&select=id,athlete_id,code_verifier,expires_at&limit=1';
 const stateResult=await fetch(query,{headers});
 if(!stateResult.ok)return res.status(502).send('Authorisation state lookup failed');
 const record=(await stateResult.json())?.[0];
 if(!record||Date.parse(record.expires_at)<Date.now())return res.status(400).send('Authorisation expired; please reconnect from AZUR');
 // Consume the state before exchanging the token to prevent replay.
 const deleted=await fetch(url+'/rest/v1/intervals_oauth_state?id=eq.'+encodeURIComponent(record.id),{method:'DELETE',headers});
 if(!deleted.ok)return res.status(502).send('Could not consume authorisation state');
 const tokenResponse=await fetch('https://intervals.icu/api/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,code_verifier:record.code_verifier,redirect_uri:redirectUri})});
 if(!tokenResponse.ok)return res.status(502).send('Intervals authorisation failed');
 const tokens=await tokenResponse.json();
 if(!tokens?.access_token||!tokens?.athlete?.id)return res.status(502).send('Intervals returned incomplete authorisation data');
 const save=await fetch(url+'/rest/v1/athlete_integration?on_conflict=athlete_id,provider',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({athlete_id:record.athlete_id,provider:'intervals',provider_athlete_id:String(tokens.athlete.id),access_token:tokens.access_token,scopes:tokens.scope??'ACTIVITY:READ',connected_at:new Date().toISOString()})});
 if(!save.ok)return res.status(502).send('Unable to securely save the Intervals connection');
 res.setHeader('Cache-Control','no-store');
 return res.redirect(302,'https://azur-triathlon.vercel.app/?intervals=connected');
}
