import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../api/intervals/stage-activity.ts';
const sourceId='zwift-authorised';
const ride=()=>({id:sourceId,type:'VirtualRide',start_date:'2026-10-29T06:49:22Z',start_date_local:'2026-10-29T06:49:22',elapsed_time:4026,distance:41840,icu_average_watts:214,icu_weighted_avg_watts:234});
const verified=(activity=ride(),existing=[],plans=[])=>[
 {status:200,data:{id:'signed-in-user'}},
 {status:200,data:[{id:'owned-athlete'}]},
 {status:200,data:[{access_token:'private-upstream-token'}]},
 {status:200,data:[activity]},
 {status:200,data:existing},
 {status:200,data:plans},
];
async function request(t,{method='POST',auth='Bearer user-session',body={sourceId,confirm:true},enabled=true,replies=verified()}={}) {
 const originalFetch=globalThis.fetch,saved={...process.env};
 t.after(()=>{globalThis.fetch=originalFetch;process.env=saved;});
 process.env.INTERVALS_STAGING_ENABLED=String(enabled);
 delete process.env.AZUR_STAGING_BACKEND_URL;
 process.env.VITE_SUPABASE_URL='https://example.invalid';
 process.env.SUPABASE_SERVICE_ROLE_KEY='server-secret';
 const calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push({url,options});const r=replies.shift();
  if(r?.throw)throw Error('private network detail');
  assert.ok(r,'Unexpected request');return {ok:r.status<400,status:r.status,json:async()=>r.data};
 };
 const res={code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await handler({method,body,headers:{authorization:auth}},res);
 return {res,calls};
}
test('staging stays disabled without any network calls',async t=>{const {res,calls}=await request(t,{enabled:false});assert.equal(res.code,503);assert.equal(calls.length,0);});
test('GET cannot stage a ride',async t=>{const {res,calls}=await request(t,{method:'GET'});assert.equal(res.code,405);assert.equal(calls.length,0);});
test('missing sign-in cannot stage a ride',async t=>{const {res,calls}=await request(t,{auth:''});assert.equal(res.code,401);assert.equal(calls.length,0);});
test('expired sign-in cannot reach athlete data',async t=>{const {res,calls}=await request(t,{replies:[{status:401}]});assert.equal(res.code,401);assert.equal(calls.length,1);});
test('auth network errors are handled without leaking details',async t=>{const {res}=await request(t,{replies:[{throw:true}]});assert.equal(res.code,502);assert.equal(JSON.stringify(res.data).includes('private'),false);});
test('malformed auth identity cannot reach the profile lookup',async t=>{const {res,calls}=await request(t,{replies:[{status:200,data:{}}]});assert.equal(res.code,401);assert.equal(calls.length,1);});
test('literal confirmation is required before retrieving upstream data',async t=>{const {res,calls}=await request(t,{body:{sourceId,confirm:'true'}});assert.equal(res.code,400);assert.equal(calls.length,2);});
test('source must exist in the authorised upstream account',async t=>{const replies=verified();replies[3].data=[];const {res,calls}=await request(t,{replies});assert.equal(res.code,404);assert.equal(calls.length,4);});
test('cross-platform duplicate cannot reach the staging transaction',async t=>{const {res,calls}=await request(t,{replies:verified(ride(),[{source:'garmin',source_activity_id:'garmin-one',sport:'bike',start_time:'2026-10-29T06:49:22Z',duration_sec:4026,distance_m:41840}])});assert.equal(res.code,409);assert.equal(calls.length,6);});
test('candidate requires the verified planned-session confirmation',async t=>{const plans=[{id:'owned-plan',sport:'bike',planned_date:'2026-10-29',duration_min:67,status:'planned',is_active_version:true}];const {res,calls}=await request(t,{body:{sourceId,confirm:true,plannedSessionId:'different-plan'},replies:verified(ride(),[],plans)});assert.equal(res.code,409);assert.equal(calls.length,6);});
test('invalid upstream power cannot be stored',async t=>{const {res,calls}=await request(t,{replies:verified({...ride(),icu_weighted_avg_watts:'NaN'})});assert.equal(res.code,422);assert.equal(calls.length,6);});
test('staging uses server athlete and original metrics, ignoring client values',async t=>{
 const {res,calls}=await request(t,{body:{sourceId,confirm:true,athleteId:'victim',durationSec:999,normalizedPower:999,source_payload:{fake:true}},replies:[...verified(),{status:200,data:[{stage_id:'staged-uuid',outcome:'pending_review'}]}]});
 assert.equal(res.code,200);assert.equal(res.data.trainingLoadChanged,false);assert.equal(res.data.sessionCompleted,false);assert.equal(res.data.stageId,'staged-uuid');
 const params=JSON.parse(calls[6].options.body);
 assert.equal(params.p_athlete_id,'owned-athlete');assert.equal(params.p_duration,4026);assert.equal(params.p_normalized_power,234);assert.equal(params.p_source_payload.fake,undefined);
 assert.equal(calls[3].options.headers.Authorization,'Bearer private-upstream-token');
 assert.equal(JSON.stringify(res.data).includes('private-upstream-token'),false);
});
test('staging replay returns the same inbox identity without claiming import',async t=>{const {res}=await request(t,{replies:[...verified(),{status:200,data:[{stage_id:'staged-uuid',outcome:'already_staged'}]}]});assert.equal(res.code,200);assert.equal(res.data.outcome,'already_staged');assert.equal(res.data.stage,'review_inbox_only');});
test('empty transaction response cannot be reported as successful staging',async t=>{const {res}=await request(t,{replies:[...verified(),{status:200,data:[]}]});assert.equal(res.code,502);});
test('transaction failure is reported without confirming a staged ride',async t=>{const {res}=await request(t,{replies:[...verified(),{status:500,data:{message:'private'}}]});assert.equal(res.code,502);assert.equal(res.data.stageId,undefined);});
