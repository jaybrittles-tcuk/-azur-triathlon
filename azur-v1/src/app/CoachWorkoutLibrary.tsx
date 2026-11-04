import WorkoutPrescriptionView from './WorkoutPrescriptionView';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {validateWorkoutCandidate} from '../lib/calculations/coachWorkoutLibrary';
import {estimateSwimMinutes} from '../lib/calculations/swimDurationEstimate';
type RecordRow={id:string;workout_key:string;title:string;sport:'swim'|'bike'|'run';family:'aerobic_endurance'|'threshold'|'vo2max'|'strength_endurance'|'race_specific'|'recovery'|'technique';duration_min:number;level:1|2|3;phases:string[];prescription:Record<string,unknown>;approved:boolean;reviewed_at:string|null};
const empty={workout_key:'',title:'',sport:'run' as const,family:'aerobic_endurance' as const,duration_min:45,level:1 as const,phases:['base'],prescription:'{"steps":[{"durationMin":45,"target":"easy aerobic","unit":"minutes"}]}'};
export default function CoachWorkoutLibrary(){
 const [cssInput,setCssInput]=useState('');const [query,setQuery]=useState('');const [sportFilter,setSportFilter]=useState('all');const [showAll,setShowAll]=useState(false);const [rows,setRows]=useState<RecordRow[]>([]);const [form,setForm]=useState({...empty});const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
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
 const filtered=rows.filter(row=>(sportFilter==='all'||row.sport===sportFilter)&&(!query.trim()||[row.title,row.family,row.sport].some(v=>v.toLowerCase().includes(query.trim().toLowerCase()))));
 const visible=showAll?filtered:filtered.slice(0,5);
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
 <div style={{display:'flex',flexWrap:'wrap',gap:9,margin:'12px 0',minWidth:0}}>
 <label style={{flex:'1 1 180px',minWidth:0}}>Find a workout<input type="search" placeholder="Search workouts" value={query} onChange={e=>{setQuery(e.target.value);setShowAll(false)}} style={{width:'100%',minWidth:0}}/></label>
 <label style={{flex:'0 1 120px',minWidth:0}}>Sport<select value={sportFilter} onChange={e=>{setSportFilter(e.target.value);setShowAll(false)}} style={{width:'100%'}}><option value="all">All</option><option value="swim">Swim</option><option value="bike">Bike</option><option value="run">Run</option></select></label>
 </div>
 <p style={{fontSize:12,color:'#a8c4d6',margin:'5px 0 12px'}}>{filtered.length} sessions · showing {visible.length}</p>
 {rows.some(r=>r.sport==='swim')&&sportFilter==='swim'&&<label>Swim timing check: athlete CSS (seconds per 100m) <input type="number" min="50" max="240" step="1" placeholder="Enter verified CSS" value={cssInput} onChange={e=>setCssInput(e.target.value)}/></label>}
 {visible.map(row=><article key={row.id} className="coach-attention-row"><div><strong>{row.title}</strong><p>{row.sport} · {row.family} · {row.duration_min} min · Level {row.level} · {row.approved?'Approved':'Needs coach approval'}</p>{row.sport==='swim'&&(()=>{const segments=(row.prescription as {poolSegments?:unknown}).poolSegments;const estimate=estimateSwimMinutes(Array.isArray(segments)?segments as Parameters<typeof estimateSwimMinutes>[0]:[],cssInput.trim()?Number(cssInput):NaN);return <p>{estimate.status==='estimated'?`Expected swim duration: ${estimate.lowMinutes}–${estimate.highMinutes} min (${estimate.distanceMeters}m), versus ${row.duration_min} min listed. Approximate only; coach must validate pace, drills and rests.`:'CSS required to estimate swim duration. Do not assume advertised session minutes match an individual athlete.'}</p>})()}
 <details><summary>Inspect complete prescription</summary><WorkoutPrescriptionView prescription={row.prescription}/></details></div>{!row.approved&&<button type="button" disabled={busy} onClick={()=>void approve(row)}>Approve reviewed session</button>}</article>)}
 {filtered.length>5&&<button type="button" onClick={()=>setShowAll(v=>!v)} style={{margin:'14px 0',minHeight:44,width:'100%',borderRadius:11,border:'1px solid #376889',background:'#153b58',color:'#e4f5ff'}}>{showAll?'Show fewer workouts':`Show all ${filtered.length} workouts`}</button>}
 {rows.length===0&&<p>No coach-reviewed workouts stored yet.</p>}
 {rows.length>0&&filtered.length===0&&<p>No workouts match this filter.</p>}</section>;
}
