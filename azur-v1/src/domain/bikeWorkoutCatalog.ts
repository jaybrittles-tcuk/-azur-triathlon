import type { BikeWorkout } from './bikeWorkoutLibrary.ts';
import { bikeWorkouts } from './bikeWorkoutLibrary.ts';
import { expandedBikeWorkouts } from './bikeWorkoutExpanded.ts';

type Steady = Extract<BikeWorkout['steps'][number], { kind: 'steady' }>;
const s = (minutes:number,minFtpPct:number,maxFtpPct:number,label:string):Steady =>
 ({kind:'steady',minutes,minFtpPct,maxFtpPct,label});
const r = (repetitions:number,work:Steady,recovery:Steady) =>
 ({kind:'repeat' as const,repetitions,work,recovery});
const w=(id:string,title:string,family:BikeWorkout['family'],purpose:string,steps:BikeWorkout['steps']):BikeWorkout =>
 ({id,version:1,title,family,purpose,steps,status:'candidate'});

/** Additional coach-authored candidates. Every template requires review before export. */
export const additionalBikeWorkouts:readonly BikeWorkout[]=[
 w('BIKE-AF-002','Aerobic Foundation 60','aerobic_foundation','Aerobic consistency',
  [s(10,45,60,'Warm up'),s(40,62,70,'Aerobic'),s(10,40,55,'Cool down')]),
 w('BIKE-AF-004','Extended Foundation 90','aerobic_foundation','Longer easy endurance',
  [s(10,45,65,'Warm up'),s(70,62,70,'Aerobic'),s(10,40,55,'Cool down')]),
 w('BIKE-TMP-002','Tempo Builder 3 x 12','tempo','Develop sustained tempo',
  [s(12,45,70,'Warm up'),r(3,s(12,80,85,'Tempo'),s(4,45,60,'Recovery')),s(10,40,55,'Cool down')]),
 w('BIKE-SS-001','Sweet Spot Introduction 3 x 8','sweet_spot','Introduce controlled sweet spot',
  [s(15,45,75,'Warm up'),r(3,s(8,88,90,'Sweet spot'),s(5,45,60,'Recovery')),s(10,40,55,'Cool down')]),
 w('BIKE-SS-002','Sweet Spot Builder 3 x 12','sweet_spot','Build sweet spot repeatability',
  [s(15,45,75,'Warm up'),r(3,s(12,88,92,'Sweet spot'),s(5,45,60,'Recovery')),s(10,40,55,'Cool down')]),
 w('BIKE-THR-002','Threshold 3 x 10','threshold','Build threshold repeatability',
  [s(15,45,75,'Warm up'),r(3,s(10,95,100,'Threshold'),s(5,40,60,'Recovery')),s(10,40,55,'Cool down')]),
 w('BIKE-VO2-S-001','VO2 2 sets of 8 x 30/30','vo2_short','Short aerobic-power intervals',
  [s(15,45,75,'Warm up'),r(8,s(.5,115,130,'30s hard'),s(.5,40,60,'30s easy')),
   s(5,40,55,'Between sets'),r(8,s(.5,115,130,'30s hard'),s(.5,40,60,'30s easy')),s(10,40,55,'Cool down')])
];
export const allBikeWorkouts:readonly BikeWorkout[]=[...bikeWorkouts,...additionalBikeWorkouts,...expandedBikeWorkouts];
