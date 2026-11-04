import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Athlete={id:string;display_name:string};
type Week={week:number;week_start:string;phase:string;status:string;reason:string;
 suggested_minutes:number|null;sport_minutes:Record<string,number>|null;
 recovery_week:boolean;relative_to_source:number|null};
type Block={status:string;block_reason:string|null;race_distance:string;race_date:string|null;
 source_week_start:string;source_week_minutes:number;
 validated_sessions:number;validated_weeks:number;observed_weekly_hours:number;
 reported_weekly_hours:number|null;long_bike_review_ceiling_min:number|null;
 long_run_review_ceiling_min:number|null;weeks:Week[];note:string};
function hours(minutes:number|null){return minutes==null?'—':(minutes/60).toFixed(1)+'h';}
export default function CoachFourWeekProgression(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [selected,setSelected]=useState('');
 const [block,setBlock]=useState<Block|null>(null);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  let active=true;
  (async()=>{
   const {data:{user}}=await supabase.auth.getUser();
   if(!active||!user||user.app_metadata?.role!=='coach')return;
   const assignments=await supabase.from('coach_athlete_assignment')
    .select('athlete_id').eq('coach_user_id',user.id);
   if(!active)return;
   if(assignments.error){setMessage('Cannot load assignments: '+assignments.error.message);return;}
   const ids=(assignments.data||[]).map(a=>a.athlete_id);
   if(!ids.length)return;
   const names=await supabase.from('athlete_profile').select('id,display_name').in('id',ids);
   if(!active)return;
   if(names.error){setMessage('Cannot load athletes: '+names.error.message);return;}
   const rows=(names.data||[]) as Athlete[];
   setAthletes(rows);setSelected(s=>s||rows[0]?.id||'');
  })();
  return ()=>{active=false;};
 },[]);
 async function assess(){
  if(!selected||busy)return;
  setBusy(true);setMessage('');setBlock(null);
  const response=await supabase.rpc('coach_four_week_progression_preview',{p_athlete_id:selected});
  setBusy(false);
  if(response.error){setMessage('Unable to assess four-week block: '+response.error.message);return;}
  setBlock(response.data as Block);
 }
 return <section aria-label="AZUR four-week training progression" style={{
  background:'#eff5fa',border:'1px solid #9ebdd4',borderRadius:16,
  padding:16,margin:'16px 0',color:'#173852'}}>
  <strong style={{fontSize:18}}>Four-week training block</strong>
  <p style={{fontSize:13,lineHeight:1.5,margin:'8px 0 12px'}}>
   Assess a conservative progression and deload before planning each week.
   Recommendations use validated training, race phase, availability and the approved calendar.
  </p>
  <div style={{display:'flex',gap:9,flexWrap:'wrap',alignItems:'end'}}>
   <label style={{flex:'1 1 170px',fontSize:13}}>Assigned athlete
    <select value={selected} onChange={e=>{setSelected(e.target.value);setBlock(null);setMessage('');}}
     style={{display:'block',width:'100%',padding:10,borderRadius:9,marginTop:5}}>
     {!athletes.length&&<option value="">No athletes assigned</option>}
     {athletes.map(a=><option key={a.id} value={a.id}>{a.display_name||'Athlete'}</option>)}
    </select>
   </label>
   <button type="button" disabled={!selected||busy} onClick={()=>void assess()}>
    {busy?'Assessing…':'Assess four-week block'}
   </button>
  </div>
  {message&&<p role="alert" style={{fontSize:12,marginTop:10}}>{message}</p>}
  {block&&<div style={{marginTop:14,borderTop:'1px solid #c5d7e5',paddingTop:14}}>
   <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
    <strong>{block.race_distance==='70.3'?'IRONMAN 70.3':
      block.race_distance==='ironman'?'IRONMAN':'Race not confirmed'}</strong>
    {block.race_date&&<span style={{fontSize:12,color:'#526e83'}}>Race: {block.race_date}</span>}
    <span style={{padding:'4px 8px',borderRadius:20,fontSize:11,fontWeight:650,
     background:block.status==='review_available'?'#dceddf':'#fff0d7'}}>
     {block.status==='review_available'?'Coach review available':'Evidence or safety hold'}
    </span>
   </div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(105px,1fr))',
    gap:8,margin:'12px 0'}}>
    {[
      {label:'Current week',value:hours(block.source_week_minutes)},
      {label:'Observed device load',value:block.observed_weekly_hours+'h/wk'},
      {label:'Validated sessions',value:String(block.validated_sessions)}
    ].map(x=><div key={x.label} style={{padding:10,background:'#fff',borderRadius:10}}>
     <small style={{display:'block',fontSize:11,color:'#527187'}}>{x.label}</small>
     <strong style={{display:'block',marginTop:5,fontSize:18}}>{x.value}</strong>
    </div>)}
   </div>
   {block.block_reason&&<p role="status" style={{
    background:'#fff7e9',padding:11,borderRadius:9,fontSize:12,fontWeight:600,lineHeight:1.5}}>
    {block.block_reason}
   </p>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',
    gap:9,marginTop:10}}>
    {block.weeks.map(w=><div key={w.week} style={{
     background:'#fff',border:'1px solid #d5e3ef',borderRadius:12,padding:12}}>
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
      <strong style={{fontSize:13}}>Week {w.week}</strong>
      <span style={{fontSize:11,color:w.recovery_week?'#8c651e':'#47718a'}}>
       {w.recovery_week?'Deload':'Build/maintain'}
      </span>
     </div>
     <small style={{display:'block',marginTop:4,color:'#58778b'}}>
      {w.week_start} · {w.phase.replaceAll('_',' ')}
     </small>
     <strong style={{display:'block',fontSize:22,marginTop:7}}>
      {hours(w.suggested_minutes)}
     </strong>
     <small style={{fontSize:11,color:'#607a8e'}}>{w.status.replaceAll('_',' ')}</small>
     {w.sport_minutes&&<p style={{fontSize:12,lineHeight:1.5,margin:'8px 0'}}>
      Swim {w.sport_minutes.swim}m · Bike {w.sport_minutes.bike}m · Run {w.sport_minutes.run}m
     </p>}
     <p style={{fontSize:11,lineHeight:1.45,color:'#556f82',margin:'9px 0 0'}}>{w.reason}</p>
    </div>)}
   </div>
   <p style={{fontSize:12,margin:'12px 0 6px'}}>
    Long ride review ceiling: <strong>{block.long_bike_review_ceiling_min??'Not established'} min</strong>
    {' · '}Long run review ceiling: <strong>{block.long_run_review_ceiling_min??'Not established'} min</strong>
   </p>
   <p style={{fontSize:12,lineHeight:1.5,color:'#526f83'}}>{block.note}</p>
   <strong style={{fontSize:12}}>Planning preview only — no calendar changes.</strong>
  </div>}
 </section>;
}
