import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCoachSession } from './sessionSelection.ts';

const base={sport:'bike',family:'threshold',phase:'build',maxMinutes:70,maxLevel:2};
const entry=(id, overrides={})=>({id,sport:'bike',family:'threshold',title:id,durationMin:60,level:2,phases:['build'],prescription:{steps:[]},approved:true,...overrides});

test('selects approved session fitting time, phase and development level',()=>{
 const r=selectCoachSession([entry('easy',{level:1}),entry('right'),entry('too-long',{durationMin:90})],base);
 assert.equal(r.status,'selected'); assert.equal(r.session.id,'right');
});
test('never selects unapproved sessions',()=>{
 assert.equal(selectCoachSession([entry('draft',{approved:false})],base).status,'unavailable');
});
test('does not silently substitute another training family',()=>{
 assert.equal(selectCoachSession([entry('endurance',{family:'aerobic_endurance'})],base).status,'unavailable');
});
test('excludes completed or undesired library IDs',()=>{
 const r=selectCoachSession([entry('a'),entry('b')],{...base,excludeIds:['a']});
 assert.equal(r.status,'selected');assert.equal(r.session.id,'b');
});
test('selection is stable across equal candidates',()=>{
 const r=selectCoachSession([entry('z'),entry('a')],base);
 assert.equal(r.session.id,'a');
});
