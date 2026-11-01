import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCoachSession } from '../src/lib/calculations/sessionSelection.ts';
import { swimRunCoachDraftTemplates, approvedSwimRunSelections } from '../src/lib/calculations/swimRunCoachDraftTemplates.ts';
const a={sport:'run',family:'aerobic_endurance',durationMin:45,level:1,phases:['base'],prescription:{main_set:'easy'},approved:true};
const library=[{...a,id:'a',title:'A'},{...a,id:'b',title:'B'}];
const context={sport:'run',family:'aerobic_endurance',phase:'base',maxMinutes:60,maxLevel:1};
test('rotation chooses alternative approved workouts',()=>{
 const one=selectCoachSession(library,{...context,rotationIndex:0});
 const two=selectCoachSession(library,{...context,rotationIndex:1});
 assert.equal(one.status,'selected');assert.equal(two.status,'selected');
 assert.notEqual(one.session.id,two.session.id);
});
test('recently used workouts lose priority',()=>{
 const result=selectCoachSession(library,{...context,recentIds:['a']});
 assert.equal(result.status,'selected');assert.equal(result.session.id,'b');
});
test('never includes unapproved templates in publishable library',()=>{
 assert.equal(approvedSwimRunSelections.length,0);
 assert.ok(swimRunCoachDraftTemplates.length>=10);
 assert.ok(swimRunCoachDraftTemplates.every(x=>x.approved===false));
});
