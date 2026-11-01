import test from 'node:test';
import assert from 'node:assert/strict';
import { assessHistoryBaseline, DEFAULT_HISTORY_DAYS } from './historyBaseline.ts';
const asOf = '2026-11-01';
function history(count = 90) {
  const end = Date.parse(asOf + 'T00:00:00Z');
  return Array.from({length:count}, (_,i) => ({
    date:new Date(end - (count - 1 - i) * 86400000).toISOString().slice(0,10),
    coverage:'confirmed', stress:60,
  }));
}
test('90 days is the default and stable constant load yields expected fitness/fatigue',()=>{
 const result = assessHistoryBaseline(history(),asOf);
 assert.equal(DEFAULT_HISTORY_DAYS,90);
 assert.equal(result.status,'ready');
 assert.equal(result.coveragePercent,100);
 assert.equal(result.fitness,60);
 assert.equal(result.fatigue,60);
 assert.equal(result.form,0);
});
test('missing history is never treated as zero-load rest days',()=>{
 const input=history(30);
 const result=assessHistoryBaseline(input,asOf);
 assert.equal(result.status,'insufficient');
 assert.equal(result.observedDays,30);
 assert.equal(result.missingDays,60);
 assert.equal(result.fitness,null);
 assert.equal(result.fatigue,null);
});
test('explicit confirmed rest days count as observed',()=>{
 const input=history().map((d,i)=>({...d,stress:i%7===0?0:60}));
 const result=assessHistoryBaseline(input,asOf);
 assert.equal(result.status,'ready');
 assert.equal(result.observedDays,90);
 assert.ok(result.fitness!==null);
});
test('reject malformed inputs, duplicates and unconfirmed activity stress',()=>{
 const full=history();
 assert.throws(()=>assessHistoryBaseline([...full,full[0]],asOf),/duplicate/);
 assert.throws(()=>assessHistoryBaseline([{...full[0],coverage:'missing',stress:60}],asOf),/Missing days/);
 assert.throws(()=>assessHistoryBaseline([{...full[0],stress:-5}],asOf),/valid approved stress/);
 assert.throws(()=>assessHistoryBaseline(full,'2026-02-30'),/Invalid assessment date/);
});
