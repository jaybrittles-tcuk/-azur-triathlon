import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const location=new URL('../../ios-preparation/apple-app-site-association.template.json',import.meta.url);
const config=JSON.parse(fs.readFileSync(location,'utf8'));
test('AASA template is properly shaped and never contains live credentials',()=>{
 assert.ok(Array.isArray(config.applinks.details));
 assert.ok(config.applinks.details[0].appIDs[0].startsWith('TEAM_ID_PLACEHOLDER.'));
 assert.equal(config.applinks.details[0].components.length,3);
 for(const item of config.applinks.details[0].components)assert.ok(['/','/onboarding'].includes(item['/']));
});
