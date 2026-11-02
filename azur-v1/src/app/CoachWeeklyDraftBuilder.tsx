import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Athlete={id:string;display_name:string};
type Week={week_start:string;phase:string;target_hours:number;locked:boolean};
type Workout={workout_key:string;title:string;sport:string;family:string;duration_min:number;level:number;phases:string[];prescription:unknown;approved:boolean};
type Pick={key:string;priority:number};
const monday=()=>{const d=new Date();d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)};
const dateAt=(start:string,i:number)=>{const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)};
const objectPrescription=(x:unknown)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length>0;
export default function CoachWeeklyDraftBuilder({onSaved}:{onSaved:()=>void}){
 const [athletes,setAthletes]=useState<Athlete[]>([]),[selected,setSelected]=useState(''),[week,setWeek]=useState(monday()),[weekRecord,setWeekRecord]=useState<Week|null>(null);
 const [library,setLibrary]=useState<Workout[]>([]),[picks,setPicks]=useState<Record<string,Pick>>({}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user||user.app_metadata?.role!=='coach')return;
 const {data:assign,error}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
 if(error){if(active)setMessage(error.message);return}
 const ids=(assign??[]).map(x=>x.athlete_id);
 if(!ids.length)return;
 const [p,l]=await Promise.all([supabase.from('athlete_profile').select('id,display_name').in('id',ids),supabase.from('coach_workout_library').select('workout_key,title,sport,family,duration_min,level,phases,prescription,approved').eq('approved',true)]);
 if(!active)return;
 if(p.error||l.error){setMessage(p.error?.message||l.error?.message||'Unable to load approved workouts');return}
 setAthletes(p.data??[]);setSelected(ids[0]);setLibrary((l.data??[]) as Workout[]);
 })();return()=>{active=false}},[]);
 useEffect(()=>{let active=true;setWeekRecord(null);setPicks({});if(!selected)return;
 (async()=>{const {data,error}=await supabase.from('season_week').select('week_start,phase,target_hours,locked').eq('athlete_id',selected).eq('week_start',week).maybeSingle();
 if(active){setWeekRecord((data as Week|null)??null);if(error)setMessage(error.message)}})();
 return()=>{active=false}},[selected,week]);
 const phase=weekRecord?.phase?.toLowerCase()??'';
 const candidates=library.filter(x=>x.phases?.includes(phase)&&objectPrescription(x.prescription)&&['bike','run','swim'].includes(x.sport)&&x.duration_min>0);
 const chosen=Array.from({length:7},(_,i)=>{const date=dateAt(week,i),pick=picks[date],workout=candidates.find(x=>x.workout_key===pick?.key);return {date,pick,workout}}).filter(x=>x.workout);
 const total=chosen.reduce((n,x)=>n+(x.workout?.duration_min??0),0),target=Number(weekRecord?.target_hours??0)*60;
 const blockers=[...(!weekRecord?['No verified weekly target exists for this athlete and week']:[]),...(weekRecord?.locked?['The week is locked']:[]),...(!['base','build','peak','taper','recovery'].includes(phase)?['Training phase requires review']:[]),...(target<=0?['Target hours must be positive']:[]),...(chosen.length===0?['Choose at least one approved workout']:[]),...(chosen.some(x=>!x.pick||!x.pick.priority)?['Session priority must be chosen']:[]),...(target>0&&(total<target*.9||total>target*1.1)?['Selected duration must fall within 90–110% of the verified target']:[])];
 async function save(){
  setBusy(true);setMessage('');
  try{
   if(blockers.length)throw new Error(blockers.join('; '));
   if(new Date(week+'T12:00:00Z').getUTCDay()!==1)throw new Error('Week must begin on Monday');
   const {data:{user}}=await supabase.auth.getUser();if(!user||user.app_metadata?.role!=='coach')throw new Error('Coach sign-in required');
   const [active,existing]=await Promise.all([
    supabase.from('planned_session').select('id').eq('athlete_id',selected).gte('planned_date',week).lte('planned_date',dateAt(week,6)).eq('is_active_version',true).neq('status','cancelled').limit(1),
    supabase.from('weekly_plan_draft').select('revision').eq('athlete_id',selected).eq('week_start',week).order('revision',{ascending:false}).limit(1)
   ]);
   if(active.error||existing.error)throw new Error(active.error?.message||existing.error?.message);
   if(active.data?.length)throw new Error('Existing calendar sessions need reconciliation first');
   if(existing.data?.length)throw new Error('This week already has a saved draft. Revisions must be reviewed through a separate edit workflow.');
   const sessions=chosen.map(({date,pick,workout})=>({date,session:{
    id:workout!.workout_key,title:workout!.title,sport:workout!.sport,
    sessionClass:workout!.family,priority:pick!.priority,durationMin:workout!.duration_min,
    prescription:workout!.prescription,targets:{},rationale:'Selected from coach-approved AZUR workout library'
   }}));
   const canonical=JSON.stringify(sessions);
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
   const fingerprint=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
   const {error}=await supabase.from('weekly_plan_draft').insert({athlete_id:selected,week_start:week,revision:1,phase,sessions,proposal_fingerprint:fingerprint,created_by:user.id});
   if(error)throw error;
   setMessage('Draft saved for coach review. No calendar changes made.');onSaved();
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to save draft')}finally{setBusy(false)}
 }
 return <details className="coach-feedback-notes"><summary>Create a weekly proposal from approved workouts</summary>
  <p>Coach-controlled draft only. Nothing is published to the athlete calendar.</p>
  <label>Athlete <select value={selected} onChange={e=>setSelected(e.target.value)}>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}</select></label>
  <label>Monday of training week <input type="date" value={week} onChange={e=>setWeek(e.target.value)}/></label>
  <p>Weekly target: {weekRecord?weekRecord.target_hours+' hours · '+weekRecord.phase:'Not recorded'} · Chosen: {total} minutes</p>
  {Array.from({length:7},(_,i)=>{const date=dateAt(week,i),pick=picks[date];return <div key={date}><strong>{date}</strong>
   <label>Approved workout <select value={pick?.key??''} onChange={e=>setPicks(old=>({...old,[date]:{key:e.target.value,priority:pick?.priority??2}}))}>
    <option value="">Rest / no session</option>{candidates.map(x=><option key={x.workout_key} value={x.workout_key}>{x.sport} · {x.title} · {x.duration_min} min</option>)}
   </select></label>
   {pick?.key&&<label>Coach-selected priority <select value={pick.priority} onChange={e=>setPicks(old=>({...old,[date]:{...pick,priority:Number(e.target.value)}}))}>
    <option value={1}>1 — Key</option><option value={2}>2 — Supporting</option><option value={3}>3 — Optional</option>
   </select></label>}</div>})}
  {blockers.map(x=><p key={x}>{x}</p>)}
  <button type="button" disabled={busy||blockers.length>0} onClick={()=>void save()}>Save draft for coach review</button>
  {message&&<p role="status">{message}</p>}
 </details>
}
