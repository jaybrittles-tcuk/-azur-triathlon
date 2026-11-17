import test from 'node:test';
import assert from 'node:assert/strict';
import {draftQuestionnaireWeek} from './questionnaireCheckedWeeklyDraft.ts';
const library=[{id:'intro-swim',sport:'swim',family:'technique',title:'Easy form swim',durationMin:30,level:1,phases:['base'],approved:true,prescription:{steps:[{duration_min:30}]}}];
const baseline={onboardingComplete:true,requestedWeeklyHours:8,recentWeeklyHours:null,trainingBackground:'novice',trainingConsistency:'under4',trainingConcern:'none',canSwim200m:false,coachApproved:true,approvedWeeklyHours:3};
const input={weekStart:'2026-11-16',slots:[{day:0,sport:'swim',family:'technique',maxMinutes:30,maxLevel:1}],library,phase:'base',targetWeekMinutes:30,existingActiveSessions:0,athleteProfileReady:true,baseline};
test('no device and no training history can produce a review-only introductory draft',()=>{const r=draftQuestionnaireWeek(input);assert.equal(r.status,'ready_for_coach_review');assert.equal(r.sessions.length,1);assert.equal(r.baselineSource,'athlete_questionnaire');assert.equal(r.coachReviewRequired,true)});
test('coach approval is required before selecting any workouts',()=>{const r=draftQuestionnaireWeek({...input,baseline:{...baseline,coachApproved:false}});assert.equal(r.status,'blocked');assert.equal(r.sessions.length,0)});
test('conservative capacity prevents large starting weeks',()=>assert.equal(draftQuestionnaireWeek({...input,baseline:{...baseline,approvedWeeklyHours:8},targetWeekMinutes:30}).status,'blocked'));
test('injury concerns block automatic drafts',()=>assert.equal(draftQuestionnaireWeek({...input,baseline:{...baseline,trainingConcern:'yes'}}).status,'blocked'));
test('non-swimmers cannot receive advanced swim prescriptions',()=>assert.equal(draftQuestionnaireWeek({...input,slots:[{day:0,sport:'swim',family:'threshold',maxMinutes:30,maxLevel:2}]}).status,'blocked'));
test('reported recent training constrains progression',()=>assert.equal(draftQuestionnaireWeek({...input,baseline:{...baseline,recentWeeklyHours:0.2},targetWeekMinutes:30}).status,'blocked'));

test('zero reported recent training blocks questionnaire drafts',()=>{const r=draftQuestionnaireWeek({...input,baseline:{...baseline,recentWeeklyHours:0}});assert.equal(r.status,'blocked');assert.ok(r.reasons.some(x=>x.includes('No recent training')))});
