// Real hosted staging Auth, web/API and database flow. Only the Intervals provider is synthetic.
// Test credentials and any temporary Vercel access link stay in private runtime files.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.AZUR_PLAYWRIGHT_MODULE||'playwright');
const credentials=JSON.parse(readFileSync(process.env.AZUR_STAGING_AUTH_FILE,'utf8'));
const access=process.env.AZUR_STAGING_ACCESS_FILE?JSON.parse(readFileSync(process.env.AZUR_STAGING_ACCESS_FILE,'utf8')):{};
const base=process.env.AZUR_TEST_URL;
const target=new URL(base);
assert.ok(target.protocol==='https:'&&(target.hostname==='azur-staging.vercel.app'||(target.hostname.startsWith('azur-staging-')&&target.hostname.endsWith('-jay-brittles.vercel.app'))),'An explicit owned staging deployment URL is required');
if(access.url)assert.equal(new URL(access.url).origin,target.origin,'Temporary access must match the selected deployment');
const launch={headless:true};
const proxy=process.env.AZUR_BROWSER_PROXY||process.env.HTTPS_PROXY;
if(proxy)launch.proxy={server:proxy};
if(process.env.AZUR_CHROMIUM_MODULE){const module=require(process.env.AZUR_CHROMIUM_MODULE);const binary=module.default??module;launch.executablePath=process.env.AZUR_CHROMIUM_EXECUTABLE_PATH||await binary.executablePath();launch.args=binary.args;}
const browser=await chromium.launch(launch);
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',ignoreHTTPSErrors:process.env.AZUR_BROWSER_IGNORE_HTTPS_ERRORS==='true'});
const page=await context.newPage(),errors=[],responses=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.url().startsWith(base+'/api/intervals/'))responses.push({path:new URL(response.url()).pathname,status:response.status()});});
try {
 await page.goto(access.url||base);
 await page.getByText('AZUR STAGING · Separate test environment',{exact:true}).waitFor();
 await page.getByLabel('Email',{exact:true}).fill(credentials.email);
 await page.getByLabel('Password',{exact:true}).fill(credentials.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Data Sources',exact:true}).click();
 await page.getByRole('button',{name:'Preview rides',exact:true}).click();
 await page.getByText('AZUR STAGING — synthetic Zwift ride',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Confirm ride for review',exact:true}).click();
 await page.getByRole('button',{name:'Confirm and record ride',exact:true}).click();
 await page.getByRole('button',{name:'Confirm training-load approval',exact:true}).click();
 await page.getByText('Approved · 98 stress points',{exact:true}).waitFor();
 const replay=await page.evaluate(async()=>{
  const key=Object.keys(localStorage).find(key=>key.startsWith('sb-')&&key.endsWith('-auth-token'));
  const token=JSON.parse(localStorage.getItem(key)).access_token;
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const recorded=await(await fetch('/api/intervals/validate-load',{headers})).json();
  const id=recorded.activities.find(ride=>ride.processed_metrics?.load_status==='validated').id;
  return await(await fetch('/api/intervals/validate-load',{method:'POST',headers,body:JSON.stringify({activityId:id,confirm:true})})).json();
 });
 assert.equal(replay.outcome,'already_validated');assert.equal(replay.trainingStress,98);assert.equal(replay.trainingLoadChanged,false);
 await page.getByRole('button',{name:'Weekly Review',exact:true}).click();
 await page.getByText('98',{exact:true}).first().waitFor();
 assert.ok(responses.some(r=>r.path.endsWith('/stage-activity')&&r.status===200));
 assert.ok(responses.some(r=>r.path.endsWith('/accept-activity')&&r.status===200));
 assert.ok(responses.some(r=>r.path.endsWith('/validate-load')&&r.status===200));
 assert.deepEqual(errors,[]);
 console.log('PASS: hosted sign-in → web proxy → Edge handlers → real database → 98 load points → idempotent replay → Weekly Review');
 console.log('Provider boundary: explicitly labelled synthetic Intervals activity; live Intervals OAuth remains separate');
} catch(error) {
 let message=String(error.stack||error);
 for(const value of Object.values(credentials))if(typeof value==='string')message=message.replaceAll(value,'[redacted]');
 if(access.url){for(const value of new URL(access.url).searchParams.values())message=message.replaceAll(value,'[redacted]');}
 let visible=(await page.locator('body').innerText()).slice(0,2000);
 for(const value of Object.values(credentials))if(typeof value==='string')visible=visible.replaceAll(value,'[redacted]');
 console.error(message);console.error('Page errors:',errors);console.error('API responses:',responses);console.error('Visible page:',visible);process.exitCode=1;
} finally {await browser.close();}
