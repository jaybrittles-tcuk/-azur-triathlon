import test from 'node:test';
import assert from 'node:assert/strict';
import {previewVipaReplacements} from './vipaReplacementPreview.ts';
const existing=[{id:'old',planned_date:'2026-11-16',sport:'swim',duration_min:45,status:'planned',locked:false,is_active_version:true}];
const library=[{id:'structured',sport:'swim',family:'threshold',title:'Swim threshold',durationMin:45,level:1,phases:['base'],prescription:{steps:[{duration_min:10,target:'CSS'}]},approved:true}];
const slot=[{day:0,sport:'swim',family:'threshold',maxMinutes:50,maxLevel:1}];
const base={weekStart:'2026-11-16',phase:'base',targetMinutes:45,approvedCapacityMinutes:60,historyValidated:true,recoveryReviewed:true,spikeVerified:true,fatigueFlag:false,injuryFlag:false,existing,slots:slot,library};
test('preview selects structured replacement without mutating existing calendar',()=>{
 const snapshot=JSON.stringify(existing);const r=previewVipaReplacements(base);
 assert.equal(r.status,'ready_for_coach_review');assert.equal(r.proposed.length,1);assert.equal(r.proposed[0].existingId,'old');
 assert.equal(r.proposedMinutes,45);assert.equal(r.readOnly,true);assert.equal(JSON.stringify(existing),snapshot);
});
test('blocks unsafe athlete history and locked sessions',()=>{
 assert.equal(previewVipaReplacements({...base,historyValidated:false}).status,'blocked');
 assert.equal(previewVipaReplacements({...base,existing:[{...existing[0],locked:true}]}).status,'blocked');
});
test('never invents a prescription when approved library coverage is absent',()=>{
 const r=previewVipaReplacements({...base,library:[]});assert.equal(r.status,'needs_library_review');assert.equal(r.proposed.length,0);assert.equal(r.proposedMinutes,45);
});
test('rejects a replacement that exceeds approved weekly capacity',()=>{
 const r=previewVipaReplacements({...base,library:[{...library[0],durationMin:55}],approvedCapacityMinutes:50});
 assert.equal(r.proposed.length,0);assert.equal(r.status,'needs_library_review');
});
