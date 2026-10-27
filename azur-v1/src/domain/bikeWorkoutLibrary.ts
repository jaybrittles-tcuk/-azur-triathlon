/** AZUR Build 07A: validated cycling workout templates. No automatic publishing. */
export type WorkoutFamily = 'aerobic_foundation' | 'aerobic_development' | 'tempo' | 'sweet_spot' | 'threshold' | 'vo2_short' | 'vo2_long' | 'big_gear' | 'strength_endurance' | 'durability' | 'race_specific';
export type WorkoutStep =
  | { kind: 'steady'; minutes: number; minFtpPct: number; maxFtpPct: number; label: string }
  | { kind: 'repeat'; repetitions: number; work: Extract<WorkoutStep, {kind:'steady'}>; recovery: Extract<WorkoutStep, {kind:'steady'}> };
export interface BikeWorkout {
  id: string;
  version: number;
  title: string;
  family: WorkoutFamily;
  purpose: string;
  steps: WorkoutStep[];
  status: 'candidate' | 'coach_validated' | 'export_validated';
}
const steady = (minutes:number,minFtpPct:number,maxFtpPct:number,label:string):WorkoutStep =>
  ({kind:'steady',minutes,minFtpPct,maxFtpPct,label});
export const bikeWorkouts: readonly BikeWorkout[] = [
  {id:'BIKE-AF-001',version:1,title:'Aerobic Reset 45',family:'aerobic_foundation',
   purpose:'Easy aerobic consistency',status:'candidate',steps:[
    steady(8,45,60,'Warm up'),steady(30,60,68,'Aerobic'),steady(7,40,55,'Cool down')]},
  {id:'BIKE-TMP-001',version:1,title:'Tempo Introduction',family:'tempo',
   purpose:'Introduce controlled sustained tempo',status:'candidate',steps:[
    steady(12,45,70,'Warm up'),
    {kind:'repeat',repetitions:2,work:{kind:'steady',minutes:10,minFtpPct:76,maxFtpPct:82,label:'Tempo'},
     recovery:{kind:'steady',minutes:4,minFtpPct:45,maxFtpPct:60,label:'Easy recovery'}},
    steady(10,40,55,'Cool down')]},
  {id:'BIKE-THR-001',version:1,title:'Threshold 3 x 6',family:'threshold',
   purpose:'Develop sustained threshold power',status:'candidate',steps:[
    steady(15,45,75,'Warm up'),
    {kind:'repeat',repetitions:3,work:{kind:'steady',minutes:6,minFtpPct:95,maxFtpPct:100,label:'Threshold'},
     recovery:{kind:'steady',minutes:4,minFtpPct:40,maxFtpPct:60,label:'Easy recovery'}},
    steady(10,40,55,'Cool down')]}
];
export function workoutMinutes(workout:BikeWorkout):number {
  return workout.steps.reduce((sum,step)=>sum+(step.kind==='steady'
    ?step.minutes:step.repetitions*step.work.minutes+(step.repetitions-1)*step.recovery.minutes),0);
}
export function validateWorkout(workout:BikeWorkout):string[] {
  const errors:string[]=[];
  if(!workout.id || !Number.isInteger(workout.version) || workout.version<1) errors.push('Invalid identity/version');
  if(!workout.steps.length) errors.push('Workout has no steps');
  const validateStep=(step:Extract<WorkoutStep,{kind:'steady'}>)=>{
    if(!Number.isFinite(step.minutes)||step.minutes<=0) errors.push('Invalid step duration');
    if(!Number.isFinite(step.minFtpPct)||!Number.isFinite(step.maxFtpPct)||
       step.minFtpPct<=0||step.maxFtpPct>200||step.minFtpPct>step.maxFtpPct) errors.push('Invalid FTP target');
  };
  for(const step of workout.steps){
    if(step.kind==='steady') validateStep(step);
    else {
      if(!Number.isInteger(step.repetitions)||step.repetitions<1) errors.push('Invalid repetitions');
      validateStep(step.work);validateStep(step.recovery);
    }
  }
  if(!Number.isFinite(workoutMinutes(workout))||workoutMinutes(workout)>480) errors.push('Invalid total duration');
  return errors;
}
export function resolvePowerRange(ftpWatts:number,minPct:number,maxPct:number):[number,number] {
  if(!Number.isFinite(ftpWatts)||ftpWatts<=0) throw new Error('Valid FTP required');
  return [Math.round(ftpWatts*minPct/100),Math.round(ftpWatts*maxPct/100)];
}
