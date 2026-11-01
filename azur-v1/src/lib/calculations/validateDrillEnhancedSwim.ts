import type {EditableDraftSession} from './applySwimDrillBlock.ts';
type Result={status:'valid';totalMeters:number;estimatedMinutes:number}|{status:'blocked';reasons:string[]};
/** Fail-closed validation of a swim draft with an ADDITIONAL drill block.
 * Accepts only explicit pool segments; legacy free-text prescriptions need conversion.
 * Work duration is an estimate and must not override distance-based targets.
 */
export function validateDrillEnhancedSwim(session:EditableDraftSession,cssSecondsPer100m:number|null):Result{
 const reasons:string[]=[];
 const swim=session.session;
 if(swim?.sport!=='swim')return {status:'blocked',reasons:['Not a swim workout']};
 const prescription=swim.prescription;
 const segments=prescription?.poolSegments;
 if(!Array.isArray(segments)||!segments.length)reasons.push('Structured pool segments with metres and repetitions are required');
 const block=prescription?.coachDrillBlock as {drills?:Array<{distanceMeters:number;repeats:number;restSeconds:number}>;totalMeters?:number}|undefined;
 if(!block||!Array.isArray(block.drills)||!block.drills.length)reasons.push('Drill block is missing');
 let base=0,drillMeters=0,restSeconds=0;
 if(Array.isArray(segments))for(const [i,item] of segments.entries()){
  const x=item as {distanceMeters?:number;repeats?:number;restSeconds?:number;target?:string};
  if(!Number.isInteger(x.distanceMeters)||!x.distanceMeters||x.distanceMeters<25||x.distanceMeters%25!==0||!Number.isInteger(x.repeats)||!x.repeats||x.repeats<1||!Number.isInteger(x.restSeconds)||x.restSeconds===undefined||x.restSeconds<0)reasons.push('Invalid pool segment '+(i+1));
  else {base+=x.distanceMeters*x.repeats;restSeconds+=Math.max(0,x.repeats-1)*x.restSeconds;}
  if(!x.target?.trim())reasons.push('Missing intensity target in pool segment '+(i+1));
 }
 if(block?.drills)for(const [i,d] of block.drills.entries()){
  if(!Number.isInteger(d.distanceMeters)||d.distanceMeters<25||d.distanceMeters%25!==0||!Number.isInteger(d.repeats)||d.repeats<1||!Number.isInteger(d.restSeconds)||d.restSeconds<0)reasons.push('Invalid drill '+(i+1));
  else {drillMeters+=d.distanceMeters*d.repeats;restSeconds+=Math.max(0,d.repeats-1)*d.restSeconds;}
 }
 if(block&&block.totalMeters!==drillMeters)reasons.push('Drill distance total mismatch');
 if(!cssSecondsPer100m||!Number.isFinite(cssSecondsPer100m)||cssSecondsPer100m<45||cssSecondsPer100m>240)reasons.push('Validated athlete CSS required for duration estimate');
 const planned=swim?.durationMin;
 if(!Number.isFinite(planned)||!planned||planned<=0)reasons.push('Planned session duration missing');
 const totalMeters=base+drillMeters;
 if(totalMeters>5000)reasons.push('Total pool distance requires explicit coach review');
 const estimatedMinutes=cssSecondsPer100m?Math.ceil((totalMeters*cssSecondsPer100m/100+restSeconds)/60):0;
 if(planned&&estimatedMinutes>planned*1.15)reasons.push('Drill block exceeds planned time allowance');
 return reasons.length?{status:'blocked',reasons}:{status:'valid',totalMeters,estimatedMinutes};
}
