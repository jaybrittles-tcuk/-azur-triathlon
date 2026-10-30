import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../api/intervals/validate-load.ts';
const activityId='00000000-0000-4000-8000-000000000099';
async function request(t,{method='POST',body={activityId,confirm:true},auth='Bearer athlete-session',enabled=true,replies=[]}={}) {
 const originalFetch=globalThis.fetch;
 const saved={...process.env};
 t.after(()=>{globalThis.fetch=originalFetch;process.env=saved;});
 process.env.INTERVALS_LOAD_VALIDATION_ENABLED=String(enabled);
 delete process.env.AZUR_STAGING_BACKEND_URL;
 process.env.VITE_SUPABASE_URL='https://example.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='server-secret';
 const calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push({url,options});
  const reply=replies.shift();
  assert.ok(reply,'Unexpected fetch');
  return {ok:reply.status<400,status:reply.status,json:async()=>reply.data};
 };
 const res={code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await handler({method,body,headers:{authorization:auth}},res);
 return {res,calls};
}
const identity=()=>[{status:200,data:{id:'authenticated-user'}},{status:200,data:[{id:'owned-athlete'}]}];
test('disabled handler makes no database or auth calls',async t=>{
 const {res,calls}=await request(t,{enabled:false});assert.equal(res.code,503);assert.equal(calls.length,0);
});
test('unsupported methods cannot write',async t=>{const {res,calls}=await request(t,{method:'DELETE'});assert.equal(res.code,405);assert.equal(calls.length,0);});
test('missing bearer cannot reach database',async t=>{const {res,calls}=await request(t,{auth:''});assert.equal(res.code,401);assert.equal(calls.length,0);});
test('expired session cannot reach profile or RPC',async t=>{const {res,calls}=await request(t,{replies:[{status:401}]});assert.equal(res.code,401);assert.equal(calls.length,1);});
test('confirmation must be a literal boolean',async t=>{const {res,calls}=await request(t,{body:{activityId,confirm:'true'},replies:identity()});assert.equal(res.code,400);assert.equal(calls.length,2);});
test('malformed activity id cannot reach RPC',async t=>{const {res,calls}=await request(t,{body:{activityId:'bad',confirm:true},replies:identity()});assert.equal(res.code,400);assert.equal(calls.length,2);});
test('load validation derives ownership from authenticated profile, ignoring client athlete and load fields',async t=>{
 const {res,calls}=await request(t,{body:{activityId,confirm:true,athleteId:'victim',loadStatus:'validated'},replies:[...identity(),{status:200,data:[{activity_id:'ride',outcome:'validated',training_stress:75}]}]});
 assert.equal(res.code,200);assert.equal(res.data.trainingLoadChanged,true);assert.equal(res.data.trainingStress,75);assert.equal(res.data.sessionCompleted,false);
 assert.deepEqual(JSON.parse(calls[2].options.body),{p_athlete_id:'owned-athlete',p_activity_id:activityId,p_confirm:true});
 assert.equal(calls[0].options.headers.Authorization,'Bearer athlete-session');
 assert.equal(JSON.stringify(res.data).includes('server-secret'),false);
});
test('transaction rejection remains a conflict with no success or internal detail leak',async t=>{const {res}=await request(t,{replies:[...identity(),{status:400,data:{message:'secret'}}]});assert.equal(res.code,409);assert.equal(JSON.stringify(res.data).includes('secret'),false);});
test('replayed load validation reports already validated with no load change',async t=>{const {res}=await request(t,{replies:[...identity(),{status:200,data:[{activity_id:'ride',outcome:'already_validated',training_stress:75}]}]});assert.equal(res.code,200);assert.equal(res.data.outcome,'already_validated');assert.equal(res.data.trainingLoadChanged,false);});
test('inbox read is scoped to server-resolved athlete',async t=>{const {res,calls}=await request(t,{method:'GET',replies:[...identity(),{status:200,data:[]}]});assert.equal(res.code,200);assert.ok(calls[2].url.includes('athlete_id=eq.owned-athlete'));assert.ok(calls[2].url.includes('source=eq.intervals'));assert.ok(!calls[2].url.includes('source_payload'));});
test('network exceptions return a retryable error',async t=>{const {res}=await request(t,{replies:[]});assert.equal(res.code,502);});

test('missing or malformed server stress cannot be reported as successful approval',async t=>{
 const {res}=await request(t,{replies:[...identity(),{status:200,data:[{activity_id:'ride',outcome:'validated',training_stress:'invalid'}]}]});
 assert.equal(res.code,502);
});
