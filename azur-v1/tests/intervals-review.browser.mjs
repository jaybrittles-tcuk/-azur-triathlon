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
let demoSessions=[];
let missingProfile=false;
let onboardingStep=3,onboardingSavedFields={};
const commands=[];
const errors=[];
let coachDebugPage=null;
const monitoringReceipts=[];
let pilot=false,invitationAccepted=false,coachPlan=null,manualActivity=null,athleteFeedback=null;
const pilotSession='b3730000-0000-4000-8000-000000000001';
const invitation={id:'b3720000-0000-4000-8000-000000000001',invitee_email:user.email,coach_user_id:'b3700000-0000-4000-8000-000000000001',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),accepted_at:null,email_sent_at:null};

const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
await context.addInitScript(({user})=>{
 localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'synthetic-session-token',refresh_token:'synthetic-refresh-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user}));
},{user});
const metrics=()=>({load_status:validated?'validated':'pending_validation',...(validated?{training_stress:98,intensity_factor:0.936,load_validation_version:1,ftp_w_at_validation:250,normalized_power:234}:{})});
const recorded=()=>({id:activityId,athlete_id:athlete,source:'intervals',source_activity_id:'browser-ride',sport:'bike',start_time:rideStart,duration_sec:4026,distance_m:41840,planned_session_id:null,processed_metrics:metrics(),raw_payload:{}});
const mockSupabase=async (route,coach=false)=>{
 const req=route.request(),url=new URL(req.url());
 const single=req.headers().accept?.includes('object+json');
 let data=single?null:[];
 if(pilot){
  const identity=coach?{...user,id:invitation.coach_user_id,app_metadata:{role:'coach'}}:user;
  if(url.pathname.startsWith('/auth/v1/'))data=identity;
  else if(url.pathname.endsWith('/coach_athlete_invitation')){
   if(req.method()==='PATCH'){const payload=req.postDataJSON();assert.deepEqual(Object.keys(payload),['accepted_at'],'Athlete may only set accepted_at; server trigger owns accepted_by');assert.ok(!Number.isNaN(Date.parse(payload.accepted_at)));invitationAccepted=true;data={id:invitation.id};}
   else data=[{...invitation,accepted_at:invitationAccepted?new Date().toISOString():null}];
  }
  else if(url.pathname.endsWith('/coach_athlete_assignment')) data=invitationAccepted?[{athlete_id:athlete}]:[];
  else if(url.pathname.endsWith('/athlete_profile'))data={id:athlete,user_id:user.id,display_name:'Synthetic Athlete',ftp_w:250,normal_weekly_hours:8};
  else if(url.pathname.endsWith('/athlete_onboarding')){const setup={user_id:user.id,onboarding_step:3,race_distance:'70.3',race_date:null,weekly_hours:8,device:'garmin',experience:'first'};data=single?setup:[setup];}
  else if(url.pathname.endsWith('/coach_workout_approval_event'))data=[{id:'pilot-approval',workout_id:'BIKE-THR-002',workout_version:1,decision:'approved',level:1,phases:['build'],decided_at:new Date().toISOString()}];
  else if(url.pathname.endsWith('/rpc/coach_schedule_bike_with_week')){
   const body=req.postDataJSON();
   assert.equal(body.p_week_hours,8);assert.equal(body.p_athlete_id,athlete);
   coachPlan={id:pilotSession,athlete_id:athlete,planned_date:body.p_date,sport:'bike',title:body.p_title,session_class:'intensity',priority:2,duration_min:body.p_duration_min,status:'planned',prescription:body.p_prescription,rationale:body.p_rationale,is_active_version:true,targets:{}};
   data=pilotSession;
  }
  else if(url.pathname.endsWith('/planned_session'))data=coachPlan?[coachPlan]:[];
  else if(url.pathname.endsWith('/completed_activity'))data=manualActivity?[manualActivity]:[];
  else if(url.pathname.endsWith('/coach_monitoring_review')){
   if(req.method()==='POST'){monitoringReceipts.push(req.postDataJSON());data=null;}
   else data=monitoringReceipts;
  }
  else if(url.pathname.endsWith('/session_feedback'))data=athleteFeedback?[athleteFeedback]:[];
  else if(url.pathname.includes('/rpc/athlete_')){
   const body=req.postDataJSON();
   if(url.pathname.endsWith('/athlete_save_session_feedback')){
    athleteFeedback={...athleteFeedback,athlete_id:athlete,planned_session_id:pilotSession,session_rpe:body.p_rpe,notes:body.p_notes,updated_at:new Date().toISOString()};
    if(manualActivity)Object.assign(manualActivity,{session_rpe:body.p_rpe,notes:body.p_notes});
   }else{
    manualActivity={id:activityId,athlete_id:athlete,planned_session_id:pilotSession,source:'manual',sport:'bike',start_time:new Date().toISOString(),duration_sec:body.p_duration_min*60,distance_m:body.p_distance_km==null?null:body.p_distance_km*1000,session_rpe:body.p_rpe,notes:body.p_notes,processed_metrics:{}};
    coachPlan.status='completed';
    athleteFeedback={athlete_id:athlete,planned_session_id:pilotSession,session_rpe:body.p_rpe,notes:body.p_notes,updated_at:new Date().toISOString()};
   }
   data=activityId;
  }
  if(single&&Array.isArray(data))data=data[0]??null;
  else if(!single&&url.pathname.endsWith('/athlete_profile'))data=[data];
  const missing=single&&data===null;
  await route.fulfill({status:missing?406:200,contentType:'application/json',body:JSON.stringify(missing?{code:'PGRST116',details:'The result contains 0 rows',message:'No row'}:data)});
  return;
 }
 if(url.pathname.startsWith('/auth/v1/')) data=user;
 else if(url.pathname.endsWith('/athlete_profile')) {
  const profile={id:athlete,user_id:user.id,display_name:'Synthetic Athlete',ftp_w:profileFtp};
  if(req.method()==='POST')missingProfile=false;
  data=missingProfile?(single?null:[]):(single?profile:[profile]);
 } else if(url.pathname.endsWith('/athlete_onboarding')) {
  if(req.method()==='POST'){onboardingSavedFields=req.postDataJSON();onboardingStep=onboardingSavedFields.onboarding_step;}
  const setup={user_id:user.id,onboarding_step:onboardingStep,race_distance:'70.3',race_date:null,experience:'first',weekly_hours:8,device:'garmin',...onboardingSavedFields};
  data=single?setup:[setup];
 } else if(url.pathname.endsWith('/planned_session')) data=demoSessions;
 else if(url.pathname.endsWith('/completed_activity')) data=accepted?[{...recorded(),...(demoSessions.length?{start_time:new Date().toISOString()}: {})}]:[];
 const emptySingle=single&&data===null;
 await route.fulfill({status:emptySingle?406:200,contentType:'application/json',body:JSON.stringify(emptySingle?{code:'PGRST116',details:'The result contains 0 rows',message:'Cannot coerce the result to a single JSON object'}:data)});
};
await context.route('https://example.supabase.co/**',route=>mockSupabase(route,false));
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
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack||e.message));
try {
 // The primary browser context is already signed in. Registration needs a
 // separate, clean context to reproduce a first-time athlete experience.
 const registrationContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 try {
  const newAthlete=await registrationContext.newPage();
  await newAthlete.goto(base);
  await newAthlete.getByRole('link',{name:'New to AZUR? Create an athlete account'}).click();
  await newAthlete.waitForURL('**/register');
  await newAthlete.getByRole('heading',{name:'Create your athlete account'}).waitFor();
  await newAthlete.getByRole('button',{name:'Create athlete account',exact:true}).waitFor();
  assert.equal(await newAthlete.getByRole('heading',{name:'Welcome to Azur'}).count(),0);
  await newAthlete.getByRole('link',{name:'Already registered? Sign in'}).click();
  await newAthlete.waitForURL(base+'/');
  await newAthlete.getByRole('heading',{name:'Welcome to Azur'}).waitFor();
 } finally { await registrationContext.close(); }
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
 await page.getByRole('button',{name:'Confirm training-load approval',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Confirm ride for review',exact:true}).count(),0,'Recorded ride must not offer staging again');
 await page.getByText('Stage: Already recorded · Training-load approval pending',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Confirm training-load approval',exact:true}).click();
 await page.getByText('Approved · 98 stress points',{exact:true}).waitFor();
 await page.getByText('Stage: Already recorded · Training load approved',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Confirm ride for review',exact:true}).count(),0,'Approved ride must stay recorded without refreshing');
 assert.deepEqual(commands.map(c=>c.path),['/api/intervals/stage-activity','/api/intervals/accept-activity','/api/intervals/validate-load']);
 await page.getByRole('button',{name:'Weekly Review',exact:true}).click();
 await page.getByText('98',{exact:true}).first().waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: browser preview → stage → accept → load approval → dashboard, with no planned sessions');
 await page.setViewportSize({width:390,height:844});
 onboardingStep=0; // Explicitly exercise a new athlete's first-run wizard.
 await page.goto(base+'/onboarding');
 await page.getByRole('heading',{name:'Welcome to AZUR',exact:true}).waitFor();
 await page.getByRole('heading',{name:'Your training goal',exact:true}).waitFor();
 assert.equal(await page.locator('.sidebar').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: standalone mobile onboarding, no sidebar or horizontal overflow');
 missingProfile=true;
 onboardingStep=0;
 // The app deliberately replaces the initial navigation with /onboarding.
 // Waiting for 'load' on the replaced page can race with frame detachment.
 await page.goto(base,{waitUntil:'commit'}).catch(error=>{
  if(!String(error).includes('ERR_ABORTED'))throw error;
 });
 await page.getByRole('heading',{name:'Your training goal',exact:true}).waitFor();
 assert.match(page.url(),/\/onboarding$/);
 await page.getByLabel('Your name',{exact:true}).fill('New Athlete');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('heading',{name:'Your training availability',exact:true}).waitFor();
 await page.getByRole('checkbox',{name:'Mon',exact:true}).check();
 await page.getByRole('checkbox',{name:'Wed',exact:true}).check();
 await page.getByRole('checkbox',{name:'Fri',exact:true}).check();
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('heading',{name:'How do you track training?',exact:true}).waitFor();
 await page.getByText('Do you already know your training thresholds?',{exact:true}).waitFor();
 await page.getByRole('checkbox',{name:'I have recent test values to enter'}).check();
 await page.getByLabel('Bike FTP (watts, if known)').fill('280');
 await page.getByLabel('Swim CSS (min:sec per 100m, e.g. 1:45 or 1.45)').fill('1.45');
 await page.getByLabel('Run threshold pace (min:sec per km, e.g. 4:20 or 4.20)').fill('4.20');
 await page.getByRole('button',{name:'Finish setup',exact:true}).click();
 await page.waitForURL(base+'/');
 assert.equal(missingProfile,false,'Profile must be created before leaving onboarding');
 assert.equal(onboardingStep,3,'Final onboarding step must be saved');
 assert.deepEqual(onboardingSavedFields.training_days,[0,2,4],'Athlete availability days saved');
 assert.equal(onboardingSavedFields.ftp_watts,280,'Reported FTP persists unchanged');
 assert.equal(onboardingSavedFields.swim_css_seconds_per_100m,105,'1.45 parsed as 105 seconds, not decimal minutes');
 assert.equal(onboardingSavedFields.run_threshold_seconds_per_km,260,'4.20 parsed as 260 seconds, not decimal minutes');
 await page.getByRole('heading',{name:'No workout scheduled',exact:true}).waitFor();
 await page.locator('.azur-white-dashboard:visible').getByRole('button',{name:'View calendar',exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'White dashboard must fit phone width');
 assert.deepEqual(errors,[]);
 console.log('PASS: signed-in athlete without profile → automatic onboarding → saved profile → dashboard');
 await page.getByRole('button',{name:'Chat',exact:true}).click();
 await page.getByRole('heading',{name:'Chat',exact:true }).waitFor();
 await page.getByText('Coming soon',{exact:true}).waitFor();
 assert.equal(await page.getByRole('textbox').count(),0,'Unavailable chat must not accept messages');
 await page.getByRole('button',{name:'View your training',exact:false}).click();
 await page.getByRole('button',{name:'Chat',exact:true}).waitFor();
 console.log('PASS: coming-soon chat has no message input and opens calendar');
 const moreTab=page.locator('.mobile-bottom-nav').getByRole('button',{name:'More',exact:true});
 for (const label of ['Profile & thresholds','Weekly Review','Recovery','Races','Benchmarks','Data Sources','Strava Feed']) {
  await moreTab.click();
  const menu=page.getByRole('region',{name:'More',exact:true});
  assert.equal(await page.getByRole('heading',{name:'More',exact:true}).count(),1);
  await menu.getByRole('heading',{name:'Connections'}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await menu.getByRole('button',{name:new RegExp(label)}).click();
  await menu.waitFor({state:'hidden'});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: mobile More opens profile and all six training and connection destinations');
 demoSessions=[{id:'demo-bike',planned_date:new Date().toISOString().slice(0,10),sport:'bike',title:'Long Aerobic Ride',session_class:'endurance',priority:1,duration_min:144,status:'planned',rationale:'Build aerobic durability with a controlled sustained effort.',prescription:{warmup:[{duration_min:12,target:'55–65% FTP'}],main_set:[{reps:2,duration_min:58,recovery_min:4,target:'65–75% FTP'}],cooldown:[{duration_min:12,target:'<65% FTP'}]}}];
 await page.goto(base);
 const home=page.locator('.azur-white-dashboard:visible');
 await home.getByRole('heading',{name:'Long Aerobic Ride',exact:true}).waitFor();
 await home.getByText('65–75% FTP',{exact:false}).waitFor();
 assert.equal(await home.locator('.awd-session').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(process.env.AZUR_VISUAL_OUTPUT_DIR){await page.screenshot({path:process.env.AZUR_VISUAL_OUTPUT_DIR+'/AZUR-white-dashboard.png',fullPage:true});}
 await home.getByText('Read the coaching rationale',{exact:true}).click();
 await home.getByRole('button',{name:'Open session targets',exact:false}).waitFor();
 await home.getByRole('button',{name:'View session',exact:true}).click();
 await page.locator('.session-detail-modal:visible').waitFor();
 const sheet=page.locator('.session-detail-modal:visible');
 for(const label of ['WARM-UP','MAIN SET','Recovery between efforts','4 min','COOL-DOWN','65–75% FTP']){
  await sheet.locator('.session-prescription-sections').getByText(label,{exact:true}).first().waitFor();
 }
 const target=sheet.locator('.azur-prescription-targets strong').first();
 assert.equal(await target.evaluate(el=>getComputedStyle(el).color),'rgb(23, 53, 75)','Prescription target must remain readable on light blue');
 assert.equal(await sheet.locator('.session-prescription-sections>.session-block').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(243, 247, 250)');
 if(process.env.AZUR_VISUAL_OUTPUT_DIR)await page.screenshot({path:process.env.AZUR_VISUAL_OUTPUT_DIR+'/AZUR-session-colours.png'});
 await sheet.getByRole('button',{name:'Close session detail'}).click();
 const calendar=page.locator('.athlete-agenda:visible');
 const dates=calendar.getByRole('group',{name:'Four-week calendar'});
 assert.equal(await dates.getByRole('button').count(),28);
 await dates.getByRole('button').nth(14).click();
 assert.equal(await dates.getByRole('button').nth(14).getAttribute('aria-pressed'),'true');
 await calendar.getByRole('button',{name:'Next four weeks'}).click();
 await calendar.getByRole('button',{name:'Today',exact:true}).click();
 await calendar.getByRole('button',{name:'Full week',exact:true}).first().click();
 assert.equal(await calendar.locator('.calendar-day-head:visible').count(),7);
 const surface=locator=>locator.evaluate(el=>getComputedStyle(el).backgroundColor);
 assert.equal(await surface(calendar.locator('.calendar-day-head:not(.today)').first()),'rgb(241, 246, 249)');
 const completedRide=calendar.locator('.calendar-session.completed').filter({hasText:'Unplanned Bike'});
 assert.equal(await surface(completedRide),'rgb(255, 255, 255)');
 assert.equal(await completedRide.locator('strong').evaluate(el=>getComputedStyle(el).color),'rgb(20, 46, 67)');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const plannedRide=calendar.locator('.calendar-session').filter({hasText:'Long Aerobic Ride'});
 await plannedRide.hover();
 assert.equal(await surface(plannedRide),'rgb(255, 255, 255)','Hover must preserve the light calendar card');
 await plannedRide.click();

 await sheet.waitFor();

 await sheet.getByRole('button',{name:'Close session detail'}).click();
 pilot=true;
 await page.goto(base);
 await moreTab.click();
 await page.getByRole('button',{name:'Accept',exact:true}).click();
 await page.getByText('Invitation accepted. Your coach can now see your athlete profile.',{exact:true}).waitFor();
 const coachContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await coachContext.addInitScript(({user})=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'coach-pilot',refresh_token:'coach-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user})),{user:{...user,id:invitation.coach_user_id,app_metadata:{role:'coach'}}});
 await coachContext.route('https://example.supabase.co/**',route=>mockSupabase(route,true));
 const coachPage=await coachContext.newPage();coachDebugPage=coachPage;coachPage.on('pageerror',error=>errors.push(error.stack||error.message));
 await coachPage.goto(base);
 await coachPage.getByRole('button',{name:'Coach Mode',exact:true}).click();
 await coachPage.getByRole('region',{name:'Assigned athletes'}).getByRole('button',{name:/Synthetic Athlete/}).click();
 await coachPage.getByRole('button',{name:'Session library',exact:true}).click();
 await coachPage.getByText('Approved workout selection preview',{exact:false}).click();
 await coachPage.getByLabel('Workout date',{exact:true}).fill(new Date().toISOString().slice(0,10));
 await coachPage.getByRole('button',{name:'Confirm and add to calendar',exact:true}).click();
 await coachPage.getByText('Workout added to the assigned athlete calendar.',{exact:true}).waitFor();
 await page.goto(base);
 await page.locator('.azur-white-dashboard:visible').getByRole('button',{name:'View session',exact:true}).click();
 await page.locator('.session-completion-v2 > summary').click();
 await page.getByLabel('Actual duration (minutes)',{exact:true}).fill('45');
 await page.getByLabel('Session effort (RPE 1–10)',{exact:true}).fill('4');
 await page.getByRole('button',{name:'Mark workout complete',exact:true}).click();
 await page.locator('.completed-session-summary').getByText('Completed activity',{exact:false}).waitFor();
 await page.getByLabel('Session RPE',{exact:true}).fill('6');
 await page.getByRole('textbox',{name:'Athlete notes',exact:true}).fill('Felt controlled after warm-up');
 await page.getByRole('button',{name:'Save athlete feedback',exact:true}).click();
 await page.getByText('Feedback saved.',{exact:true}).waitFor();
 await coachPage.getByRole('button',{name:'Overview',exact:true}).click();
 await coachPage.getByRole('button',{name:'Refresh athlete records',exact:true}).click();
 const reviews=coachPage.getByRole('region',{name:'Workout completion and feedback'});
 await reviews.getByText('Felt controlled after warm-up',{exact:true}).waitFor();
 await reviews.getByText('Reported effort · 6/10',{exact:true}).waitFor();
 await reviews.getByText('45 min recorded',{exact:true}).waitFor();
 const editAccordion=page.locator('.session-completion-v2');
 if(!(await editAccordion.getAttribute('open')) && !(await editAccordion.evaluate(el=>el.open))) await editAccordion.locator('summary').click();
 await page.getByLabel('Actual duration (minutes)',{exact:true}).fill('50');
 await page.getByLabel('Distance (km, optional)',{exact:true}).fill('22');
 await page.getByLabel('Session effort (RPE 1–10)',{exact:true}).fill('5');
 await page.getByRole('textbox',{name:'Athlete notes',exact:true}).fill('Updated after checking my recording');
 await page.getByRole('button',{name:'Save manual changes',exact:true}).click();
 await page.getByText('Manual activity changes saved.',{exact:true}).waitFor();
 await coachPage.getByRole('button',{name:'Refresh athlete records',exact:true}).click();
 await reviews.getByText('50 min recorded',{exact:true}).waitFor();
 await reviews.getByText('Reported effort · 5/10',{exact:true}).waitFor();
 await reviews.getByText('Updated after checking my recording',{exact:true}).waitFor();
 await coachPage.getByRole('button',{name:'Monitoring',exact:true}).click();
 const monitoringNav=coachPage.getByRole('navigation',{name:'Monitoring sections'});
 await monitoringNav.getByRole('button',{name:'Athlete Actions'}).waitFor();
 await monitoringNav.getByRole('button',{name:'Training Analysis'}).click();
 await coachPage.getByRole('button',{name:/Device workout matching/}).click();
 await coachPage.getByRole('region',{name:'Workout association review'}).waitFor();
 await monitoringNav.getByRole('button',{name:'Planning Tools'}).click();
 await coachPage.getByText('Weekly planning tools are not enabled in this environment.',{exact:true}).waitFor();
 await monitoringNav.getByRole('button',{name:'Athlete Actions'}).click();
 await coachPage.getByText('Athlete notes and setup',{exact:false}).click();
 const inbox=coachPage.getByRole('region',{name:'Needs your attention'});
 await inbox.getByText('Updated after checking my recording',{exact:true}).waitFor();
 await inbox.getByRole('button',{name:'Mark reviewed'}).click();
 await inbox.getByText('You’re up to date on the records checked.').waitFor();
 await coachPage.getByRole('region',{name:'Coach attention inbox'}).getByRole('button',{name:/Refresh/}).click();
 await inbox.getByText('You’re up to date on the records checked.').waitFor();
 athleteFeedback={...athleteFeedback,notes:'Legs felt heavy today',updated_at:new Date(Date.now()+1000).toISOString()};
 await coachPage.getByRole('region',{name:'Coach attention inbox'}).getByRole('button',{name:/Refresh/}).click();
 await inbox.getByText('Legs felt heavy today',{exact:true}).waitFor();
 console.log('PASS: reviewed notes survive refresh and revised feedback returns to the coach queue');
 console.log('PASS: athlete accepts invitation → coach schedules → athlete completes and changes feedback → coach sees latest records');
 assert.deepEqual(errors,[]);
 console.log('PASS: white-panel mobile dashboard renders real prescription, rationale and opens session details');
} catch(error) {
 if(coachDebugPage&&!coachDebugPage.isClosed())console.error('Coach page:',(await coachDebugPage.locator('body').innerText()).slice(-5000));
 console.error('Browser page errors:',errors);
 console.error('Visible page:',(await page.locator('body').innerText()).slice(0,2500));
 throw error;
} finally {await browser.close();}
