import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWeeklyPublication } from '../src/lib/calculations/weeklyCoachApproval.ts';
const draft={status:'ready_for_coach_review',weekStart:'2026-11-02',totalMinutes:60,sessions:[{date:'2026-11-02',session:{id:'bike-1'},reason:'Approved workout'}]};
const review={athleteId:'athlete-1',weekStart:'2026-11-02',draftRevision:2,draftFingerprint:'sha256-plan-v2',status:'approved',approvedRevision:2,approvedFingerprint:'sha256-plan-v2',approvedBy:'coach-1',approvedAt:'2026-11-01T12:00:00Z'};
const base={draft,review,athleteId:'athlete-1',fingerprint:'sha256-plan-v2',currentRevision:2,alreadyPublished:false};
test('verified unchanged draft is eligible for server-side review',()=>assert.equal(evaluateWeeklyPublication(base).allowed,true));
test('missing approval is blocked',()=>assert.equal(evaluateWeeklyPublication({...base,review:null}).allowed,false));
test('approval cannot transfer between athletes',()=>assert.equal(evaluateWeeklyPublication({...base,athleteId:'athlete-2'}).allowed,false));
test('changed draft revokes publication eligibility',()=>assert.equal(evaluateWeeklyPublication({...base,currentRevision:3}).allowed,false));
test('changed content revokes publication eligibility',()=>assert.equal(evaluateWeeklyPublication({...base,fingerprint:'changed'}).allowed,false));
test('unapproved, incomplete and already published plans fail closed',()=>{
 assert.equal(evaluateWeeklyPublication({...base,review:{...review,status:'pending_coach_review'}}).allowed,false);
 assert.equal(evaluateWeeklyPublication({...base,draft:{...draft,status:'blocked',reasons:['missing swim']}}).allowed,false);
 assert.equal(evaluateWeeklyPublication({...base,alreadyPublished:true}).allowed,false);
});
