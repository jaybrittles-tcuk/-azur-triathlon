/** Athlete-facing pace entry: mm:ss or decimal minutes, stored as integer seconds. */
export function parsePaceSeconds(input:string):number|null{
 const raw=input.trim();
 if(!raw)return null;
 if(/^\d{1,2}:\d{2}$/.test(raw)){const [m,s]=raw.split(':').map(Number);return s<60?m*60+s:null;}
 if(/^\d{1,2}\.\d{1,2}$/.test(raw)){const n=Number(raw);return Number.isFinite(n)?Math.round(n*60):null;}
 return null;
}
export function displayPace(seconds:number|null|undefined):string{
 if(seconds===null||seconds===undefined||!Number.isInteger(seconds)||seconds<0)return '';
 return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
