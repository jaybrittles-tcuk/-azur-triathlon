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

import {getValidatedIntervalsTrainingStress} from './trainingLoad.ts';
const approvedRide = () => ({source:'intervals',processed_metrics:{load_status:'validated',load_validation_version:1,training_stress:75,intensity_factor:0.866,ftp_w_at_validation:250}});
test('validated Intervals score uses saved stress irrespective of current FTP',()=>{
 assert.deepEqual(getValidatedIntervalsTrainingStress({...approvedRide(),ftp:350}),{stress:75,intensityFactor:0.866});
});
test('pending ride with power and a fabricated score remains uncredited',()=>{
 const ride=approvedRide();ride.processed_metrics.load_status='pending_validation';
 assert.equal(getValidatedIntervalsTrainingStress(ride),null);
});
test('validation status alone without a scored validation record grants no stress',()=>{
 assert.equal(getValidatedIntervalsTrainingStress({source:'intervals',processed_metrics:{load_status:'validated',normalized_power:220}}),null);
});
test('malformed or nonfinite saved scores cannot poison load totals',()=>{
 for(const stress of [NaN,Infinity,-1,'75',null]) {
  const ride=approvedRide();ride.processed_metrics.training_stress=stress;
  assert.equal(getValidatedIntervalsTrainingStress(ride),null);
 }
});
test('fixture activities and rejected records cannot use a saved validation score',()=>{
 for(const patch of [{is_test:true},{test_fixture:true},{load_status:'rejected'}]) {
  const ride=approvedRide();Object.assign(ride.processed_metrics,patch);
  assert.equal(getValidatedIntervalsTrainingStress(ride),null);
 }
});
