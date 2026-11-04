import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntervalPreviewHandler} from '../../../api/intervals/interval-preview.ts';

const id='00000000-0000-4000-8000-000000000099';
function mock(reply){return {ok:reply.status<400,status:reply.status,
 headers:{get:()=>null},json:async()=>reply.data};}
async function run(t,{enabled=true,method='GET',auth='Bearer athlete-session',activityId=id,replies=[]}={}){
 const env={...process.env};
 t.after(()=>{process.env=env});
 process.env.AZUR_INTERVAL_DETAIL_PREVIEW_ENABLED=String(enabled);
 process.env.VITE_SUPABASE_URL='https://example.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='private-server-key';
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url:String(url),options});const reply=replies.shift();
  assert.ok(reply,'Unexpected provider or database call: '+url);return mock(reply);
 };
 const res={code:0,headers:{},setHeader(k,v){this.headers[k]=v;},
  status(code){this.code=code;return this},json(data){this.data=data;return this}};
 await createIntervalPreviewHandler(fetcher)({method,headers:{authorization:auth},query:{activityId}},res);
 return {res,calls};
}
const auth=()=>[
 {status:200,data:{id:'auth-user'}},
 {status:200,data:[{id:'owned-athlete'}]}
];
const valid=()=>[
 ...auth(),
 {status:200,data:[{id,source_activity_id:'i123',sport:'bike',processed_metrics:{load_status:'validated',load_validation_version:1}}]},
 {status:200,data:[{access_token:'provider-private-token'}]},
 {status:200,data:{id:'i123',icu_intervals:[{type:'WORK',start_time:0,end_time:900,elapsed_time:900,average_watts:200,average_heartrate:140}]}}
];
test('disabled preview does not read auth, db or provider',async t=>{
 const {res,calls}=await run(t,{enabled:false});assert.equal(res.code,503);assert.equal(calls.length,0);
});
test('only GET supported',async t=>{
 const {res,calls}=await run(t,{method:'POST'});assert.equal(res.code,405);assert.equal(calls.length,0);
});
test('missing signed-in bearer is denied before any read',async t=>{
 const {res,calls}=await run(t,{auth:''});assert.equal(res.code,401);assert.equal(calls.length,0);
});
test('invalid and attacker-supplied activity ID rejected',async t=>{
 const {res,calls}=await run(t,{activityId:'victim-id'});assert.equal(res.code,400);assert.equal(calls.length,0);
});
test('missing owned activity never reaches provider token read',async t=>{
 const {res,calls}=await run(t,{replies:[...auth(),{status:200,data:[]}]});
 assert.equal(res.code,404);assert.equal(calls.length,3);
});
test('pending, rejected, and fake activity are excluded from detail fetch',async t=>{
 const records=[{id,source_activity_id:'i123',sport:'bike',processed_metrics:{load_status:'pending_validation',load_validation_version:1}}];
 const {res,calls}=await run(t,{replies:[...auth(),{status:200,data:records}]});
 assert.equal(res.code,409);assert.equal(calls.length,3);
});
test('read-only authenticated detail returns bounded intervals without token or raw upstream body',async t=>{
 const {res,calls}=await run(t,{replies:valid()});
 assert.equal(res.code,200);assert.equal(res.data.mode,'read_only');
 assert.equal(res.data.status,'provider_intervals_available');
 assert.equal(res.data.intervals.length,1);assert.equal(res.data.execution_verifiable,false);
 assert.equal(res.data.sessionCompleted,false);assert.equal(res.data.calendarChanged,false);
 assert.equal(res.data.trainingLoadChanged,false);
 assert.equal(calls.length,5);
 assert.ok(calls[2].url.includes('athlete_id=eq.owned-athlete'));
 assert.equal(calls[4].url,'https://intervals.icu/api/v1/activity/i123?intervals=true');
 assert.ok(calls.every(c=>!c.options?.method || c.options.method==='GET'));
 assert.ok(!JSON.stringify(res.data).includes('provider-private-token'));
 assert.ok(!JSON.stringify(res.data).includes('private-server-key'));
});
test('upstream id mismatch is nonverifiable, never reported as successful execution',async t=>{
 const replies=valid();replies[4].data.id='i999';
 const {res}=await run(t,{replies});
 assert.equal(res.code,200);assert.equal(res.data.status,'unavailable');
});

test('staging proxy requires correct Supabase project and never uses Vercel service key',async t=>{
 const saved={...process.env};
 t.after(()=>{process.env=saved});
 process.env.AZUR_STAGING_BACKEND_URL='https://juvceqrzkeethontnezw.supabase.co/functions/v1/import-review';
 process.env.VITE_SUPABASE_URL='https://juvceqrzkeethontnezw.supabase.co';
 delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url:String(url),options});
  return mock({status:200,data:{mode:'read_only',activityId:id,status:'unavailable'}});
 };
 const res={code:0,setHeader(){},status(n){this.code=n;return this;},json(x){this.data=x;return this;}};
 await createIntervalPreviewHandler(fetcher)({method:'GET',headers:{authorization:'Bearer coach-token'},query:{activityId:id}},res);
 assert.equal(res.code,200);assert.equal(calls.length,1);
 assert.ok(calls[0].url.includes('/functions/v1/interval-evidence-preview?activityId='));
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer coach-token');
});
test('staging proxy rejects project mismatch before any provider read',async t=>{
 const saved={...process.env};
 t.after(()=>{process.env=saved});
 process.env.AZUR_STAGING_BACKEND_URL='https://juvceqrzkeethontnezw.supabase.co/functions/v1/import-review';
 process.env.VITE_SUPABASE_URL='https://another-project.supabase.co';
 let reads=0;
 const res={code:0,setHeader(){},status(n){this.code=n;return this;},json(x){this.data=x;return this;}};
 await createIntervalPreviewHandler(async()=>{reads++;throw Error('should not fetch')})({method:'GET',headers:{authorization:'Bearer coach-token'},query:{activityId:id}},res);
 assert.equal(res.code,503);assert.equal(reads,0);
});
