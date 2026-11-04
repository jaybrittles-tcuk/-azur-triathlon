import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const edge=readFileSync(new URL('../../../supabase/functions/publish-approved-week/index.ts',import.meta.url),'utf8');
const review=readFileSync(new URL('../../app/CoachWeeklyReview.tsx',import.meta.url),'utf8');
test('isolated staging publisher checks exact origin and project',()=>{
 assert.match(edge,/STAGING_PROJECT='juvceqrzkeethontnezw'/);
 assert.match(edge,/ORIGIN='https:\/\/azur-staging\.vercel\.app'/);
 assert.match(edge,/origin!==ORIGIN/);
 assert.match(edge,/hostname!==STAGING_PROJECT/);
});
test('publisher verifies JWT coach, assignment, audited target and db-controlled draft before write',()=>{
 for(const required of ['auth/v1/user','app_metadata?.role','coach_athlete_assignment','weekly_plan_draft',
 'coach_initial_target_approval','publish_verified_weekly_draft','target_hours','locked'])assert.ok(edge.includes(required),required);
 assert.doesNotMatch(edge,/data\.sessions|req\.body\?\.sessions/);
 assert.match(edge,/Method|POST required/);
});
test('coach UI is staging-only and requires successful calendar readback',()=>{
 assert.match(review,/VITE_AZUR_STAGING==='true'/);
 assert.match(review,/publish-approved-week/);
 assert.match(review,/actual\.length!==payload\.sessions/);
 assert.doesNotMatch(review,/publish\(row,'additive'\)/);
});
