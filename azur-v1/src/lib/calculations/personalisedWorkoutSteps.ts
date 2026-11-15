import type {SessionEntry} from './sessionSelection.ts';
import type {VerifiedThresholds} from './verifiedWorkoutTargets.ts';
export type PersonalisedStep={original:string;calculated:string|null;status:'illustrative'|'unverified'|'not_convertible'};
const pace=(seconds:number)=>Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
/** Converts only explicit coach-authored FTP percentages and CSS+ offsets.
 * Never overwrites a coach prescription or implies a session is approved.
 */
export function previewPersonalisedSteps(session:SessionEntry,source:VerifiedThresholds):{steps:PersonalisedStep[];readOnly:true}{
 const p=session.prescription as Record<string,unknown>|null;
 const raw=p&&typeof p==='object'?(Array.isArray(p.steps)?p.steps:Array.isArray(p.poolSegments)?p.poolSegments:[]):[];
 const validated=source.coachValidated&&typeof source.validatedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(source.validatedAt);
 const steps:PersonalisedStep[]=raw.map((step:unknown)=>{
  const x=step&&typeof step==='object'?step as Record<string,unknown>:{};
  const original=typeof x.target==='string'?x.target:'';
  const withheld={original,calculated:null,status:'unverified' as const};
  if(!validated)return withheld;
  if(session.sport==='bike'&&source.values.ftpWatts!==null){
   const ftp=source.values.ftpWatts;
   const range=original.match(/(?:^|\s)(\d{1,3})\s*[-–]\s*(\d{1,3})\s*%\s*FTP\b/i);
   const single=original.match(/(?:^|\s)(\d{1,3})\s*%\s*FTP\b/i);
   if(range){const a=Number(range[1]),b=Number(range[2]);if(a>=30&&a<=b&&b<=120)return {original,calculated:Math.round(ftp*a/100)+'–'+Math.round(ftp*b/100)+' W ('+a+'–'+b+'% FTP)',status:'illustrative' as const};}
   if(single){const a=Number(single[1]);if(a>=30&&a<=120)return {original,calculated:Math.round(ftp*a/100)+' W ('+a+'% FTP)',status:'illustrative' as const};}
  }
  if(session.sport==='swim'&&source.values.swimCssSecondsPer100m!==null){
   const css=source.values.swimCssSecondsPer100m;
   const range=original.match(/CSS\s*\+\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*s\s*\/\s*100\s*m/i);
   const single=original.match(/CSS\s*\+\s*(\d{1,2})\s*s\s*\/\s*100\s*m/i);
   if(range){const a=Number(range[1]),b=Number(range[2]);if(a<=b&&b<=45)return {original,calculated:pace(css+a)+'–'+pace(css+b)+'/100 m (CSS +'+a+'–'+b+' s)',status:'illustrative' as const};}
   if(single){const a=Number(single[1]);if(a<=45)return {original,calculated:pace(css+a)+'/100 m (CSS +'+a+' s)',status:'illustrative' as const};}
  }
  return {original,calculated:null,status:'not_convertible' as const};
 });
 return {steps,readOnly:true};
}
