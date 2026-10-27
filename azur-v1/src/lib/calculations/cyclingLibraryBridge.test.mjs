import test from 'node:test';
import assert from 'node:assert/strict';
import { allBikeWorkouts } from '../../domain/bikeWorkoutCatalog.ts';
import { approvedCyclingSelections } from './cyclingLibraryBridge.ts';

test('original cycling candidates cannot enter selector without approval', () => {
  assert.equal(approvedCyclingSelections({}).length, 0);
});
test('one explicit approval enables only its corresponding workout', () => {
  const first=allBikeWorkouts[0];
  const entries=approvedCyclingSelections({[first.id]:{level:1,phases:['base']}});
  assert.equal(entries.length,1);
  assert.equal(entries[0].id,first.id);
  assert.deepEqual(entries[0].prescription,first.steps);
});
test('missing progression metadata does not confer approval', () => {
  const first=allBikeWorkouts[0];
  assert.equal(approvedCyclingSelections({[first.id]:{level:1,phases:[]}}).length,0);
});
