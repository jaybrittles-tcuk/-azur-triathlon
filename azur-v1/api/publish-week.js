import {createClient} from '@supabase/supabase-js';
// Vercel server function. Never expose the service key to the browser.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
 const origin=req.headers.origin;
 const expected=process.env.AZUR_PUBLISH_ALLOWED_ORIGIN;
 if(!expected||!origin||origin!==expected)return res.status(403).json({error:'Origin not allowed'});
 if(process.env.AZUR_WEEK_PUBLISH_ENABLED!=='true')return res.status(503).json({error:'Weekly publishing is disabled'});
 const url=process.env.SUPABASE_URL;const anon=process.env.SUPABASE_ANON_KEY;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!key)return res.status(503).json({error:'Publisher not configured'});
 const token=(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
 if(!token)return res.status(401).json({error:'Authentication required'});
 const draftId=req.body?.draftId;
 const mode=req.body?.mode;
 if(typeof draftId!=='string'||!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(draftId)||!['full','additive'].includes(mode))
  return res.status(400).json({error:'Valid draft and publishing mode required'});
 try{
  const userClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await userClient.auth.getUser(token);
  if(authError||!user||user.app_metadata?.role!=='coach')return res.status(403).json({error:'Verified coach role required'});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:draft,error:de}=await admin.from('weekly_plan_draft').select('id,athlete_id,week_start').eq('id',draftId).single();
  if(de||!draft)return res.status(404).json({error:'Draft not found'});
  const {data:assignment,error:ae}=await admin.from('coach_athlete_assignment').select('athlete_id').eq('athlete_id',draft.athlete_id).eq('coach_user_id',user.id).maybeSingle();
  if(ae||!assignment)return res.status(403).json({error:'Coach not assigned to athlete'});
  const rpc=mode==='additive'?'publish_verified_additive_week':'publish_verified_weekly_draft';
  const {data,error}=await admin.rpc(rpc,{p_draft_id:draftId});
  if(error)return res.status(409).json({error:'Publication denied by database validation'});
  return res.status(200).json({result:data});
 }catch{return res.status(500).json({error:'Publication failed'});}
}
