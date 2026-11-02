import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewWeekTarget} from './weeklyPlanSafety.ts';
const sessions=[['2026-11-02',25],['2026-11-03',50],['2026-11-07',80],['2026-11-08',40]].map(([planned_date,duration_min],i)=>({id:String(i),planned_date,is_active_version:true,locked:false,status:'planned',duration_min}));
test('partial training week is incomplete',()=>{const x=reviewWeekTarget({weekStart:'2026-11-02',sessions,targetHours:8.5});assert.equal(x.state,'incomplete');assert.equal(x.scheduledMinutes,195);assert.equal(x.shortfallMinutes,315)});
test('rest days are allowed if volume meets target',()=>{const x=reviewWeekTarget({weekStart:'2026-11-02',sessions:[...sessions,{...sessions[0],id:'extra',planned_date:'2026-11-05',duration_min:300}],targetHours:8.5});assert.equal(x.state,'ready')});