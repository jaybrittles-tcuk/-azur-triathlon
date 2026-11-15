import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePaceSeconds,displayPace} from './paceEntry.ts';
test('colon pace entry works for swim and run',()=>{assert.equal(parsePaceSeconds('1:30'),90);assert.equal(parsePaceSeconds('4:00'),240);});
test('decimal minutes are accepted',()=>{assert.equal(parsePaceSeconds('1.5'),90);assert.equal(parsePaceSeconds('4.25'),255);});
test('rejects invalid or ambiguous pace strings',()=>{for(const s of ['1:60','1:3','abc','90','-1:30'])assert.equal(parsePaceSeconds(s),null);});
test('stored seconds are displayed as mm:ss',()=>{assert.equal(displayPace(90),'1:30');assert.equal(displayPace(240),'4:00');assert.equal(displayPace(null),'');});
