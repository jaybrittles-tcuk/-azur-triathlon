import test from 'node:test';import assert from 'node:assert/strict';
import { personaliseDraftById } from '../src/lib/calculations/personalisedSwimRun.ts';
test('CSS uses athlete threshold to compute pace targets',()=>{const x=personaliseDraftById('swim-css-v1',{cssSecondsPer100m:90});assert.equal(x.status,'ready_for_coach_review');assert.ok(x.steps.some(s=>s.targetLabel.includes('88–92 sec/100m')))});
test('run threshold uses athlete-specific seconds per km',()=>{const x=personaliseDraftById('run-threshold-v1',{runThresholdSecondsPerKm:240});assert.equal(x.status,'ready_for_coach_review');assert.ok(x.steps.some(s=>s.targetLabel.includes('235–245 sec/km')))});
test('missing athlete benchmarks block threshold prescriptions',()=>{assert.equal(personaliseDraftById('swim-css-v1',{}).status,'blocked');assert.equal(personaliseDraftById('run-threshold-v1',{}).status,'blocked')});
test('RPE sessions can be reviewed without pace benchmark',()=>{const x=personaliseDraftById('run-easy-v1',{});assert.equal(x.status,'ready_for_coach_review');assert.match(x.steps[0].targetLabel,/RPE/)});
test('unknown workout blocked',()=>assert.equal(personaliseDraftById('missing',{}).status,'blocked'));
