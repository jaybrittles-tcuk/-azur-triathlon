import test from 'node:test';
import assert from 'node:assert/strict';
import {twoWeekFoundationPreview} from '../twoWeekFoundation.mjs';

const valid={weekStart:'2026-11-09',trainingDays:[0,1,3,5],availableHours:16,
 recentHours:4,onboardingCompleted:true,currentTrainingConcern:'none',existingSessions:0,
 ftpWatts:null,swimCssSeconds:null,runThresholdSeconds:null};
test('unknown thresholds generate two easy weeks with a pre-testing path',()=>{
 const result=twoWeekFoundationPreview(valid);
 assert.equal(result.path,'two_week_endurance_foundation');
 assert.deepEqual(result.unknownSports,['bike','swim','run']);
 assert.equal(result.weeks.length,2);
 assert.equal(result.weeks[0].sessions.length,4);
 assert.ok(result.weeks.every(w=>w.totalMinutes<=4*60));
 assert.deepEqual(result.weeks[0].sessions.map(s=>s.day),['Monday','Tuesday','Thursday','Saturday']);
 assert.equal(result.weeks[1].weekStart,'2026-11-16');
 assert.equal(result.testWindowStart,'2026-11-23');
 assert.deepEqual(result.proposedAssessments.map(a=>a.sport),['bike','swim','run']);
 assert.ok(result.proposedAssessments.every(a=>a.status==='coach_review_after_foundation'));
 assert.equal(result.canPublish,false);
 assert.ok(result.weeks.flatMap(w=>w.sessions).every(s=>s.status==='unapproved_proposal'&&!/FTP|CSS|threshold|zone [2-9]/i.test(s.intensity)));
});
test('available hours never treated as training history or target',()=>{
 const result=twoWeekFoundationPreview({...valid,recentHours:null});
 assert.ok(result.weeks.every(w=>w.totalMinutes<=120));
 assert.ok(result.warnings.some(w=>w.includes('unknown')));
 assert.equal(result.coachReviewRequired,true);
});
test('duplicate or missing availability fails closed',()=>{
 for(const trainingDays of [[],[0,0]]){
  const result=twoWeekFoundationPreview({...valid,trainingDays});
  assert.equal(result.weeks.length,0);
  assert.ok(result.blockers.length);
 }
});
test('do not propose a foundation with unresolved health concern, existing sessions or incomplete setup',()=>{
 for(const changes of [{currentTrainingConcern:'yes'},{currentTrainingConcern:'unsure'},{existingSessions:1},{onboardingCompleted:false}]){
  const result=twoWeekFoundationPreview({...valid,...changes});
  assert.equal(result.weeks.length,0);
  assert.equal(result.canPublish,false);
 }
});
test('partial threshold data still enters endurance foundation until coach reviews missing tests',()=>{
 const result=twoWeekFoundationPreview({...valid,ftpWatts:250});
 assert.deepEqual(result.unknownSports,['swim','run']);
 assert.equal(result.path,'two_week_endurance_foundation');
});
test('three supplied thresholds do not bypass coach verification or publish sessions',()=>{
 const result=twoWeekFoundationPreview({...valid,ftpWatts:250,swimCssSeconds:102,runThresholdSeconds:240});
 assert.equal(result.path,'coach_threshold_verification');
 assert.equal(result.canPublish,false);
 assert.equal(result.coachReviewRequired,true);
 assert.deepEqual(result.unknownSports,[]);
});
test('unreliable recent hours and invalid Monday produce no proposals',()=>{
 assert.equal(twoWeekFoundationPreview({...valid,recentHours:-1}).weeks.length,0);
 assert.equal(twoWeekFoundationPreview({...valid,weekStart:'2026-11-10'}).weeks.length,0);
});

test('all seven days available still results in rest days rather than seven workouts',()=>{
 const result=twoWeekFoundationPreview({...valid,trainingDays:[0,1,2,3,4,5,6],recentHours:17,ftpWatts:250,swimCssSeconds:105,runThresholdSeconds:260});
 assert.equal(result.blockers.length,0);
 assert.equal(result.path,'coach_threshold_verification');
 assert.equal(result.weeks.length,2);
 assert.ok(result.weeks.every(w=>w.sessions.length<=5&&w.restDays>=2));
 assert.equal(result.canPublish,false);
});

test('foundation previews include purposeful structured steps with exact duration',()=>{
 const result=twoWeekFoundationPreview(valid);
 for(const session of result.weeks.flatMap(w=>w.sessions)){
  assert.ok(session.purpose?.length>20);
  assert.ok(session.steps.length>=3);
  assert.equal(session.steps.reduce((sum,step)=>sum+step.durationMinutes,0),session.minutes);
  assert.ok(session.steps.some(step=>step.name==='Warm-up'));
  assert.ok(session.steps.some(step=>step.name==='Cool-down'));
  assert.equal(session.status,'unapproved_proposal');
  assert.doesNotMatch(JSON.stringify(session.steps),/\\b(?:FTP|CSS|threshold pace)\\b/i);
 }
});
test('week two changes session structure without increasing planned load',()=>{
 const result=twoWeekFoundationPreview(valid);
 assert.equal(result.weeks[0].totalMinutes,result.weeks[1].totalMinutes);
 assert.notDeepEqual(result.weeks[0].sessions.map(s=>s.title),result.weeks[1].sessions.map(s=>s.title));
 assert.equal(result.canPublish,false);
});
