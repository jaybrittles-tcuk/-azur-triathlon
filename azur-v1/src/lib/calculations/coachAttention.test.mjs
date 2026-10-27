import test from 'node:test';
import assert from 'node:assert/strict';
import { coachAttentionSignals } from './coachAttention.ts';
test('high-priority unmatched session is review-only, not a definitive missed claim',()=>{
 const result=coachAttentionSignals([{id:'a',planned_date:'2026-10-20',priority:1,session_class:'intensity',status:'planned'}],[],'2026-10-27');
 assert.equal(result[0]?.code,'missed_key_session');
 assert.match(result[0].description,/without a linked completion/);
});
test('linked completion clears missing-session signal',()=>{
 const result=coachAttentionSignals([{id:'a',planned_date:'2026-10-20',priority:1,session_class:'intensity',status:'planned'}],[{planned_session_id:'a',start_time:'2026-10-20T10:00:00Z'}],'2026-10-27');
 assert.equal(result.some(x=>x.code==='missed_key_session'),false);
});
test('no plan data yields no missed-session alerts',()=>{assert.deepEqual(coachAttentionSignals([],[],'2026-10-27'),[]);});
