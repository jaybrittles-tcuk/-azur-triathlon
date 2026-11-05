import test from 'node:test';
import assert from 'node:assert/strict';
import {assessBackgroundImport} from '../src/lib/intervalsBackgroundImport.mjs';
const ride={id:'ride-1',type:'VirtualRide',start_date:'2026-11-03T06:53:54Z',start_date_local:'2026-11-03T06:53:54',elapsed_time:3622};
test('safe unmatched ride eligible for record-only',()=>assert.equal(assessBackgroundImport(ride).allowed,true));
test('never import identical source twice',()=>assert.equal(assessBackgroundImport(ride,[{source:'intervals',source_activity_id:'ride-1'}]).reason,'already_imported'));
test('block cross-platform overlap',()=>assert.equal(assessBackgroundImport(ride,[{source:'garmin',sport:'bike',start_time:'2026-11-03T06:54:00Z',duration_sec:3620}]).reason,'possible_cross_provider_duplicate'));
test('planned bike requires human review',()=>assert.equal(assessBackgroundImport(ride,[],[{planned_date:'2026-11-03',sport:'bike',status:'planned',is_active_version:true}]).reason,'planned_session_requires_review'));
test('non-bike and invalid metrics fail closed',()=>{assert.equal(assessBackgroundImport({...ride,type:'Run'}).allowed,false);assert.equal(assessBackgroundImport({...ride,elapsed_time:-1}).allowed,false);});
