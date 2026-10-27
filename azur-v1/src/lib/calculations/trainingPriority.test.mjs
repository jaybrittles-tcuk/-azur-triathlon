import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrainingPriority } from './trainingPriority.ts';

const gaps = (swim, run, overrides = {}) => ({
  developmentSport: 'balanced',
  strongestSport: 'balanced',
  phase: 'base',
  swimGapStatus: 'development',
  runGapStatus: 'development',
  bikeGapStatus: 'insufficient_data',
  swimGapPct: swim,
  runGapPct: run,
  bikeGapPct: null,
  ...overrides,
});

test('ranks swim when swim reserve is lower', () => {
  const result = resolveTrainingPriority(gaps(2, 6));
  assert.equal(result.objectivePriority, 'swim');
  assert.equal(result.resolvedPriority, 'swim');
  assert.equal(result.multipliers.swim, 1.12);
});

test('ranks run when run reserve is lower', () => {
  assert.equal(resolveTrainingPriority(gaps(7, 1)).objectivePriority, 'run');
});

test('near-equal reserves do not force a winner', () => {
  for (const [swim, run] of [[3, 3.5], [3, 4], [3, 3]]) {
    assert.equal(resolveTrainingPriority(gaps(swim, run)).objectivePriority, 'balanced');
  }
});

test('missing or invalid development reserve does not force a winner', () => {
  for (const input of [gaps(4, null), gaps(null, 4), gaps(4, NaN)]) {
    assert.equal(resolveTrainingPriority(input).objectivePriority, 'balanced');
  }
});

test('a sole development-status sport remains the objective priority', () => {
  assert.equal(resolveTrainingPriority(gaps(12, 3, {
    swimGapStatus: 'on_track',
  })).objectivePriority, 'run');
});

test('conflict retains athlete/coach choice and flags it', () => {
  const result = resolveTrainingPriority(gaps(2, 6, { developmentSport: 'run' }));
  assert.equal(result.objectivePriority, 'swim');
  assert.equal(result.resolvedPriority, 'run');
  assert.equal(result.conflict, true);
  assert.match(result.rationale, /mismatch/i);
});

test('aligned choice increases weighting', () => {
  const result = resolveTrainingPriority(gaps(2, 6, { developmentSport: 'swim' }));
  assert.equal(result.multipliers.swim, 1.18);
});

test('taper and race protect weighting', () => {
  for (const phase of ['taper', 'race']) {
    assert.deepEqual(resolveTrainingPriority(gaps(2, 6, { phase })).multipliers, {
      swim: 1, bike: 1, run: 1,
    });
  }
});

test('bike remains insufficient-data for objective priority', () => {
  assert.equal(resolveTrainingPriority(gaps(12, 12, {
    swimGapStatus: 'on_track', runGapStatus: 'on_track',
  })).objectivePriority, 'balanced');
});

test('explanation includes swim/run reserves', () => {
  assert.match(resolveTrainingPriority(gaps(2, 6)).rationale,
    /swim race-pace reserve 2\.0% versus run 6\.0%/);
});

test('conflicts still explain the objective reserve comparison', () => {
  const result = resolveTrainingPriority(gaps(2, 6, { developmentSport: 'run' }));
  assert.match(result.rationale, /swim race-pace reserve 2\.0% versus run 6\.0%/);
});

test('no numerical winner explanation for missing reserve or taper', () => {
  for (const input of [gaps(null, 6), gaps(2, 6, { phase: 'taper' })]) {
    assert.doesNotMatch(resolveTrainingPriority(input).rationale, /versus run/);
  }
});

test('confidence reports clear winner when reserves differ meaningfully', () => {
  assert.equal(resolveTrainingPriority(gaps(2, 6)).objectiveConfidence, 'clear');
});

test('confidence reports close when competing reserves are within one point', () => {
  assert.equal(resolveTrainingPriority(gaps(3, 3.5)).objectiveConfidence, 'close');
});

test('confidence reports limited data when a development reserve is missing', () => {
  assert.equal(resolveTrainingPriority(gaps(null, 4)).objectiveConfidence, 'limited_data');
});

test('confidence reports none without any development status', () => {
  assert.equal(resolveTrainingPriority(gaps(12, 12, {
    swimGapStatus: 'on_track', runGapStatus: 'on_track',
  })).objectiveConfidence, 'none');
});
