import test from 'node:test';
import assert from 'node:assert/strict';
import { isTrainingLoadEligible } from './trainingLoad.ts';
test('Intervals accepted rides awaiting validation never earn training load',()=>{
 assert.equal(isTrainingLoadEligible({source:'intervals',loadStatus:'pending_validation'}),false);
});
test('rejected and testing activities cannot contribute',()=>{
 assert.equal(isTrainingLoadEligible({source:'intervals',loadStatus:'rejected'}),false);
 assert.equal(isTrainingLoadEligible({source:'garmin',isTest:true}),false);
});
test('previously eligible validated activities remain eligible',()=>{
 assert.equal(isTrainingLoadEligible({source:'garmin'}),true);
 assert.equal(isTrainingLoadEligible({source:'intervals',loadStatus:'validated'}),true);
});
