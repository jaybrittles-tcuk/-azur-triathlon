import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAdaptiveDecision} from './adaptiveDecision.ts';
const athlete='athlete-1';
const observation = (overrides={})=>({
 athlete_id:athlete,activity_id:'a1',duration_delta_pct:-26.7,evidence_level:'athlete_reported',
 severity:'high',observed_at:'2026-11-03T12:00:00Z',...overrides
});
const pattern = (overrides={})=>({
 athlete_id:athlete,signal_type:'repeated_short_duration',linked_sessions:3,affected_sessions:2,
 reported_sessions:2,device_sessions:1,latest_observed_at:'2026-11-03T12:00:00Z',...overrides
});
test('Tuesday bike: reported -26.7% triggers human review, never an automatic calendar change',()=>{
 const d=assessAdaptiveDecision(athlete,[observation()],[]);
 assert.equal(d.action,'coach_review');assert.equal(d.priority,'high');
 assert.equal(d.coach_approval_required,true);
 assert.match(d.evidence.join(' '),/athlete-reported/i);
 assert.doesNotMatch(d.rationale,/injur|fatigu/i);
});
test('repeated deviations override a single-session interpretation',()=>{
 const d=assessAdaptiveDecision(athlete,[observation()],[pattern()]);
 assert.equal(d.priority,'high');assert.equal(d.confidence,'moderate');
 assert.match(d.evidence.join(' '),/2 of 3/);
});
test('fewer than 3 linked observations is insufficient evidence for green status',()=>{
 const d=assessAdaptiveDecision(athlete,[observation({severity:'routine',duration_delta_pct:0})],[]);
 assert.equal(d.action,'insufficient_data');
 assert.equal(d.coach_approval_required,false);
});
test('three routine durations permit monitoring but not recovery claims',()=>{
 const d=assessAdaptiveDecision(athlete,[
 observation({activity_id:'a1',severity:'routine',duration_delta_pct:0}),
 observation({activity_id:'a2',severity:'routine',duration_delta_pct:-3,observed_at:'2026-11-02T12:00:00Z'}),
 observation({activity_id:'a3',severity:'routine',duration_delta_pct:1,observed_at:'2026-11-01T12:00:00Z'})
 ],[]);
 assert.equal(d.action,'monitor');
 assert.match(d.suggested_next_step,/recovery/i);
});
test('invalid and cross-athlete observations cannot produce an exception',()=>{
 const d=assessAdaptiveDecision(athlete,[observation({duration_delta_pct:NaN}),observation({athlete_id:'other'})],[]);
 assert.equal(d.action,'insufficient_data');
});
test('pattern requires 3 sessions with 2 affected, not merely upstream label',()=>{
 const d=assessAdaptiveDecision(athlete,[],[pattern({linked_sessions:2,affected_sessions:2})]);
 assert.equal(d.action,'insufficient_data');
});
test('review severity requests coach review without diagnosing fatigue',()=>{
 const d=assessAdaptiveDecision(athlete,[observation({severity:'review',duration_delta_pct:-11})],[]);
 assert.equal(d.action,'coach_review'); assert.equal(d.priority,'review');
});
