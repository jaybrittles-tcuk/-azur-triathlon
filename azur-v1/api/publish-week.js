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
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))return res.status(503).json({error:'Invalid Supabase configuration'});
 const token=(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
 if(!token)return res.status(401).json({error:'Authentication required'});
 const draftId=req.body?.draftId;
 const mode=req.body?.mode;
 if(typeof draftId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draftId)||!['full','additive'].includes(mode))
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
  // Never invoke a publisher until the requested revision has a current,
  // assigned-coach approval and its week has been verified safe to modify.
  const {data:latest,error:latestError}=await admin.from('weekly_plan_draft').select('id,revision').eq('athlete_id',draft.athlete_id).eq('week_start',draft.week_start).order('revision',{ascending:false}).limit(1);
  if(latestError||latest?.[0]?.id!==draftId)return res.status(409).json({error:'A newer draft exists. Review the latest revision.'});
  const {data:decisions,error:decisionError}=await admin.from('weekly_plan_decision').select('decision,coach_user_id').eq('draft_id',draftId).order('decided_at',{ascending:false}).limit(1);
  if(decisionError||decisions?.[0]?.decision!=='approved'||decisions?.[0]?.coach_user_id!==user.id)return res.status(409).json({error:'Latest decision must approve this draft by the assigned coach'});
  const sunday=new Date(draft.week_start+'T12:00:00Z');sunday.setUTCDate(sunday.getUTCDate()+6);
  const {data:existing,error:existingError}=await admin.from('planned_session').select('id,status,locked').eq('athlete_id',draft.athlete_id).eq('is_active_version',true).gte('planned_date',draft.week_start).lte('planned_date',sunday.toISOString().slice(0,10));
  if(existingError)return res.status(503).json({error:'Unable to verify existing sessions'});
  if(existing?.some(s=>s.locked||s.status!=='planned'))return res.status(409).json({error:'Completed, locked or edited sessions require separate reconciliation'});
  if(mode==='full'&&existing?.length)return res.status(409).json({error:'Full publication blocked: existing sessions must be reconciled, not overwritten'});
  const rpc=mode==='additive'?'publish_verified_additive_week':'publish_verified_weekly_draft';
  const {data,error}=await admin.rpc(rpc,{p_draft_id:draftId});
  if(error)return res.status(409).json({error:'Publication denied by database validation'});
  return res.status(200).json({result:data});
 }catch{return res.status(500).json({error:'Publication failed'});}
}
