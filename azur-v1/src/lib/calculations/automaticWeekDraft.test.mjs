import test from 'node:test';import assert from 'node:assert/strict';
import {safeRpeWorkout,mapAutoWeek,proposeMissingRpeWorkout} from '../automaticWeekDraft.mjs';
const workout=(sport,minutes)=>({workout_key:sport+'-'+minutes,title:'Easy '+sport+' '+minutes,
 sport,family:'aerobic_endurance',duration_min:minutes,approved:true,
 prescription:{steps:[{target:'Easy conversational RPE 3',durationMin:minutes}]}});
const slots=[{day:1,sport:'swim',minutes:60},{day:1,sport:'bike',minutes:90},
{day:2,sport:'run',minutes:60},{day:2,sport:'swim',minutes:45},
{day:3,sport:'bike',minutes:90},{day:3,sport:'run',minutes:45},
{day:4,sport:'swim',minutes:60},{day:4,sport:'bike',minutes:90},
{day:5,sport:'bike',minutes:210},{day:5,sport:'run',minutes:30},
{day:6,sport:'run',minutes:105},{day:6,sport:'swim',minutes:75}];
const library=[...new Map(slots.map(s=>[s.sport+'-'+s.minutes,workout(s.sport,s.minutes)])).values()];
test('every mapped workout has a complete approved RPE prescription',()=>{
 assert.ok(library.every(safeRpeWorkout));
 assert.equal(safeRpeWorkout({...library[0],approved:false}),false);
 assert.equal(safeRpeWorkout({...library[0],prescription:{steps:[{target:'70% FTP',durationMin:60}]}}),false);
 assert.equal(safeRpeWorkout({...library[0],prescription:{steps:[{target:'easy',durationMin:20}]}}),false);
});
test('can map a fully approved 16-hour continuation week with doubles and rest',()=>{
 const x=mapAutoWeek({weekStart:'2026-11-09',targetHours:16,slots,library});
 assert.equal(x.complete,true);
 assert.equal(x.matchedMinutes,960);
 assert.equal(x.sessions.length,12);
 assert.ok(x.sessions.every(s=>s.date>='2026-11-09'&&s.date<='2026-11-15'));
 assert.ok(x.sessions.every(s=>s.session.prescription?.steps?.length));
});
test('incomplete or unapproved library cannot create publishable draft',()=>{
 const x=mapAutoWeek({weekStart:'2026-11-09',targetHours:16,slots,
 library:library.filter(x=>x.workout_key!=='bike-210')});
 assert.equal(x.complete,false);
 assert.ok(x.blockers.some(s=>s.includes('210 minutes')));
});
test('target, dates, rest and daily limits remain hard gates',()=>{
 assert.equal(mapAutoWeek({weekStart:'2026-11-10',targetHours:16,slots,library}).complete,false);
 assert.equal(mapAutoWeek({weekStart:'2026-11-09',targetHours:17.8,slots,library}).complete,false);
 assert.equal(mapAutoWeek({weekStart:'2026-11-09',targetHours:16,slots:slots.map(s=>({...s,day:0})),library}).complete,false);
});

test('missing workout candidates have exact durations but are never approved',()=>{
 for(const sport of ['swim','bike','run'])for(const minutes of [30,45,60,75,90,105,120,180]){
  const candidate=proposeMissingRpeWorkout({sport,minutes});
  assert.ok(candidate,sport+' '+minutes);
  assert.equal(candidate.approved,false);
  assert.equal(candidate.prescription.steps.reduce((n,x)=>n+x.durationMin,0),minutes);
  assert.equal(safeRpeWorkout(candidate),false);
 }
 assert.equal(proposeMissingRpeWorkout({sport:'bike',minutes:210}),null);
});
