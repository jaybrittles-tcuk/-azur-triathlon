import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourcePath = fileURLToPath(
  new URL('../src/lib/calculations/trainingPriority.ts', import.meta.url),
);
const source = readFileSync(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { resolveTrainingPriority } = await import(
  `data:text/javascript,${encodeURIComponent(outputText)}`
);

const dualDevelopment = {
  developmentSport: 'balanced',
  phase: 'base',
  swimGapStatus: 'development',
  runGapStatus: 'development',
  bikeGapStatus: 'insufficient_data',
};

test('chooses swim when its race-pace reserve is clearly lower', () => {
  const result = resolveTrainingPriority({
    ...dualDevelopment,
    swimGapPct: 2,
    runGapPct: 6,
  });
  assert.equal(result.objectivePriority, 'swim');
  assert.equal(result.resolvedPriority, 'swim');
  assert.equal(result.multipliers.swim, 1.12);
});

test('chooses run when its race-pace reserve is clearly lower', () => {
  const result = resolveTrainingPriority({
    ...dualDevelopment,
    swimGapPct: 7,
    runGapPct: 1,
  });
  assert.equal(result.objectivePriority, 'run');
  assert.equal(result.resolvedPriority, 'run');
});

test('stays balanced for equally severe or near-equal gaps', () => {
  for (const [swimGapPct, runGapPct] of [[3, 3], [3, 3.5], [3, 4]]) {
    const result = resolveTrainingPriority({
      ...dualDevelopment,
      swimGapPct,
      runGapPct,
    });
    assert.equal(result.objectivePriority, 'balanced');
  }
});

test('does not rank two development gaps if either severity is missing', () => {
  for (const [swimGapPct, runGapPct] of [[4, null], [null, 4], [4, NaN]]) {
    const result = resolveTrainingPriority({
      ...dualDevelopment,
      swimGapPct,
      runGapPct,
    });
    assert.equal(result.objectivePriority, 'balanced');
  }
});

test('honours coach priority and flags disagreement', () => {
  const result = resolveTrainingPriority({
    ...dualDevelopment,
    developmentSport: 'run',
    swimGapPct: 2,
    runGapPct: 6,
  });
  assert.equal(result.objectivePriority, 'swim');
  assert.equal(result.resolvedPriority, 'run');
  assert.equal(result.conflict, true);
  assert.equal(result.multipliers.run, 1.12);
});

test('increases emphasis when coach and objective agree', () => {
  const result = resolveTrainingPriority({
    ...dualDevelopment,
    developmentSport: 'swim',
    swimGapPct: 2,
    runGapPct: 6,
  });
  assert.equal(result.conflict, false);
  assert.equal(result.multipliers.swim, 1.18);
});

test('taper and race weeks apply no additional weighting', () => {
  for (const phase of ['taper', 'race']) {
    const result = resolveTrainingPriority({
      ...dualDevelopment,
      developmentSport: 'swim',
      strongestSport: 'run',
      phase,
      swimGapPct: 2,
      runGapPct: 6,
    });
    assert.deepEqual(result.multipliers, { swim: 1, bike: 1, run: 1 });
  }
});

test('does not treat bike as an objective limiter without a valid model', () => {
  const result = resolveTrainingPriority({
    ...dualDevelopment,
    swimGapStatus: 'on_track',
    runGapStatus: 'on_track',
    bikeGapPct: null,
  });
  assert.equal(result.objectivePriority, 'balanced');
});
