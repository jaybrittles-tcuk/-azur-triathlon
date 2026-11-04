/** Parse athlete-entered min:sec and min.sec clock notation (not decimal minutes). */
export function parseAthletePace(input){
 const value=String(input??'').trim();
 if(!value)return null;
 const match=value.match(/^(\d{1,2})[:.]([0-5]\d)$/);
 return match?Number(match[1])*60+Number(match[2]):NaN;
}
export function formatAthletePace(seconds){
 return Number.isFinite(seconds)&&seconds>0?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'';
}
