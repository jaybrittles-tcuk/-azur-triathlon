import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAthleteThresholds} from './athleteThresholdReadiness.ts';
test('missing thresholds never become invented prescriptions',()=>{
 const r=inspectAthleteThresholds(null,null);
 assert.equal(r.allVerified,false);
 assert.deepEqual(Object.values(r.thresholds),[null,null,null]);
 assert.ok(r.statuses.every(s=>s.status==='missing_or_invalid'));
});
test('stored numbers remain unverified until coach validates',()=>{
 const r=inspectAthleteThresholds({ftp_w:305,swim_threshold_sec_per_100m:85,run_threshold_sec_per_km:220},null);
 assert.equal(r.allVerified,false);
 assert.deepEqual(r.statuses.map(s=>s.display),['1:25/100 m','305 W FTP','3:40/km']);
 assert.ok(r.statuses.every(s=>s.status==='available_unverified'));
});
test('implausible or malformed thresholds are rejected',()=>{
 const r=inspectAthleteThresholds({ftp_w:-10,swim_threshold_sec_per_100m:'abc',run_threshold_sec_per_km:0},null);
 assert.deepEqual(Object.values(r.thresholds),[null,null,null]);
});
test('onboarding values are a fallback, never proof of validation',()=>{
 const r=inspectAthleteThresholds({}, {ftp_watts:250,swim_css_seconds_per_100m:100,run_threshold_seconds_per_km:300});
 assert.equal(r.thresholds.ftpWatts,250);
 assert.equal(r.allVerified,false);
});
