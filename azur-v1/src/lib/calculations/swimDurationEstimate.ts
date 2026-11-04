/** Conservative swim session duration range. Informational only: never replace coach-approved durations. */
export type SwimSegment={distanceMeters:number;repeats:number;restSeconds:number;target:string;purpose:string};
export function estimateSwimMinutes(segments:readonly SwimSegment[],cssSecondsPer100m:number){
 if(!Number.isFinite(cssSecondsPer100m)||cssSecondsPer100m<50||cssSecondsPer100m>240)return {status:'needs_css' as const};
 if(!segments.length||segments.some(s=>!Number.isInteger(s.repeats)||s.repeats<1||!Number.isFinite(s.distanceMeters)||s.distanceMeters<=0||!Number.isFinite(s.restSeconds)||s.restSeconds<0))return {status:'invalid_prescription' as const};
 // Broad uncertainty bands include unquantified warm-up, drills and cooldown pace changes.
 // Rest is counted between repetitions, not following the last repetition.
 const distance=segments.reduce((n,s)=>n+s.distanceMeters*s.repeats,0);
 const rest=segments.reduce((n,s)=>n+s.restSeconds*Math.max(0,s.repeats-1),0);
 const low=Math.ceil((distance/100*cssSecondsPer100m*0.95+rest)/60);
 const high=Math.ceil((distance/100*cssSecondsPer100m*1.35+rest+240)/60);
 return {status:'estimated' as const,distanceMeters:distance,lowMinutes:low,highMinutes:high,requiresCoachValidation:true};
}
