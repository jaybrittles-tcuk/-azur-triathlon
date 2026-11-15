import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSessionEffortReview} from './sessionEffortReview.ts';
test('RPE 10 aerobic session requires coach recovery review without automatic mutation',()=>{
 const r=assessSessionEffortReview({reportedRpe:10,plannedRpeHigh:4,actualMinutes:55,plannedMinutes:40,source:'manual'});
 assert.equal(r.status,'review_recovery');assert.equal(r.requiresCoachReview,true);assert.equal(r.readOnly,true);
 assert.match(r.reason,/fatigue/);
});
test('ordinary aerobic effort does not produce high effort flag',()=>{
 assert.equal(assessSessionEffortReview({reportedRpe:4,plannedRpeHigh:4,actualMinutes:40,plannedMinutes:40}).requiresCoachReview,false);
});
test('large effort mismatch needs review even without RPE 9',()=>{
 assert.equal(assessSessionEffortReview({reportedRpe:7,plannedRpeHigh:4}).requiresCoachReview,true);
});
test('missing and invalid RPE are unknown rather than safe',()=>{
 for(const reportedRpe of [null,0,11,4.5])assert.equal(assessSessionEffortReview({reportedRpe}).status,'unknown');
});
test('RPE 8 with materially longer workout is flagged',()=>{
 assert.equal(assessSessionEffortReview({reportedRpe:8,actualMinutes:55,plannedMinutes:40}).requiresCoachReview,true);
});
