import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../api/garmin/health-staging.ts';
async function invoke(method='POST',auth='',body={dailies:[]}) {
 const oldFlag=process.env.AZUR_GARMIN_WEBHOOK_STAGING;
 const oldSecret=process.env.AZUR_GARMIN_WEBHOOK_STAGING_SECRET;
 process.env.AZUR_GARMIN_WEBHOOK_STAGING='true';
 process.env.AZUR_GARMIN_WEBHOOK_STAGING_SECRET='a'.repeat(40);
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},
 status(code){this.statusCode=code;return this;},json(result){this.payload=result;return this;}};
 try {await handler({method,headers:{authorization:auth},body},res);return res;}
 finally {
  if(oldFlag===undefined)delete process.env.AZUR_GARMIN_WEBHOOK_STAGING; else process.env.AZUR_GARMIN_WEBHOOK_STAGING=oldFlag;
  if(oldSecret===undefined)delete process.env.AZUR_GARMIN_WEBHOOK_STAGING_SECRET;else process.env.AZUR_GARMIN_WEBHOOK_STAGING_SECRET=oldSecret;
 }
}
test('staging endpoint rejects requests without a staging credential',async()=>{
 assert.equal((await invoke()).statusCode,401);
 assert.equal((await invoke('POST','Bearer wrong')).statusCode,401);
});
test('staging endpoint does not ingest synthetic health payloads',async()=>{
 const r=await invoke('POST','Bearer '+ 'a'.repeat(40));
 assert.equal(r.statusCode,202);assert.equal(r.payload.ingested,false);
});
test('staging endpoint rejects malformed body and GET',async()=>{
 assert.equal((await invoke('GET')).statusCode,405);
 assert.equal((await invoke('POST','Bearer '+'a'.repeat(40),[])).statusCode,400);
});
