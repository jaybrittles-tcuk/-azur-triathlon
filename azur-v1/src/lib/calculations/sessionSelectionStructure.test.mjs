import test from 'node:test';
import assert from 'node:assert/strict';
import {hasStructuredPrescription,selectCoachSession} from './sessionSelection.ts';
const session={id:'bike-1',sport:'bike',family:'threshold',title:'Threshold intervals',durationMin:60,level:1,phases:['base'],approved:true,prescription:{main_set:[{reps:4,duration_min:6,recovery_min:3,target:'threshold'}]}};
const input={sport:'bike',family:'threshold',phase:'base',maxMinutes:70,maxLevel:1};
test('structured coach-authored workout is selectable',()=>{assert.equal(hasStructuredPrescription(session.prescription),true);assert.equal(selectCoachSession([session],input).status,'selected')});
test('placeholder or empty prescription cannot enter draft',()=>{for(const prescription of [null,{},'easy ride',{notes:'easy ride'},{main_set:[]},{main_set:[null]}]){assert.equal(hasStructuredPrescription(prescription),false);assert.equal(selectCoachSession([{...session,prescription}],input).status,'unavailable')}});
test('unapproved workouts remain unavailable',()=>assert.equal(selectCoachSession([{...session,approved:false}],input).status,'unavailable'));
