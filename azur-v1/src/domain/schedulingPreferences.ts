/**
 * AZUR V2 scheduling preferences.
 * Pure, UI-independent validation. Preferences never authorise increased load.
 * Days are Monday=0 ... Sunday=6, matching athlete_onboarding.training_days.
 */
export type Weekday = 0|1|2|3|4|5|6;
export type Sport = 'swim'|'bike'|'run';
export type TrainingCommitment = {
  id: string;
  title: string;
  day: Weekday;
  durationMinutes: number;
  sport?: Sport|'strength'|'other';
  countsTowardTraining: boolean;
};
export type SchedulingPreferences = {
  availableDays: Weekday[];
  preferredDays: Record<Sport, Weekday[]>;
  longRideDay: Weekday|null;
  longRunDay: Weekday|null;
  oneSessionDays: Weekday[];
  commitments: TrainingCommitment[];
  routine: 'fixed'|'variable';
  poolLengthMetres: 20|25|30|33|50|null;
};
export const defaultSchedulingPreferences: SchedulingPreferences = {
  availableDays:[0,1,2,3,4,5,6],
  preferredDays:{swim:[],bike:[],run:[]},
  longRideDay:null,longRunDay:null,oneSessionDays:[],
  commitments:[],routine:'fixed',poolLengthMetres:25,
};
const validDay=(d:number):d is Weekday=>Number.isInteger(d)&&d>=0&&d<=6;
export function validateSchedulingPreferences(p:SchedulingPreferences):string[] {
  const errors:string[]=[];
  const validUnique=(days:Weekday[],label:string)=>{
    if(days.some(d=>!validDay(d))||new Set(days).size!==days.length) errors.push(label+' contains invalid or repeated days.');
  };
  validUnique(p.availableDays,'Availability');
  if(!p.availableDays.length) errors.push('Choose at least one available training day.');
  for(const sport of ['swim','bike','run'] as const){
    validUnique(p.preferredDays[sport],sport+' preferences');
    if(p.preferredDays[sport].some(d=>!p.availableDays.includes(d))) errors.push(sport+' preferences must be on available days.');
  }
  validUnique(p.oneSessionDays,'One-session days');
  if(p.oneSessionDays.some(d=>!p.availableDays.includes(d))) errors.push('One-session days must be available training days.');
  if(p.longRideDay!==null && (!p.availableDays.includes(p.longRideDay)||!validDay(p.longRideDay))) errors.push('Long ride must fall on an available day.');
  if(p.longRunDay!==null && (!p.availableDays.includes(p.longRunDay)||!validDay(p.longRunDay))) errors.push('Long run must fall on an available day.');
  if(p.longRideDay!==null && p.longRideDay===p.longRunDay) errors.push('Long ride and long run cannot share a day.');
  if(p.routine!=='fixed'&&p.routine!=='variable') errors.push('Choose a valid routine type.');
  if(p.poolLengthMetres!==null&&![20,25,30,33,50].includes(p.poolLengthMetres)) errors.push('Choose a supported pool length.');
  const ids=new Set<string>();
  for(const c of p.commitments){
    if(!c.id.trim()||ids.has(c.id)) errors.push('Commitments must have unique IDs.');
    ids.add(c.id);
    if(!c.title.trim()||!validDay(c.day)||!Number.isFinite(c.durationMinutes)||c.durationMinutes<=0||c.durationMinutes>1440) errors.push('A commitment has invalid details.');
  }
  return errors;
}
/** Hard scheduling constraints, not a prescription or permission to add load. */
export function canScheduleSession(p:SchedulingPreferences,day:Weekday,existingSessionCount:number):boolean {
  if(!p.availableDays.includes(day)) return false;
  if(p.oneSessionDays.includes(day)&&existingSessionCount>=1) return false;
  return true;
}
/** Existing sessions count toward training volume only when the athlete explicitly says so. */
export function committedTrainingMinutes(p:SchedulingPreferences):number {
  return p.commitments.filter(c=>c.countsTowardTraining).reduce((sum,c)=>sum+c.durationMinutes,0);
}
