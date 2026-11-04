import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Athlete={id:string;display_name:string};
type Benchmark={id:string;metric:string;value:number;assessed_on:string;source:string;
 source_note:string|null;verification:'verified'|'rejected'|null;verified_at:string|null;rationale:string|null};
type Step={duration_min:number;target:string;power_min_w?:number|null;power_max_w?:number|null};
type Pool={repeats:number;distance_m:number;rest_seconds:number;target:string;
 pace_min_seconds_per_100m?:number|null;pace_max_seconds_per_100m?:number|null};
type Prescription={status:'benchmark_required'|'ready_for_coach_review';reason?:string;
 required_metric?:string;title?:string;sport?:string;duration_min?:number;
 benchmark_value?:number;benchmark_metric?:string;benchmark_assessed_on?:string;
 steps?:Step[];pool_segments?:Pool[];swim_total_distance_m?:number;note?:string};
const WORKOUTS=[
 {key:'azur-bike-aerobic-base-90',label:'Bike · Aerobic Endurance 90m'},
 {key:'azur-bike-tempo-base-75',label:'Bike · Coach-reviewed Tempo 75m'},
 {key:'azur-swim-aerobic-base-55',label:'Swim · Aerobic 55m'},
 {key:'azur-swim-technique-base-45',label:'Swim · Technique 45m'},
 {key:'azur-run-easy-base-45',label:'Run · Easy Aerobic 45m'},
 {key:'azur-run-steady-base-60',label:'Run · Steady Aerobic 60m'}
];
const METRIC:Record<string,string>={bike_ftp_w:'Bike FTP (W)',
 swim_css_sec_100m:'Swim CSS (seconds/100m)',
 run_threshold_sec_km:'Run threshold (seconds/km)'};
function valueWithUnit(b:Benchmark){return String(b.value)+(b.metric==='bike_ftp_w'?' W':' sec');}
function pace(seconds:number|null|undefined){
 if(seconds==null)return 'RPE-led';
 return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+'/100m';
}
export default function CoachBenchmarkVerification(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [athlete,setAthlete]=useState('');
 const [benchmarks,setBenchmarks]=useState<Benchmark[]>([]);
 const [note,setNote]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [workout,setWorkout]=useState(WORKOUTS[0].key);
 const [preview,setPreview]=useState<Prescription|null>(null);
 useEffect(()=>{
   let active=true;
   (async()=>{
     const {data:{user}}=await supabase.auth.getUser();
     if(!active||!user||user.app_metadata?.role!=='coach')return;
     const assignments=await supabase.from('coach_athlete_assignment')
       .select('athlete_id').eq('coach_user_id',user.id);
     if(!active||assignments.error)return;
     const ids=(assignments.data||[]).map(x=>x.athlete_id);
     if(!ids.length)return;
     const people=await supabase.from('athlete_profile').select('id,display_name').in('id',ids);
     if(!active||people.error)return;
     const rows=(people.data||[]) as Athlete[];
     setAthletes(rows);
     setAthlete(a=>a||rows[0]?.id||'');
   })();
   return ()=>{active=false;};
 },[]);
 async function loadBenchmarks(id=athlete){
   if(!id||busy)return;
   setBusy(true);setMessage('');setPreview(null);
   const r=await supabase.rpc('coach_benchmark_review_queue',{p_athlete_id:id});
   setBusy(false);
   if(r.error){setMessage('Benchmark history unavailable: '+r.error.message);return;}
   setBenchmarks((r.data?.benchmarks||[]) as Benchmark[]);
 }
 async function decide(id:string,decision:'verified'|'rejected'){
   if(busy)return;
   const rationale=(note[id]||'').trim();
   if(rationale.length<15){setMessage('Enter at least 15 characters explaining the benchmark decision.');return;}
   setBusy(true);setMessage('');setPreview(null);
   const r=await supabase.rpc('coach_review_benchmark',{
     p_benchmark_id:id,p_decision:decision,p_rationale:rationale
   });
   setBusy(false);
   if(r.error){setMessage('Decision not saved: '+r.error.message);return;}
   await loadBenchmarks();
   setMessage(decision==='verified'?
     'Benchmark verified. Approved, compatible workouts can now use it for individual targets.':
     'Benchmark rejected. The original athlete entry remains visible but cannot unlock threshold sessions.');
 }
 async function showPreview(){
   if(!athlete||busy)return;
   setBusy(true);setMessage('');setPreview(null);
   const r=await supabase.rpc('coach_verified_workout_preview',{
     p_athlete_id:athlete,p_workout_key:workout
   });
   setBusy(false);
   if(r.error){setMessage('Workout preview unavailable: '+r.error.message);return;}
   setPreview(r.data as Prescription);
 }
 return <section aria-label="Benchmark verification and workout targets"
 style={{background:'#eff6fd',color:'#193d58',border:'1px solid #adcadd',
 borderRadius:16,padding:16,margin:'16px 0'}}>
  <strong style={{fontSize:18}}>Verified benchmarks & individual workouts</strong>
  <p style={{fontSize:13,lineHeight:1.5,margin:'8px 0'}}>
   Athlete-entered FTP, CSS and running thresholds are unverified until reviewed
   by their assigned coach. Coach decisions never change the calendar themselves.
  </p>
  <div style={{display:'flex',gap:9,flexWrap:'wrap',alignItems:'end'}}>
   <label style={{flex:'1 1 180px',fontSize:13}}>Assigned athlete
    <select value={athlete} onChange={e=>{
      setAthlete(e.target.value);setBenchmarks([]);setPreview(null);setMessage('');
    }} style={{display:'block',width:'100%',padding:10,borderRadius:9,marginTop:5}}>
     {!athletes.length&&<option value="">No assigned athletes</option>}
     {athletes.map(a=><option key={a.id} value={a.id}>{a.display_name||'Athlete'}</option>)}
    </select>
   </label>
   <button type="button" disabled={busy||!athlete} onClick={()=>void loadBenchmarks()}>
    {busy?'Loading…':'Review submitted tests'}
   </button>
  </div>
  {benchmarks.length>0&&<div style={{display:'grid',gap:10,marginTop:13}}>
   {benchmarks.map(b=><div key={b.id} style={{
     border:'1px solid #cadde9',borderRadius:11,padding:12,background:'#fff'}}>
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
      <strong style={{fontSize:14}}>{METRIC[b.metric]||b.metric}: {valueWithUnit(b)}</strong>
      <span style={{fontSize:11,fontWeight:650}}>
       {b.verification||'Awaiting coach verification'}
      </span>
     </div>
     <p style={{fontSize:12,margin:'6px 0'}}>
      Assessed {b.assessed_on} · {b.source.replaceAll('_',' ')}
     </p>
     <p style={{fontSize:12,margin:'6px 0',color:'#4e687e'}}>
      Athlete evidence: {b.source_note||'No supporting test notes'}
     </p>
     {b.verification?<p style={{fontSize:12,margin:'6px 0'}}>
       Coach rationale: {b.rationale}</p>:<>
       <label style={{display:'block',fontSize:12,marginTop:8}}>
        Coach assessment rationale
        <textarea value={note[b.id]||''}
         onChange={e=>setNote(n=>({...n,[b.id]:e.target.value}))}
         placeholder="Review test protocol, results, effort, date and appropriate zone use"
         style={{display:'block',width:'100%',boxSizing:'border-box',minHeight:65,
           padding:8,marginTop:4,borderRadius:8}}/>
       </label>
       <div style={{display:'flex',gap:8,marginTop:9,flexWrap:'wrap'}}>
        <button type="button" disabled={busy} onClick={()=>void decide(b.id,'verified')}>
         Verify benchmark
        </button>
        <button type="button" disabled={busy} onClick={()=>void decide(b.id,'rejected')}>
         Reject benchmark
        </button>
       </div>
     </>}
   </div>)}
  </div>}
  <div style={{borderTop:'1px solid #c8dbe9',marginTop:15,paddingTop:13}}>
   <strong>Preview individual workout targets</strong>
   <p style={{fontSize:12,margin:'6px 0 9px'}}>
    Uses only explicitly supported, approved coach-library workouts.
    A benchmark must have been verified and assessed within the last 120 days.
   </p>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}>
    <label style={{flex:'1 1 180px',fontSize:12}}>Workout
     <select value={workout} onChange={e=>{setWorkout(e.target.value);setPreview(null);}}
      style={{display:'block',width:'100%',padding:10,borderRadius:9,marginTop:4}}>
      {WORKOUTS.map(w=><option key={w.key} value={w.key}>{w.label}</option>)}
     </select>
    </label>
    <button type="button" disabled={!athlete||busy} onClick={()=>void showPreview()}>
     Preview targets
    </button>
   </div>
   {preview&&<div style={{background:'#fff',border:'1px solid #d7e4ee',
      borderRadius:12,padding:12,marginTop:10}}>
    {preview.status==='benchmark_required'?<>
      <strong style={{fontSize:13}}>Verified benchmark required</strong>
      <p style={{fontSize:12}}>{preview.reason}</p>
    </>:<>
      <strong style={{fontSize:14}}>{preview.title} · {preview.duration_min}min</strong>
      {preview.benchmark_metric&&<p style={{fontSize:12}}>
       Verified {METRIC[preview.benchmark_metric]||preview.benchmark_metric}:
       {' '}{preview.benchmark_value} · assessed {preview.benchmark_assessed_on}
      </p>}
      {(preview.steps||[]).map((step,i)=><div key={i} style={{
        padding:'8px 0',borderBottom:'1px solid #e6edf2',fontSize:12}}>
        <strong>{step.duration_min}min</strong> · {step.target}
        {step.power_max_w!=null?' · '+(step.power_min_w??'≤')+'–'+step.power_max_w+' W':''}
      </div>)}
      {(preview.pool_segments||[]).map((seg,i)=><div key={i} style={{
        padding:'8px 0',borderBottom:'1px solid #e6edf2',fontSize:12}}>
        <strong>{seg.repeats} × {seg.distance_m}m</strong> · {seg.target}
        {seg.pace_min_seconds_per_100m!=null?' · '+pace(seg.pace_min_seconds_per_100m)+
          ' to '+pace(seg.pace_max_seconds_per_100m):''}
        {' · '+seg.rest_seconds+'s rest between repeats'}
      </div>)}
      {preview.swim_total_distance_m!=null&&<p style={{fontSize:12,fontWeight:650}}>
        Total pool distance: {preview.swim_total_distance_m}m
      </p>}
      <p style={{fontSize:12,fontWeight:650}}>
       Coach review required. This is a preview only; no session has been scheduled.
      </p>
    </>}
   </div>}
  </div>
  {message&&<p role="status" style={{fontSize:12,fontWeight:650,marginTop:9}}>{message}</p>}
 </section>;
}
