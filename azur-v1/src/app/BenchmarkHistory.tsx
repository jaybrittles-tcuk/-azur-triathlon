import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
type Metric='bike_ftp_w'|'run_threshold_sec_km'|'swim_css_sec_100m';
type Result={id:string;metric:Metric;value:number;assessed_on:string;source:string};
const choices:[Metric,string,string][]=[['bike_ftp_w','Bike FTP','W'],['run_threshold_sec_km','Run threshold','/km'],['swim_css_sec_100m','Swim CSS','/100m']];
const pace=(v:number)=>`${Math.floor(v/60)}:${String(Math.round(v%60)).padStart(2,'0')}`;
function show(metric:Metric,value:number){return metric==='bike_ftp_w'?`${Math.round(value)} W`:`${pace(value)}${metric==='run_threshold_sec_km'?'/km':'/100m'}`;}
export default function BenchmarkHistory(){
 const [athleteId,setAthleteId]=useState<string|null>(null);
 const [results,setResults]=useState<Result[]>([]);
 const [metric,setMetric]=useState<Metric>('bike_ftp_w');
 const [date,setDate]=useState('');
 const [value,setValue]=useState('');
 const [source,setSource]=useState('structured_test');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [available,setAvailable]=useState(true);
 async function refresh(id:string) {
  const q=await supabase.from('athlete_benchmark_history').select('id,metric,value,assessed_on,source').eq('athlete_id',id).order('assessed_on',{ascending:true}).limit(1000);
  if(q.error){setAvailable(false);setMessage('Benchmark history is not available in this environment.');return;}
  setResults((q.data??[]) as Result[]);setAvailable(true);
 }
 useEffect(()=>{let disposed=false;(async()=>{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user||disposed)return;
  const {data:profile}=await supabase.from('athlete_profile').select('id').eq('user_id',user.id).maybeSingle();
  if(disposed||!profile)return;
  setAthleteId(profile.id);await refresh(profile.id);
 })();return()=>{disposed=true};},[]);
 const current=results.filter(r=>r.metric===metric).sort((a,b)=>a.assessed_on.localeCompare(b.assessed_on));
 const min=Math.min(...current.map(r=>r.value)),max=Math.max(...current.map(r=>r.value)),span=Math.max(1,max-min);
 const points=current.map((r,i)=>`${12+i*296/Math.max(1,current.length-1)},${116-(r.value-min)/span*94}`).join(' ');
 async function add(){
  if(!athleteId||!available||busy)return;
  const numeric=Number(value);
  const limits=metric==='bike_ftp_w'?[30,1500]:metric==='run_threshold_sec_km'?[90,1800]:[30,900];
  if(!date||date>new Date().toISOString().slice(0,10)||!Number.isFinite(numeric)||numeric<limits[0]||numeric>limits[1]) {
   setMessage('Enter a valid result and a test date that is not in the future.');return;
  }
  setBusy(true);setMessage('');
  const {error}=await supabase.from('athlete_benchmark_history').insert({athlete_id:athleteId,metric,value:numeric,assessed_on:date,source});
  if(error)setMessage('Could not save benchmark history: '+error.message);
  else {setValue('');setDate('');await refresh(athleteId);setMessage('Historical assessment saved. Current training zones were not changed.');}
  setBusy(false);
 }
 return <section className="panel azur-benchmark-history" aria-label="Benchmark history">
  <div className="section-heading"><div><span className="eyebrow">PERFORMANCE PROGRESSION</span><h3>Benchmark history</h3></div></div>
  <p className="panel-note">Track previous assessments alongside current training zones. Existing zone thresholds are never overwritten by adding history.</p>
  <div className="azur-zone-switch" role="group" aria-label="Benchmark history sport">
   {choices.map(([key,label])=><button type="button" key={key} aria-pressed={metric===key} onClick={()=>setMetric(key)}>{label}</button>)}
  </div>
  {!available?<p role="status">Historical benchmarks are not enabled for this environment.</p>:
   current.length===0?<p className="azur-v2-performance-empty">No previous assessments saved for this sport yet.</p>:
   <><svg className="azur-benchmark-history-graph" viewBox="0 0 320 135" role="img" aria-label={`Trend of ${current.length} recorded benchmark results`}>
     <line x1="12" y1="122" x2="308" y2="122" stroke="currentColor" opacity=".25"/>
     <polyline points={points} fill="none" stroke="#329dff" strokeWidth="3" strokeLinejoin="round"/>
     {current.map((r,i)=><circle key={r.id} cx={12+i*296/Math.max(1,current.length-1)} cy={116-(r.value-min)/span*94} r="4" fill="#f4c84b"/>)}
    </svg>
    <div className="azur-benchmark-history-items">{current.slice().reverse().slice(0,8).map(r=><div key={r.id}><span>{r.assessed_on} · {r.source.replaceAll('_',' ')}</span><strong>{show(metric,r.value)}</strong></div>)}</div></>}
  <div className="azur-benchmark-history-form">
   <strong>Add a previous assessment</strong>
   <label>Result ({metric==='bike_ftp_w'?'watts':'seconds per '+(metric==='run_threshold_sec_km'?'km':'100m')})<input inputMode="decimal" type="number" min="1" value={value} onChange={e=>setValue(e.target.value)} /></label>
   <label>Test date<input type="date" value={date} max={new Date().toISOString().slice(0,10)} onChange={e=>setDate(e.target.value)}/></label>
   <label>Source<select value={source} onChange={e=>setSource(e.target.value)}><option value="structured_test">Structured test</option><option value="race">Race</option><option value="device_estimate">Device estimate</option><option value="coach_assessed">Coach assessment</option><option value="manual_other">Other</option></select></label>
   <button className="primary-button" type="button" disabled={!available||!athleteId||busy} onClick={()=>void add()}>Save assessment</button>
   {message&&<p role="status">{message}</p>}
  </div>
  <small>Run/swim result entry uses seconds, not mm:ss. This is historical recording only: your coach should validate results before applying them to current training targets.</small>
 </section>;
}
