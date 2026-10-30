// Synthetic browser contract check; no real athlete account or upstream calls.
// Run against `npm run dev` with the placeholder Supabase URL/key documented below.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AZUR_PLAYWRIGHT_MODULE || 'playwright');
const launch={headless:true};
if(process.env.AZUR_CHROMIUM_MODULE){const loaded=require(process.env.AZUR_CHROMIUM_MODULE);const binary=loaded.default??loaded;launch.executablePath=process.env.AZUR_CHROMIUM_EXECUTABLE_PATH || await binary.executablePath();launch.args=binary.args;}
const browser=await chromium.launch(launch);
const base=process.env.AZUR_TEST_URL || 'http://127.0.0.1:5173';
const user={id:'00000000-0000-4000-8000-000000000011',aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const athlete='00000000-0000-4000-8000-000000000001';
const rideDay=new Date(Date.now()-86400000).toISOString().slice(0,10);
const rideStart=rideDay+'T06:49:22Z';
const stageId='00000000-0000-4000-8000-000000000099';
const activityId='00000000-0000-4000-8000-000000000098';
let staged=false,accepted=false,validated=false;
let profileFtp=250;
let missingProfile=false;
let onboardingStep=0;
const commands=[];
const errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
await context.addInitScript(({user})=>{
 localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-session-token',refresh_token:'synthetic-refresh-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user}));
},{user});
const metrics=()=>({load_status:validated?'validated':'pending_validation',...(validated?{training_stress:98,intensity_factor:0.936,load_validation_version:1,ftp_w_at_validation:250,normalized_power:234}:{})});
const recorded=()=>({id:activityId,athlete_id:athlete,source:'intervals',source_activity_id:'browser-ride',sport:'bike',start_time:rideStart,duration_sec:4026,distance_m:41840,planned_session_id:null,processed_metrics:metrics(),raw_payload:{}});
await context.route('https://example.supabase.co/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 const single=req.headers().accept?.includes('object+json');
 let data=single?null:[];
 if(url.pathname.startsWith('/auth/v1/')) data=user;
 else if(url.pathname.endsWith('/athlete_profile')) {
  const profile={id:athlete,user_id:user.id,display_name:'Synthetic Athlete',ftp_w:profileFtp};
  if(req.method()==='POST')missingProfile=false;
  data=missingProfile?(single?null:[]):(single?profile:[profile]);
 } else if(url.pathname.endsWith('/athlete_onboarding')) {
  if(req.method()==='POST')onboardingStep=req.postDataJSON().onboarding_step;
  data=single?null:[];
 } else if(url.pathname.endsWith('/completed_activity')) data=accepted?[recorded()]:[];
 const emptySingle=single&&data===null;
 await route.fulfill({status:emptySingle?406:200,contentType:'application/json',body:JSON.stringify(emptySingle?{code:'PGRST116',details:'The result contains 0 rows',message:'Cannot coerce the result to a single JSON object'}:data)});
});
await context.route('**/api/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;
 let data={};
 if(path.endsWith('/activity-preview')) data={stagingEnabled:true,acceptanceEnabled:true,loadValidationEnabled:true,activities:[{sourceId:'browser-ride',name:'Synthetic Zwift ride',start:rideStart.slice(0,-1),type:'VirtualRide',durationSec:4026,distanceMeters:41840,averageWatts:214,normalizedWatts:234,status:'unmatched_activity',alreadyImported:false,sessionCandidates:[]}]};
 if(req.method()==='POST') {
  const body=req.postDataJSON();commands.push({path,body});assert.equal(body.confirm,true);
  if(path.endsWith('/stage-activity')){staged=true;data={stageId,outcome:'pending_review',trainingLoadChanged:false,sessionCompleted:false};}
  if(path.endsWith('/accept-activity')){assert.equal(body.stageId,stageId);accepted=true;data={activityId,outcome:'imported_pending_load_review',trainingLoadChanged:false,sessionCompleted:false};}
  if(path.endsWith('/validate-load')){assert.equal(body.activityId,activityId);validated=true;data={activityId,outcome:'validated',trainingStress:98,trainingLoadChanged:true,sessionCompleted:false};}
 } else {
  if(path.endsWith('/accept-activity'))data={activities:staged?[{id:stageId,source_activity_id:'browser-ride',start_time:rideStart,duration_sec:4026,status:accepted?'reviewed':'pending_review'}]:[]};
  if(path.endsWith('/validate-load'))data={activities:accepted?[recorded()]:[]};
 }
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base);
 await page.getByRole('button',{name:'Data Sources',exact:true}).click();
 await page.getByRole('button',{name:'Preview rides',exact:true}).click();
 await page.getByText('Synthetic Zwift ride',{exact:true}).waitFor();
 // A token refresh reloads the parent profile. The open review must survive it.
 profileFtp=251;
 const profileRefresh=page.waitForResponse(response=>response.url().includes('/athlete_profile')&&response.url().includes('ftp_w'));
 await page.evaluate(()=>{
  const key='sb-example-auth-token';
  const channel=new BroadcastChannel(key);
  channel.postMessage({event:'TOKEN_REFRESHED',session:JSON.parse(localStorage.getItem(key))});
  setTimeout(()=>channel.close(),100);
 });
 await (await profileRefresh).finished();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.getByText('Synthetic Zwift ride',{exact:true}).count(),1,'Ride review must survive a parent profile refresh');
 await page.getByRole('button',{name:'Confirm ride for review',exact:true}).click();
 await page.getByRole('button',{name:'Confirm and record ride',exact:true}).click();
 await page.getByRole('button',{name:'Confirm training-load approval',exact:true}).click();
 await page.getByText('Approved · 98 stress points',{exact:true}).waitFor();
 assert.deepEqual(commands.map(c=>c.path),['/api/intervals/stage-activity','/api/intervals/accept-activity','/api/intervals/validate-load']);
 await page.getByRole('button',{name:'Weekly Review',exact:true}).click();
 await page.getByText('98',{exact:true}).first().waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: browser preview → stage → accept → load approval → dashboard, with no planned sessions');
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/onboarding');
 await page.getByRole('heading',{name:'Welcome to AZUR',exact:true}).waitFor();
 await page.getByRole('heading',{name:'Your training goal',exact:true}).waitFor();
 assert.equal(await page.locator('.sidebar').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: standalone mobile onboarding, no sidebar or horizontal overflow');
 missingProfile=true;
 await page.goto(base);
 await page.waitForURL('**/onboarding');
 await page.getByLabel('Your name',{exact:true}).fill('New Athlete');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('heading',{name:'Your training availability',exact:true}).waitFor();
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Review setup',exact:true}).click();
 await page.waitForURL(base+'/');
 assert.equal(missingProfile,false,'Profile must be created before leaving onboarding');
 assert.equal(onboardingStep,3,'Final onboarding step must be saved');
 await page.getByRole('button',{name:'Data Sources',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: signed-in athlete without profile → automatic onboarding → saved profile → dashboard');
} catch(error) {
 console.error('Browser page errors:',errors);
 console.error('Visible page:',(await page.locator('body').innerText()).slice(0,2500));
 throw error;
} finally {await browser.close();}
