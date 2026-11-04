import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAthleteEntry,athleteBetaHomeState} from '../src/lib/athleteBetaReadiness.mjs';
test('new account with no athlete profile must complete setup',()=>{
 assert.equal(resolveAthleteEntry({hasProfile:false,onboardingStep:null}).status,'setup_required');
});
test('existing profile cannot bypass unfinished athlete setup',()=>{
 assert.equal(resolveAthleteEntry({hasProfile:true,onboardingStep:2}).redirect,true);
 assert.equal(resolveAthleteEntry({hasProfile:true,onboardingStep:0}).redirect,true);
});
test('partial onboarding save without profile is still incomplete',()=>{
 assert.equal(resolveAthleteEntry({hasProfile:false,onboardingStep:3}).redirect,true);
});
test('completed setup and verified athlete profile allow app entry',()=>{
 assert.equal(resolveAthleteEntry({hasProfile:true,onboardingStep:3}).status,'ready');
});
test('coach is not forced through athlete onboarding',()=>{
 assert.equal(resolveAthleteEntry({isCoach:true,hasProfile:false}).redirect,false);
});
test('backend verification errors never misclassify readiness',()=>{
 assert.equal(resolveAthleteEntry({hasProfile:true,onboardingStep:null,lookupError:true}).status,'verification_unavailable');
});
test('no published training is communicated as awaiting coach plan',()=>{
 const state=athleteBetaHomeState({onboarded:true,hasPlan:false});
 assert.equal(state.stage,'await_plan');
 assert.match(state.detail,/coach/i);
});
test('real week available shows first workout rather than onboarding',()=>{
 assert.equal(athleteBetaHomeState({onboarded:true,hasPlan:true}).stage,'first_workout');
 assert.equal(athleteBetaHomeState({onboarded:true,hasPlan:true,completedCount:1}).stage,'training');
});
