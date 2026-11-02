import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=readFileSync(new URL('../../../api/publish-week.js',import.meta.url),'utf8');
test('publisher is disabled unless explicitly enabled',()=>assert.match(file,/AZUR_WEEK_PUBLISH_ENABLED'\]!=='true'|AZUR_WEEK_PUBLISH_ENABLED'\)!=='true'|AZUR_WEEK_PUBLISH_ENABLED'\s*!==\s*'true'/));
test('publisher requires exact origin and authenticated coach',()=>{assert.match(file,/origin!==expected/);assert.match(file,/auth\.getUser\(token\)/);assert.match(file,/app_metadata\?\.role!=='coach'/)});
test('publish requests derive athlete and sessions server-side',()=>{assert.match(file,/weekly_plan_draft/);assert.match(file,/coach_athlete_assignment/);assert.match(file,/admin\.rpc\(rpc,\{p_draft_id:draftId\}\)/);assert.doesNotMatch(file,/req\.body\?\.sessions/)});
test('both modes use verified database publisher',()=>{assert.match(file,/publish_verified_additive_week/);assert.match(file,/publish_verified_weekly_draft/)});
