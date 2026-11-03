import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAthletePace,formatAthletePace} from '../athletePaceInput.mjs';

test('swim CSS and running threshold accept colon and dot clock formats',()=>{
 assert.equal(parseAthletePace('1:45'),105);
 assert.equal(parseAthletePace('1.45'),105);
 assert.equal(parseAthletePace('4:20'),260);
 assert.equal(parseAthletePace('4.20'),260);
 assert.equal(formatAthletePace(105),'1:45');
});
test('never read 4.20 as four decimal minutes or allow invalid seconds',()=>{
 assert.equal(parseAthletePace('4.60')!==parseAthletePace('4:20'),true);
 assert.ok(Number.isNaN(parseAthletePace('4.60')));
 assert.ok(Number.isNaN(parseAthletePace('1.9')));
 assert.ok(Number.isNaN(parseAthletePace('bad')));
 assert.equal(parseAthletePace(''),null);
 assert.equal(parseAthletePace('  '),null);
});
