// Staging-only HTTP adapter around the same import handlers used by the app.
const STAGING_URL='https://juvceqrzkeethontnezw.supabase.co';
type Handler=(req:any,res:any)=>Promise<unknown>;
type Factory=(fetcher:typeof fetch)=>Handler;
export function createStagingImportRouter(config:{url:string;serviceKey:string},factories:Record<string,Factory>,fetcher:typeof fetch=globalThis.fetch) {
 return async(request:Request):Promise<Response>=>{
  const headers=new Headers({'Content-Type':'application/json','Cache-Control':'private, no-store','CDN-Cache-Control':'no-store'});
  const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
  if(config.url!==STAGING_URL||!config.serviceKey)return reply(503,{error:'Staging backend target mismatch'});
  const url=new URL(request.url),action=url.pathname.split('/').filter(Boolean).at(-1)??'';
  if(action==='health'&&request.method==='GET')return reply(200,{environment:'azur-staging',status:'ready'});
  const factory=Object.hasOwn(factories,action)?factories[action]:undefined;
  if(!factory)return reply(404,{error:'Staging route not found'});
  if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method not allowed'});
  const authorization=request.headers.get('Authorization')??'';
  if(!authorization.startsWith('Bearer '))return reply(401,{error:'Sign in required'});
  try {
   const checked=await fetcher(config.url+'/auth/v1/user',{headers:{apikey:config.serviceKey,Authorization:authorization}});
   if(!checked.ok)return reply(401,{error:'Invalid session'});
   const user=await checked.json();
   if(typeof user?.id!=='string'||!user.id)return reply(401,{error:'Invalid session'});
   // This switch is server-controlled Auth app_metadata, never user_metadata or request data.
   const synthetic=user.app_metadata?.azur_staging_test===true;
   const requestFetch:typeof fetch=async(input,init)=>{
    const upstream=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if(synthetic&&upstream.origin==='https://intervals.icu'&&upstream.pathname==='/api/v1/athlete/0/activities') {
     const day=new Date(Date.now()-86400000).toISOString().slice(0,10);
     return new Response(JSON.stringify([{id:'azur-staging-'+user.id+'-'+day,name:'AZUR STAGING — synthetic Zwift ride',type:'VirtualRide',source:'synthetic_staging',start_date:day+'T06:49:22Z',start_date_local:day+'T06:49:22',elapsed_time:4026,moving_time:4026,distance:41840,icu_average_watts:214,icu_weighted_avg_watts:234}]),{headers:{'Content-Type':'application/json'}});
    }
    return fetcher(input,init);
   };
   let body;
   if(request.method==='POST') {
    if(Number(request.headers.get('content-length')??0)>8192)return reply(413,{error:'Request too large'});
    const text=await request.text();
    if(text.length>8192)return reply(413,{error:'Request too large'});
    try{body=JSON.parse(text||'{}');}catch{return reply(400,{error:'Invalid JSON'});}
   }
   let status=200,response:Response|null=null;
   const res={
    setHeader(key:string,value:string){headers.set(key,value);},
    status(value:number){status=value;return this;},
    json(data:unknown){response=reply(status,data);return this;},
   };
   await factory(requestFetch)({method:request.method,headers:{authorization},body,query:Object.fromEntries(url.searchParams)},res);
   return response??reply(502,{error:'Staging handler returned no response'});
  }catch{return reply(502,{error:'Staging request unavailable'});}
 };
}
