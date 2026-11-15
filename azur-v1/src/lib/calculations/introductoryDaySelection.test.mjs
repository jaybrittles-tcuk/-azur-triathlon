import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseIntroductoryDays} from './introductoryDaySelection.ts';
test('spreads full-week availability across the week',()=>assert.deepEqual(chooseIntroductoryDays([0,1,2,3,4,5,6]),[0,3,6]));
test('never invents unavailable days',()=>assert.deepEqual(chooseIntroductoryDays([0,2,4]),[0,2,4]));
test('rejects insufficient days',()=>assert.equal(chooseIntroductoryDays([0,1]),null));
test('ignores duplicate and invalid entries',()=>assert.deepEqual(chooseIntroductoryDays([0,2,4,4,-1,8]),[0,2,4]));
