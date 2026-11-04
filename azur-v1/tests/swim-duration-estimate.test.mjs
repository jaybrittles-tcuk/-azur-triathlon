import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateSwimMinutes} from '../src/lib/calculations/swimDurationEstimate.ts';
const sample=[{distanceMeters:200,repeats:1,restSeconds:0,target:'easy',purpose:'warmup'},{distanceMeters:100,repeats:8,restSeconds:20,target:'CSS',purpose:'main'}];
test('missing CSS requires assessment',()=>{assert.equal(estimateSwimMinutes(sample,NaN).status,'needs_css');});
test('invalid segment is rejected',()=>{assert.equal(estimateSwimMinutes([{...sample[0],repeats:-1}],110).status,'invalid_prescription');});
test('duration is an estimated range and repetitions include intervening rest',()=>{const r=estimateSwimMinutes(sample,110);assert.equal(r.status,'estimated');assert.equal(r.distanceMeters,1000);assert.ok(r.lowMinutes>0&&r.highMinutes>r.lowMinutes);assert.equal(r.requiresCoachValidation,true);});
test('slower CSS increases duration range',()=>{const fast=estimateSwimMinutes(sample,100),slow=estimateSwimMinutes(sample,150);assert.equal(fast.status,'estimated');assert.equal(slow.status,'estimated');assert.ok(slow.lowMinutes>fast.lowMinutes);});
