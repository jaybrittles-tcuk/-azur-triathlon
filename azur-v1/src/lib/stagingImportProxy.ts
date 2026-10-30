// A narrowly scoped bridge for the separate staging web project.
// The live project has no AZUR_STAGING_BACKEND_URL and keeps its normal handlers.
export async function proxyStagingImport(req:any,res:any,action:string) {
 const backend=process.env.AZUR_STAGING_BACKEND_URL;
 if(!backend) return false;
 res.setHeader('Cache-Control','private, no-store');
 if(backend!=='https://juvceqrzkeethontnezw.supabase.co/functions/v1/import-review'||
    process.env.VITE_SUPABASE_URL!=='https://juvceqrzkeethontnezw.supabase.co') {
  res.status(503).json({error:'Staging target mismatch'});return true;
 }
 if(!['GET','POST'].includes(req.method)){res.status(405).json({error:'Method not allowed'});return true;}
 try {
  const target=new URL(backend+'/'+action);
  if(req.query?.days!=null)target.searchParams.set('days',String(req.query.days));
  const response=await fetch(target,{method:req.method,headers:{Authorization:String(req.headers.authorization??''),'Content-Type':'application/json'},...(req.method==='POST'?{body:JSON.stringify(req.body??{})}:{})});
  const data=await response.json();
  res.status(response.status).json(data);
 } catch {res.status(502).json({error:'Staging API unavailable'});}
 return true;
}
