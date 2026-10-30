import {intervalsOAuthTarget} from '../../src/lib/intervalsOAuthTarget.ts';
export function createCallbackHandler(fetcher:typeof fetch=globalThis.fetch) {
 return async function handler(req:any,res:any){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('Referrer-Policy','no-referrer');
 try {
 if(req.method!=='GET')return res.status(405).send('Method not allowed');
 const target=intervalsOAuthTarget();
 if(!target)return res.status(503).send('Intervals environment mismatch');
 const redirectUri=target.callback;
 const code=typeof req.query.code==='string'?req.query.code:null;
 const state=typeof req.query.state==='string'?req.query.state:null;
 if(!code||code.length>4096||!state||!/^[A-Za-z0-9_-]{43}$/.test(state))return res.status(400).send('Intervals authorisation was not completed');
 const url=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const clientId=process.env.INTERVALS_CLIENT_ID,clientSecret=process.env.INTERVALS_CLIENT_SECRET;
 if(!url||!key||!clientId||!clientSecret)return res.status(503).send('Intervals integration not configured');
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 // Atomically consume the one-time state. Two simultaneous callbacks cannot reuse it.
 const stateQuery=url+'/rest/v1/intervals_oauth_state?state=eq.'+encodeURIComponent(state)+'&select=athlete_id,code_verifier,expires_at';
 const stateResult=await fetcher(stateQuery,{method:'DELETE',headers:{...headers,Prefer:'return=representation'}});
 if(!stateResult.ok)return res.status(502).send('Authorisation state lookup failed');
 const record=(await stateResult.json())?.[0];
 if(!record||!Number.isFinite(Date.parse(record.expires_at))||Date.parse(record.expires_at)<=Date.now())
   return res.status(400).send('Authorisation expired or already used; please reconnect from AZUR');
 const tokenResponse=await fetcher('https://intervals.icu/api/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,client_secret:clientSecret,code,code_verifier:record.code_verifier,redirect_uri:redirectUri})});
 if(!tokenResponse.ok)return res.status(502).send('Intervals authorisation failed');
 const tokens=await tokenResponse.json();
 if(typeof tokens?.access_token!=='string'||!tokens.access_token||!tokens?.athlete?.id)return res.status(502).send('Intervals returned incomplete authorisation data');
 const save=await fetcher(url+'/rest/v1/athlete_integration?on_conflict=athlete_id,provider',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({athlete_id:record.athlete_id,provider:'intervals',provider_athlete_id:String(tokens.athlete.id),access_token:tokens.access_token,scopes:tokens.scope??'ACTIVITY:READ',connected_at:new Date().toISOString()})});
 if(!save.ok)return res.status(502).send('Unable to securely save the Intervals connection');
 res.setHeader('Cache-Control','private, no-store');
 return res.redirect(302,target.origin+'/?intervals=connected');
 } catch {return res.status(502).send('Intervals authorisation unavailable');}
 };
}
export default createCallbackHandler();
