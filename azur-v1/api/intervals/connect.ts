import crypto from 'node:crypto';

const origin = 'https://azur-triathlon.vercel.app';
const endpoint = origin + '/api/intervals/callback';
const supaHeaders = (key: string) => ({apikey:key, Authorization:'Bearer '+key, 'Content-Type':'application/json'});
export default async function handler(req:any,res:any) {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const clientId=process.env.INTERVALS_CLIENT_ID;
  const supaUrl=process.env.VITE_SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!clientId||!supaUrl||!serviceKey) return res.status(503).json({error:'Intervals integration not configured'});
  const bearer=String(req.headers.authorization||'');
  if(!bearer.startsWith('Bearer ')) return res.status(401).json({error:'Sign in required'});
  const userResponse=await fetch(supaUrl+'/auth/v1/user',{headers:{apikey:serviceKey,Authorization:bearer}});
  if(!userResponse.ok)return res.status(401).json({error:'Invalid session'});
  const user=await userResponse.json();
  const athleteResponse=await fetch(supaUrl+'/rest/v1/athlete_profile?user_id=eq.'+encodeURIComponent(user.id)+'&select=id&limit=1',{headers:supaHeaders(serviceKey)});
  if(!athleteResponse.ok)return res.status(502).json({error:'Athlete lookup failed'});
  const athlete=(await athleteResponse.json())?.[0];
  if(!athlete?.id)return res.status(404).json({error:'Athlete profile not found'});
  const verifier=crypto.randomBytes(48).toString('base64url');
  const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  const state=crypto.randomBytes(32).toString('base64url');
  const saved=await fetch(supaUrl+'/rest/v1/intervals_oauth_state',{method:'POST',headers:supaHeaders(serviceKey),body:JSON.stringify({athlete_id:athlete.id,state,code_verifier:verifier,expires_at:new Date(Date.now()+10*60_000).toISOString()})});
  if(!saved.ok)return res.status(502).json({error:'Could not begin secure authorisation'});
  const url=new URL('https://intervals.icu/oauth/authorize');
  url.searchParams.set('client_id',clientId);
  url.searchParams.set('redirect_uri',endpoint);
  url.searchParams.set('scope','ACTIVITY:READ');
  url.searchParams.set('state',state);
  url.searchParams.set('code_challenge',challenge);
  url.searchParams.set('code_challenge_method','S256');
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({authorizationUrl:url.toString()});
}
