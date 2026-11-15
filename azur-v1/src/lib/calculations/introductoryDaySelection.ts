/** Place three introductory sports on distinct available days, favouring recovery spacing.
 * Mon=0 ... Sun=6. Returns null when no safe three-day arrangement exists.
 */
export function chooseIntroductoryDays(available:readonly number[]):[number,number,number]|null{
 const days=[...new Set(available)].filter(d=>Number.isInteger(d)&&d>=0&&d<=6).sort((a,b)=>a-b);
 if(days.length<3)return null;
 let best:[number,number,number]|null=null;
 let bestScore=-Infinity;
 for(let i=0;i<days.length-2;i++)for(let j=i+1;j<days.length-1;j++)for(let k=j+1;k<days.length;k++){
  const selected:[number,number,number]=[days[i],days[j],days[k]];
  const gaps=[days[j]-days[i],days[k]-days[j]];
  const score=Math.min(...gaps)*100-Math.abs(gaps[0]-gaps[1])*10-days[i];
  if(score>bestScore){best=selected;bestScore=score;}
 }
 return best;
}
