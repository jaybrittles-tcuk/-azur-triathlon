import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIntensityTarget, normalizeWorkoutIntervals } from './workoutIntensity.ts';

test('accepts explicit FTP range in percent', () => {
  assert.deepEqual(normalizeIntensityTarget({targetType:'ftp',targetLow:88,targetHigh:95}),
    {metric:'ftp_percent',low:88,high:95,unit:'%FTP'});
});
test('does not invent intensity from narrative', () => {
  assert.equal(normalizeIntensityTarget({targetText:'hard',targetLow:100}),null);
  assert.equal(normalizeIntensityTarget({targetType:'ftp',targetLow:100,targetHigh:80}),null);
});
test('preserves distinct pace and heart rate units', () => {
  assert.equal(normalizeIntensityTarget({targetType:'pace',targetLow:240,targetHigh:260})?.unit,'s/km');
  assert.equal(normalizeIntensityTarget({targetType:'hr',targetLow:125,targetHigh:145})?.unit,'bpm');
});
test('expands repeats with recovery between, not after, last rep', () => {
  const intervals=normalizeWorkoutIntervals([{type:'repeat',reps:3,
    work:{type:'work',durationMin:4,targetType:'ftp',targetLow:105,targetHigh:110},
    recovery:{type:'recovery',durationMin:2}}]);
  assert.deepEqual(intervals.map(x=>x.kind),['work','recovery','work','recovery','work']);
  assert.equal(intervals[0].durationSec,240);
  assert.equal(intervals[1].durationSec,120);
});
test('missing duration stays unknown', () => {
  assert.equal(normalizeWorkoutIntervals([{type:'work',distanceM:400}])[0].durationSec,null);
});
