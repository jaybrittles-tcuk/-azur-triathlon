import type { SessionEntry } from './sessionSelection.ts';

export type StructuredStep = {
 name:string; repeats:number; workSeconds:number; recoverySeconds:number; distanceMeters?:number;
 target:{type:'rpe'|'css_pace'|'run_threshold_pace'; min:number;max:number};
 instruction:string;
};
export type StructuredSwimRun = {
 id:string;sport:'swim'|'run';title:string;family:SessionEntry['family'];
 phases:SessionEntry['phases'];level:1|2|3;steps:StructuredStep[];
 approval:'coach_review_required';
};
const steps=(name:string,repeats:number,workSeconds:number,recoverySeconds:number,min:number,max:number,instruction:string,target:StructuredStep['target']['type']='rpe'):StructuredStep=>({
 name,repeats,workSeconds,recoverySeconds,target:{type:target,min,max},instruction
});
export const structuredSwimRunDrafts:StructuredSwimRun[]=[
 {id:'swim-technique-v1',sport:'swim',title:'Catch and balance skills',family:'technique',phases:['base','recovery'],level:1,approval:'coach_review_required',steps:[
  {...steps('Easy swim',1,600,0,2,3,'Relaxed strokes'),distanceMeters:300},
  {...steps('Drill 25m / easy swim 25m, repeat',8,120,30,2,3,'Technique quality first; rest 30s between 50m repetitions'),distanceMeters:50},
  {...steps('Easy swimming',1,600,0,2,3,'Smooth relaxed stroke'),distanceMeters:200}]},
 {id:'swim-aerobic-v1',sport:'swim',title:'Aerobic swim repeats',family:'aerobic_endurance',phases:['base','build'],level:1,approval:'coach_review_required',steps:[
  {...steps('Warm-up',1,600,0,2,3,'Easy swimming'),distanceMeters:300},
  {...steps('Aerobic repetitions',6,240,30,3,4,'Controlled form; 30 seconds rest after each 200m'),distanceMeters:200},
  {...steps('Cool-down',1,300,0,2,3,'Easy swimming'),distanceMeters:200}]},
 {id:'swim-css-v1',sport:'swim',title:'CSS controlled intervals',family:'threshold',phases:['build','peak'],level:2,approval:'coach_review_required',steps:[
  {...steps('Warm-up',1,900,0,2,3,'Easy plus controlled builds'),distanceMeters:400},
  {...steps('CSS interval repetitions',6,180,20,0.98,1.02,'6 × 200m at individual CSS target; 20s rest after each repeat', 'css_pace'),distanceMeters:200},
  {...steps('Cool-down',1,300,0,2,3,'Easy'),distanceMeters:200}]},
 {id:'run-easy-v1',sport:'run',title:'Easy aerobic run',family:'aerobic_endurance',phases:['base','build','recovery'],level:1,approval:'coach_review_required',steps:[
  steps('Easy aerobic running',1,2700,0,2,4,'Conversational, adjust for terrain and heat')]},
 {id:'run-strides-v1',sport:'run',title:'Aerobic run with strides',family:'aerobic_endurance',phases:['base','build'],level:1,approval:'coach_review_required',steps:[
  steps('Easy aerobic',1,1800,0,2,4,'Conversational'),
  steps('Relaxed strides',6,20,100,5,6,'Controlled mechanics; walk/jog fully between strides'),
  steps('Cool-down',1,480,0,2,3,'Very easy')]},
 {id:'run-long-v1',sport:'run',title:'Long aerobic run',family:'aerobic_endurance',phases:['base','build'],level:2,approval:'coach_review_required',steps:[
  steps('Steady aerobic',1,5400,0,2,4,'Maintain easy effort; fuel and hydrate according to athlete needs')]},
 {id:'run-threshold-v1',sport:'run',title:'Controlled cruise intervals',family:'threshold',phases:['build','peak'],level:2,approval:'coach_review_required',steps:[
  steps('Warm-up',1,900,0,2,3,'Include gradual drills if appropriate'),
  steps('Cruise intervals',4,480,120,0.98,1.02,'Factor of athlete run threshold pace in seconds/km; coach checks fitness and weekly intensity', 'run_threshold_pace'),
  steps('Cool-down',1,600,0,2,3,'Easy')]},
 {id:'run-recovery-v1',sport:'run',title:'Recovery jog',family:'recovery',phases:['base','build','recovery','taper'],level:1,approval:'coach_review_required',steps:[
  steps('Recovery jog',1,1800,0,1,2,'Very relaxed, may substitute rest if fatigue or injury concerns')]}
];
export function validateStructuredDraft(workout:StructuredSwimRun):string[]{
 const errors:string[]=[];
 if(!workout.steps.length)errors.push('No workout steps');
 for(const [i,s] of workout.steps.entries()){
  if(!Number.isInteger(s.repeats)||s.repeats<1||s.repeats>30)errors.push('Invalid repetitions at '+i);
  if(!Number.isFinite(s.workSeconds)||s.workSeconds<=0||!Number.isFinite(s.recoverySeconds)||s.recoverySeconds<0)errors.push('Invalid interval timing at '+i);
  if(!(s.target.min>0&&s.target.max>=s.target.min))errors.push('Invalid target at '+i);
  if(!s.instruction.trim())errors.push('Missing coach instruction at '+i);
  if(workout.sport==='swim'&&(!Number.isInteger(s.distanceMeters)||!s.distanceMeters||s.distanceMeters<=0||s.distanceMeters%25!==0))errors.push('Pool swim distance must be a positive multiple of 25m at '+i);
 }
 return errors;
}
export function structuredWorkoutSeconds(workout:StructuredSwimRun){
 return workout.steps.reduce((total,s)=>total+s.repeats*(s.workSeconds+s.recoverySeconds),0);
}
/** These are coach-authored draft prescriptions, NOT approved library selections. */
export const approvedStructuredSwimRunSelections:SessionEntry[]=[];
