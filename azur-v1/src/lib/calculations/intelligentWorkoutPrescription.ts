import {resolveBenchmarkTarget, type BenchmarkEvidence, type BenchmarkTarget} from './benchmarkWorkoutTargets.ts';
export type Sport='bike'|'run'|'swim';
export type WorkoutPhase='foundation'|'base'|'build'|'peak'|'taper'|'recovery';
export type PrescriptionInput={
 sport:Sport; phase:WorkoutPhase; availableMinutes:number;
 recentSportHours:number|null; recoveryConcern:boolean;
 benchmarks:BenchmarkEvidence;
};
export type PrescribedStep={name:string;minutes:number;instruction:string;target:BenchmarkTarget|null};
export type WorkoutProposal={status:'coach_review_required';sport:Sport;title:string;purpose:string;minutes:number;steps:PrescribedStep[];reason:string};
const templates={
 bike:{title:'Aerobic development intervals',purpose:'Develop repeatable aerobic power and controlled pacing.',
  warm:10,cool:10,work:8,recovery:2,workCount:3},
 run:{title:'Controlled aerobic run intervals',purpose:'Improve running durability with manageable aerobic repeats.',
  warm:10,cool:10,work:5,recovery:2,workCount:3},
 swim:{title:'Relaxed technique and aerobic repeats',purpose:'Develop swim rhythm while maintaining technique.',
  warm:5,cool:5,work:4,recovery:1,workCount:4}
} as const;
export function proposeIntelligentWorkout(input:PrescriptionInput):WorkoutProposal|null{
 const {sport,phase,availableMinutes,recentSportHours,recoveryConcern,benchmarks}=input;
 if(!['bike','run','swim'].includes(sport)||!['foundation','base','build','peak','taper','recovery'].includes(phase))return null;
 if(!Number.isFinite(availableMinutes)||availableMinutes<20||availableMinutes>240)return null;
 if(recentSportHours!==null&&(!Number.isFinite(recentSportHours)||recentSportHours<0||recentSportHours>30))return null;
 const template=templates[sport];
 // Conservative session selection: demanding work is never introduced here.
 // Low recent sport volume or recovery concerns trigger a simpler aerobic session.
 const conservative=recoveryConcern||recentSportHours===null||recentSportHours<1.5||phase==='foundation'||phase==='recovery'||phase==='taper';
 const workCount=conservative?2:template.workCount;
 const recovery=conservative?2:template.recovery;
 const work=conservative?Math.min(5,template.work):template.work;
 const baseMinutes=template.warm+template.cool+workCount*work+(workCount-1)*recovery;
 if(baseMinutes>availableMinutes)return null;
 const target=!conservative&&benchmarks.verified?(
  sport==='bike'?resolveBenchmarkTarget(benchmarks,{sport:'bike',lowPct:65,highPct:75}):
  sport==='run'?resolveBenchmarkTarget(benchmarks,{sport:'run',lowOffsetSec:35,highOffsetSec:65}):
  resolveBenchmarkTarget(benchmarks,{sport:'swim',lowOffsetSec:8,highOffsetSec:18})
 ):null;
 const steps:PrescribedStep[]=[{name:'Warm-up',minutes:template.warm,instruction:'Build gradually from very easy to conversational effort',target:null}];
 for(let i=0;i<workCount;i++){
  steps.push({name:'Aerobic repeat '+(i+1),minutes:work,instruction:target?'Hold the prescribed aerobic target smoothly':'Conversational RPE 2–3; do not force pace or power',target});
  if(i<workCount-1)steps.push({name:'Recovery',minutes:recovery,instruction:'Very easy movement or rest as appropriate',target:null});
 }
 const extra=availableMinutes-baseMinutes;
 // Optional additional easy aerobic work, bounded by demonstrated history.
 const allowedExtra=recentSportHours===null?0:Math.min(extra,conservative?5:15);
 if(allowedExtra>0)steps.push({name:'Easy aerobic extension',minutes:allowedExtra,instruction:'Relaxed conversational effort',target:null});
 steps.push({name:'Cool-down',minutes:template.cool,instruction:'Very easy effort; finish feeling in control',target:null});
 const minutes=steps.reduce((sum,step)=>sum+step.minutes,0);
 return {status:'coach_review_required',sport,title:template.title,purpose:template.purpose,minutes,steps,
  reason:conservative?'Conservative structure selected from phase, recovery or limited sport history':'Structured aerobic development selected from recent sport history; coach reviews before publication'};
}
