import test from 'node:test';
import assert from 'node:assert/strict';
import {assessEntryPathway,entrySessionDistribution} from '../athleteEntryPathway.mjs';
const jay={experience:'experienced',recentHours:17,availableHours:16,trainingConcern:'none'};
test('established athlete should not be treated as beginner just because account is new',()=>{
 const x=assessEntryPathway(jay);
 assert.equal(x.pathway,'continuation');
 assert.equal(x.targetMinutes,960);
 assert.equal(x.status,'coach_review');
 assert.ok(x.blockers.some(b=>/verify recent training load/.test(b)));
 assert.equal(x.thresholdReady,false);
});
test('experienced continuation can clear history/threshold review only when both explicitly verified',()=>{
 const x=assessEntryPathway({...jay,historyVerified:true,thresholdsVerified:true});
 assert.equal(x.status,'ready_for_workout_mapping');
 assert.equal(x.thresholdReady,true);
});
test('training concern takes precedence over self-reported volume and threshold readiness',()=>{
 for(const trainingConcern of ['yes','unsure']){
  const x=assessEntryPathway({...jay,trainingConcern,historyVerified:true,thresholdsVerified:true});
  assert.equal(x.pathway,'return_to_training');
  assert.equal(x.targetMinutes,null);
  assert.equal(x.status,'coach_review');
 }
});
test('novice and low-volume athletes follow conservative foundation review',()=>{
 const x=assessEntryPathway({experience:'first',recentHours:3,availableHours:16,trainingConcern:'none'});
 assert.equal(x.pathway,'foundation');
 assert.equal(x.targetMinutes,180);
});
test('missing recent training cannot turn high availability into a high-volume prescription',()=>{
 const x=assessEntryPathway({experience:'experienced',recentHours:null,availableHours:16,trainingConcern:'none'});
 assert.equal(x.targetMinutes,null);
 assert.equal(x.status,'coach_review');
});
test('distribution checks approved library gaps and always remains unpublishable',()=>{
 const x=entrySessionDistribution({pathway:'continuation',targetMinutes:960,trainingDays:[0,1,2,3,4,5,6],
  workouts:[{sport:'bike',approved:true,duration_min:90,title:'Aerobic Endurance Ride',prescription:{steps:[]}},
   {sport:'run',approved:true,duration_min:45,title:'Easy Run',prescription:{steps:[]}}]});
 assert.ok(x.slots.length<=6);
 assert.ok(x.warnings.some(s=>/swim/.test(s)));
 assert.equal(x.ready,false);
 assert.equal(x.mappedMinutes,0);
 assert.equal(x.unmappedMinutes,960);
});
