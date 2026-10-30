import test from 'node:test';
import assert from 'node:assert/strict';
import {createStagingImportRouter} from '../../../src/lib/stagingImportRouter.ts';
import {proxyStagingImport} from '../../../src/lib/stagingImportProxy.ts';
const url='https://juvceqrzkeethontnezw.supabase.co';
const api=url+'/functions/v1/import-review';
const user=metadata=>({id:'signed-user',app_metadata:metadata});
function router(identity,factory,fetcher){return createStagingImportRouter({url,serviceKey:'server-only'},{'activity-preview':factory??(()=>async(_req,res)=>res.json({ok:true}))},fetcher??(async()=>new Response(JSON.stringify(identity))));}
const request=(path='activity-preview',options={})=>new Request(api+'/'+path,options);
test('router refuses another Supabase project',async()=>{const r=await createStagingImportRouter({url:'https://other.supabase.co',serviceKey:'x'},{ })(request('health'));assert.equal(r.status,503);});
test('public health reports staging only, never secrets',async()=>{const r=await router(null)(request('health'));assert.equal(r.status,200);assert.deepEqual(await r.json(),{environment:'azur-staging',status:'ready'});});
test('known data route requires bearer authentication',async()=>{const r=await router(user({}))(request());assert.equal(r.status,401);});
test('unknown routes cannot reach arbitrary handlers',async()=>{const r=await router(user({}))(request('connect'));assert.equal(r.status,404);});
test('rejected sessions cannot reach a handler',async()=>{const r=await router(null,null,async()=>new Response('{}',{status:401}))(request('activity-preview',{headers:{Authorization:'Bearer invalid'}}));assert.equal(r.status,401);});
test('server-approved synthetic user gets a scoped fixture from the upstream boundary',async()=>{
 const factory=fetcher=>async(_req,res)=>res.json(await (await fetcher('https://intervals.icu/api/v1/athlete/0/activities')).json());
 const r=await router(user({azur_staging_test:true}),factory)(request('activity-preview',{headers:{Authorization:'Bearer signed'}}));
 const rides=await r.json();assert.equal(rides[0].source,'synthetic_staging');assert.ok(rides[0].id.startsWith('azur-staging-signed-user-'));assert.equal(rides[0].icu_weighted_avg_watts,234);
});
test('user-controlled metadata cannot enable the synthetic provider',async()=>{
 let native=0;
 const fetcher=async(input)=>{if(String(input).includes('/auth/v1/user'))return new Response(JSON.stringify({id:'signed-user',app_metadata:{},user_metadata:{azur_staging_test:true}}));native++;return new Response('[]');};
 const factory=fetch=>async(_req,res)=>res.json(await (await fetch('https://intervals.icu/api/v1/athlete/0/activities')).json());
 const r=await router(null,factory,fetcher)(request('activity-preview',{headers:{Authorization:'Bearer signed'}}));assert.deepEqual(await r.json(),[]);assert.equal(native,1);
});
test('malformed JSON is rejected before invoking a handler',async()=>{const r=await router(user({}))(request('activity-preview',{method:'POST',headers:{Authorization:'Bearer signed'},body:'{bad'}));assert.equal(r.status,400);});
test('production handler path has no proxy unless explicitly configured',async t=>{
 const saved={...process.env};t.after(()=>{process.env=saved;});delete process.env.AZUR_STAGING_BACKEND_URL;
 assert.equal(await proxyStagingImport({}, {},'activity-preview'),false);
});
test('proxy refuses mixed staging frontend and production database configuration',async t=>{
 const saved={...process.env};t.after(()=>{process.env=saved;});process.env.AZUR_STAGING_BACKEND_URL=api;process.env.VITE_SUPABASE_URL='https://production.supabase.co';
 let status;const res={setHeader(){},status(v){status=v;return this;},json(){}};
 assert.equal(await proxyStagingImport({method:'GET'},res,'activity-preview'),true);assert.equal(status,503);
});
test('inherited object properties are not routes',async()=>{const r=await router(user({}))(request('constructor'));assert.equal(r.status,404);});
test('proxy forwards only the signed request to the fixed staging backend',async t=>{
 const saved={...process.env},original=globalThis.fetch;t.after(()=>{process.env=saved;globalThis.fetch=original;});
 process.env.AZUR_STAGING_BACKEND_URL=api;process.env.VITE_SUPABASE_URL=url;
 let call,status,body;
 globalThis.fetch=async(target,options)=>{call={target:String(target),options};return new Response('{"outcome":"already_validated"}');};
 const res={setHeader(){},status(value){status=value;return this;},json(value){body=value;}};
 await proxyStagingImport({method:'POST',headers:{authorization:'Bearer signed-user'},body:{activityId:'owned',confirm:true},query:{}},res,'validate-load');
 assert.equal(call.target,api+'/validate-load');assert.equal(call.options.headers.Authorization,'Bearer signed-user');assert.deepEqual(JSON.parse(call.options.body),{activityId:'owned',confirm:true});assert.equal(status,200);assert.equal(body.outcome,'already_validated');
});
