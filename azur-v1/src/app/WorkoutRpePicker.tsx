import './premiumWorkoutV103.css';
type Props={value:string;disabled?:boolean;onChange:(value:string)=>void};
const descriptions=['','Very easy','Easy','Easy','Comfortable','Moderate','Steady hard','Hard','Very hard','Near maximal','Maximal'];
export default function WorkoutRpePicker({value,disabled=false,onChange}:Props){
 return <fieldset className="azur-v103-rpe" disabled={disabled}>
  <legend>How hard did this session feel?</legend>
  <div className="azur-v103-rpe-grid">
   {Array.from({length:10},(_,i)=>i+1).map(n=><button type="button" key={n} aria-pressed={value===String(n)} className={value===String(n)?'selected':''} onClick={()=>onChange(String(n))} disabled={disabled} title={descriptions[n]}>{n}</button>)}
  </div>
  <small>{value?descriptions[Number(value)]+' · '+value+'/10':'Select your session effort from 1 (very easy) to 10 (maximal)'}</small>
 </fieldset>;
}
