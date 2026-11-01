import type {EditableDraftSession} from './applySwimDrillBlock.ts';
type PoolSegment={distanceMeters:number;repeats:number;restSeconds:number;target:string;purpose?:string;[key:string]:unknown};
export function replaceEasySwimmingWithDrills(session:EditableDraftSession,segmentIndex:number,replaceMeters:number):EditableDraftSession{
 const current=session.session;
 const original=current?.prescription?.poolSegments;
 if(current?.sport!=='swim'||!Array.isArray(original))throw new Error('Structured swim workout required');
 if(!Number.isInteger(segmentIndex)||segmentIndex<0||segmentIndex>=original.length)throw new Error('Choose an existing pool segment');
 if(!Number.isInteger(replaceMeters)||replaceMeters<25||replaceMeters%25!==0)throw new Error('Replacement must be measured in 25m pool lengths');
 const segment=original[segmentIndex] as PoolSegment;
 if(!segment||segment.purpose!=='easy' || !/easy|recovery|rpe [123]/i.test(segment.target))throw new Error('Only coach-marked easy swimming can be replaced');
 if(segment.repeats!==1||!Number.isInteger(segment.distanceMeters)||segment.distanceMeters-replaceMeters<100)throw new Error('Keep at least 100m in the selected easy section');
 const updated=original.map((item:PoolSegment,i:number)=>i===segmentIndex?{...item,distanceMeters:item.distanceMeters-replaceMeters}:item);
 return {...session,session:{...current,prescription:{...current.prescription,poolSegments:updated,coachDrillReplacement:{segmentIndex,replacedMeters:replaceMeters}}}};
}
export function easySegmentsForReplacement(session:EditableDraftSession,replaceMeters:number):number[]{
 const a=session.session?.prescription?.poolSegments;
 if(!Array.isArray(a))return [];
 return a.flatMap((x:PoolSegment,i:number)=>x?.purpose==='easy'&&x.repeats===1&&Number.isInteger(x.distanceMeters)&&x.distanceMeters-replaceMeters>=100&&/easy|recovery|rpe [123]/i.test(x.target)?[i]:[]);
}
