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
 assert.ok(x.slots.length<=12);
 assert.equal(new Set(x.slots.map(s=>s.day)).size,6);
 assert.ok(x.slots.some(s=>s.sport==='swim'&&!s.approvedMatches.length));
 assert.equal(x.ready,false);
 assert.equal(x.proposedMinutes,960);
 assert.ok(x.mappedMinutes>0);
 assert.ok(x.unmappedMinutes>0);
 assert.ok(x.slots.some(s=>s.day===5&&s.sport==='bike'&&s.minutes===210));
 assert.ok(x.slots.some(s=>s.day===5&&s.sport==='run'));
 assert.equal(x.restDays,1);
 assert.ok(x.slots.every(s=>s.day!==0));

});

test('continuation structure reserves a rest day and expresses double-session availability',()=>{
 const result=entrySessionDistribution({pathway:'continuation',targetMinutes:960,
  trainingDays:[0,1,2,3,4,5,6],workouts:[]});
 assert.equal(result.slots.length,12);
 assert.equal(result.proposedMinutes,960);
 assert.equal(result.mappedMinutes,0);
 assert.equal(result.restDays,1);
 assert.equal(result.ready,false);
 assert.equal(result.targetBySport.bike,480);
 assert.equal(result.targetBySport.swim,240);
 assert.equal(result.targetBySport.run,240);
});
test('four available days with high volume is not marked publishable',()=>{
 const result=entrySessionDistribution({pathway:'continuation',targetMinutes:960,
  trainingDays:[0,2,4,6],workouts:[]});
 assert.equal(result.ready,false);
 assert.ok(result.warnings.some(x=>x.includes('five or more')));
 assert.ok(result.restDays>=3);
});
