/**
 * Real athlete beta entry gate. An athlete is ready to enter the app only
 * after both a profile and a completed onboarding record exist.
 * Database failures fail closed; coach accounts bypass athlete onboarding.
 */
export function resolveAthleteEntry({isCoach=false,hasProfile=false,onboardingStep=null,lookupError=false}={}){
 if(isCoach)return {status:'ready',redirect:false};
 if(lookupError)return {status:'verification_unavailable',redirect:false};
 if(!hasProfile||onboardingStep!==3)return {status:'setup_required',redirect:true};
 return {status:'ready',redirect:false};
}
export function athleteBetaHomeState({onboarded=false,hasPlan=false,completedCount=0}={}){
 if(!onboarded)return {stage:'complete_setup',label:'Complete your setup',detail:'Finish your athlete goals and availability before starting.'};
 if(!hasPlan)return {stage:'await_plan',label:'Your training plan is being prepared',detail:'Your account is ready. A coach still needs to assign and publish your training. You can explore your profile and training connections.'};
 if(completedCount<1)return {stage:'first_workout',label:'Ready for your first session',detail:'Open your calendar, review the prescription and record your first workout.'};
 return {stage:'training',label:'Your training is underway',detail:'Your completed sessions and feedback are saved in AZUR.'};
}
