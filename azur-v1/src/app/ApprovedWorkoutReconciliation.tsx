import {useState} from 'react';
import {supabase} from '../lib/supabase';
import {reconcileIncompleteWeek} from '../lib/calculations/reconcileIncompleteWeek';
import type {SessionEntry,SessionFamily} from '../lib/calculations/sessionSelection';
type Existing={id:string;planned_date:string;sport:string;duration_min:number;status:string;locked:boolean;is_active_version:boolean};
type Plan={date:string;title:string;duration:number;sport:string};
const normalizePhase=(phase:string):SessionEntry['phases'][number]|null=>{const key=phase.trim().toLowerCase().split(/\s+/)[0];return ['base','build','peak','taper','recovery'].includes(key)?key as SessionEntry['phases'][number]:null};
const families:SessionFamily[]=['aerobic_endurance','technique','recovery','threshold','strength_endurance','race_specific','vo2max'];
export default function ApprovedWorkoutReconciliation({weekStart,targetHours,phase,existing}:{weekStart:string;targetHours:number;phase:string;existing:Existing[]}){
 const [choices,setChoices]=useState<Record<string,{sport:'swim'|'bike'|'run';family:SessionFamily;minutes:number}>>({});
 const [plans,setPlans]=useState<Plan[]>([]);const [info,setInfo]=useState('');const [busy,setBusy]=useState(false);
 const occupied=new Set(existing.filter(x=>x.is_active_version&&x.status!=='cancelled').map(x=>x.planned_date));
 const dates=Array.from({length:7},(_,i)=>{const d=new Date(weekStart+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)}).filter(x=>!occupied.has(x));
 async function preview(){setBusy(true);setInfo('');setPlans([]);try{
  const {data:{user}}=await supabase.auth.getUser();if(!user||user.app_metadata?.role!=='coach')throw new Error('Coach permission required');
  const normalizedPhase=normalizePhase(phase);if(!normalizedPhase)throw new Error('Training phase needs coach mapping before planning');
  const {data,error}=await supabase.from('coach_workout_library').select('workout_key,title,sport,family,duration_min,level,phases,prescription,approved').eq('approved',true);
  if(error)throw error;
  const library:SessionEntry[]=(data??[]).map(x=>({id:x.workout_key,title:x.title,sport:x.sport,family:x.family,durationMin:x.duration_min,level:x.level,phases:x.phases,prescription:x.prescription,approved:x.approved}));
  if(!library.length)throw new Error('No coach-approved workouts stored. Review and approve library sessions first.');
  const slots=dates.filter(d=>choices[d]).map(d=>{const c=choices[d];return {day:((new Date(d+'T12:00:00Z').getUTCDay()+6)%7) as 0|1|2|3|4|5|6,sport:c.sport,family:c.family,maxMinutes:c.minutes,maxLevel:1 as const}});
  if(!slots.length)throw new Error('Choose workouts for one or more free days');
  const x=reconcileIncompleteWeek({weekStart,targetHours,phase:normalizedPhase,existing,slots,library});
  setPlans(x.proposed.map(p=>({date:p.date,title:p.session.title,duration:p.session.durationMin,sport:p.session.sport})));
  setInfo(x.status==='blocked'?'Not publishable: '+x.reasons.join('; '):'Review-only proposal passes duration threshold. Coach approval and protected publication still required.');
 }catch(e){setInfo(e instanceof Error?e.message:'Unable to preview approved workouts')}finally{setBusy(false)}}
 return <details><summary>Propose additions from approved workout library</summary><div className="coach-feedback-notes"><p>Choose a suitable purpose and maximum duration for each available day. No changes are saved or published.</p>
 {dates.map(d=>{const c=choices[d];return <div key={d}><strong>{d}</strong><label>Workout<select value={c?.sport??''} onChange={e=>setChoices(v=>({...v,[d]:{sport:e.target.value as 'swim'|'bike'|'run',family:'aerobic_endurance',minutes:60}}))}><option value="">Rest day / no addition</option>{['swim','bike','run'].map(s=><option key={s} value={s}>{s}</option>)}</select></label>{c&&<><label>Purpose<select value={c.family} onChange={e=>setChoices(v=>({...v,[d]:{...c,family:e.target.value as SessionFamily}}))}>{families.map(f=><option key={f}>{f}</option>)}</select></label><label>Maximum minutes<input type="number" min="10" max="240" value={c.minutes} onChange={e=>setChoices(v=>({...v,[d]:{...c,minutes:Number(e.target.value)}}))}/></label></>}</div>})}
 <button type="button" disabled={busy} onClick={()=>void preview()}>Preview approved workout matches</button>{info&&<p role="status">{info}</p>}{plans.map(p=><p key={p.date}><strong>{p.date}: {p.title}</strong> · {p.sport} · {p.duration} min</p>)}</div></details>;
}
