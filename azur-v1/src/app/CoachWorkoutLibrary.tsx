import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {validateWorkoutCandidate} from '../lib/calculations/coachWorkoutLibrary';
type RecordRow={id:string;workout_key:string;title:string;sport:'swim'|'bike'|'run';family:'aerobic_endurance'|'threshold'|'vo2max'|'strength_endurance'|'race_specific'|'recovery'|'technique';duration_min:number;level:1|2|3;phases:string[];prescription:Record<string,unknown>;approved:boolean;reviewed_at:string|null};
const empty={workout_key:'',title:'',sport:'run' as const,family:'aerobic_endurance' as const,duration_min:45,level:1 as const,phases:['base'],prescription:'{"steps":[{"durationMin":45,"target":"easy aerobic","unit":"minutes"}]}'};
export default function CoachWorkoutLibrary(){
 const [rows,setRows]=useState<RecordRow[]>([]);const [form,setForm]=useState({...empty});const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
 async function refresh(){const {data:{user}}=await supabase.auth.getUser();if(!user||user.app_metadata?.role!=='coach')throw new Error('Coach role required');const {data,error}=await supabase.from('coach_workout_library').select('id,workout_key,title,sport,family,duration_min,level,phases,prescription,approved,reviewed_at').order('created_at',{ascending:false}).limit(100);if(error)throw error;setRows((data??[]) as RecordRow[])}
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Library unavailable'))},[]);
 async function save(){setBusy(true);setError('');setMessage('');try{
 const {data:{user}}=await supabase.auth.getUser();if(!user||user.app_metadata?.role!=='coach')throw new Error('Coach login required');
 const prescription=JSON.parse(form.prescription) as Record<string,unknown>;
 const candidate={id:form.workout_key,title:form.title,sport:form.sport,family:form.family,durationMin:Number(form.duration_min),level:form.level,phases:form.phases as Array<'base'|'build'|'peak'|'taper'|'recovery'>,prescription};
 const issues=validateWorkoutCandidate(candidate);if(issues.length)throw new Error(issues.join('; '));
 const {error}=await supabase.from('coach_workout_library').insert({...{workout_key:candidate.id,title:candidate.title,sport:candidate.sport,family:candidate.family,duration_min:candidate.durationMin,level:candidate.level,phases:candidate.phases,prescription},created_by:user.id});
 if(error)throw error;setMessage('Workout saved as unapproved. Inspect prescription before approval.');await refresh();
 }catch(e){setError(e instanceof Error?e.message:'Could not save workout')}finally{setBusy(false)}}
 async function approve(row:RecordRow){setBusy(true);setError('');try{
 const {data:{user}}=await supabase.auth.getUser();if(!user||user.app_metadata?.role!=='coach')throw new Error('Coach login required');
 const issues=validateWorkoutCandidate({id:row.workout_key,title:row.title,sport:row.sport,family:row.family,durationMin:row.duration_min,level:row.level,phases:row.phases as Array<'base'|'build'|'peak'|'taper'|'recovery'>,prescription:row.prescription});if(issues.length)throw new Error(issues.join('; '));
 const {error}=await supabase.from('coach_workout_library').update({approved:true,reviewed_by:user.id,reviewed_at:new Date().toISOString()}).eq('id',row.id).eq('approved',false);
 if(error)throw error;await refresh();setMessage('Coach review recorded. Workout now eligible for planning.');
 }catch(e){setError(e instanceof Error?e.message:'Approval failed')}finally{setBusy(false)}}
 return <section className="coach-attention-group"><header className="coach-attention-heading"><div><h3>Coach workout library</h3><p>Draft first · inspect structured prescription · explicitly approve. Never automatically publishes sessions.</p></div><button type="button" onClick={()=>void refresh().catch(e=>setError(String(e)))}>Refresh</button></header>
 {error&&<p role="alert">{error}</p>}{message&&<p>{message}</p>}
 <details><summary>Add unapproved coach session</summary><div className="coach-feedback-notes">
 <label>Unique workout key<input value={form.workout_key} onChange={e=>setForm(v=>({...v,workout_key:e.target.value}))}/></label>
 <label>Title<input value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))}/></label>
 <label>Sport<select value={form.sport} onChange={e=>setForm(v=>({...v,sport:e.target.value as typeof v.sport}))}>{['swim','bike','run'].map(s=><option key={s}>{s}</option>)}</select></label>
 <label>Purpose<select value={form.family} onChange={e=>setForm(v=>({...v,family:e.target.value as typeof v.family}))}>{['aerobic_endurance','threshold','vo2max','strength_endurance','race_specific','recovery','technique'].map(s=><option key={s}>{s}</option>)}</select></label>
 <label>Duration minutes<input type="number" min="10" max="360" value={form.duration_min} onChange={e=>setForm(v=>({...v,duration_min:Number(e.target.value)}))}/></label>
 <label>Level<select value={form.level} onChange={e=>setForm(v=>({...v,level:Number(e.target.value) as 1|2|3}))}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
 <label>Phases (comma separated)<input value={form.phases.join(',')} onChange={e=>setForm(v=>({...v,phases:e.target.value.split(',').map(x=>x.trim())}))}/></label>
 <label>Structured prescription (JSON)<textarea rows={8} value={form.prescription} onChange={e=>setForm(v=>({...v,prescription:e.target.value}))}/></label>
 <button type="button" disabled={busy} onClick={()=>void save()}>Save unapproved draft</button></div></details>
 {rows.map(row=><article key={row.id} className="coach-attention-row"><div><strong>{row.title}</strong><p>{row.sport} · {row.family} · {row.duration_min} min · Level {row.level} · {row.approved?'Approved':'Needs coach approval'}</p><details><summary>Inspect complete prescription</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(row.prescription,null,2)}</pre></details></div>{!row.approved&&<button type="button" disabled={busy} onClick={()=>void approve(row)}>Approve reviewed session</button>}</article>)}
 {!rows.length&&<p>No coach-reviewed workouts stored yet.</p>}</section>;
}
