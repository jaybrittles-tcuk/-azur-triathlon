import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Session={date:string;sport:string;title:string;duration_min:number;locked:boolean;status:string};
type Advice={
 week_start:string;status:string;confidence:string;reason:string;next_action:string;
 existing_week_hours:number;existing_session_count:number;existing_sessions:Session[];
 validated_weekly_average_hours:number;validated_sessions:number;
 reported_recent_hours:number|null;available_weekly_hours:number;
 recent_hard_rpe_sessions:number;recent_hard_rpe_feedback:number;
 suggested_max_weekly_hours:number|null;training_concern:string;
 workout_selection_guidance:string;publication_status:string;
};
type Athlete={id:string;display_name:string};
export default function CoachNextWeekIntelligence(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [selected,setSelected]=useState('');
 const [advice,setAdvice]=useState<Advice|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
   let live=true;
   (async()=>{
     const {data:{user}}=await supabase.auth.getUser();
     if(!user || user.app_metadata?.role!=='coach')return;
     const assigned=await supabase.from('coach_athlete_assignment')
       .select('athlete_id').eq('coach_user_id',user.id);
     if(!live)return;
     if(assigned.error){setMessage('Cannot load assignments: '+assigned.error.message);return;}
     const ids=(assigned.data||[]).map(x=>x.athlete_id);
     if(!ids.length)return;
     const people=await supabase.from('athlete_profile').select('id,display_name').in('id',ids);
     if(!live)return;
     if(people.error){setMessage('Cannot load assigned athletes: '+people.error.message);return;}
     const results=(people.data||[]) as Athlete[];
     setAthletes(results);
     setSelected(s=>s||results[0]?.id||'');
   })();
   return ()=>{live=false;};
 },[]);
 async function refresh(){
   if(!selected||busy)return;
   setBusy(true);setMessage('');setAdvice(null);
   const result=await supabase.rpc('coach_next_week_adaptive_preview',{p_athlete_id:selected});
   if(result.error)setMessage('Next-week recommendation unavailable: '+result.error.message);
   else if(result.data)setAdvice(result.data as Advice);
   setBusy(false);
 }
 const status=advice?.status;
 return <section aria-label="Adaptive next-week planning" style={{
   background:'#f1f7fc',color:'#17354b',borderRadius:16,
   border:'1px solid #9fc0d8',padding:16,margin:'16px 0'}}>
   <strong style={{fontSize:18}}>Next-week training intelligence</strong>
   <p style={{fontSize:13,lineHeight:1.55,margin:'8px 0 12px'}}>
     Review validated completed training, recent effort feedback and the upcoming
     calendar before proposing a change. No workout is published from this panel.
   </p>
   <div style={{display:'flex',gap:9,flexWrap:'wrap',alignItems:'end'}}>
    <label style={{flex:'1 1 160px',fontSize:13}}>
     Assigned athlete
     <select style={{display:'block',width:'100%',marginTop:5,padding:10,borderRadius:9}}
      value={selected} onChange={e=>{setSelected(e.target.value);setAdvice(null);setMessage('');}}>
      {!athletes.length&&<option value="">No athletes assigned</option>}
      {athletes.map(a=><option key={a.id} value={a.id}>{a.display_name||'Athlete'}</option>)}
     </select>
    </label>
    <button type="button" disabled={!selected||busy} onClick={()=>void refresh()}
      style={{padding:'10px 14px',borderRadius:10}}>
      {busy?'Assessing…':'Assess next week'}
    </button>
   </div>
   {message&&<p role="alert" style={{fontSize:13,marginTop:9}}>{message}</p>}
   {advice&&<div style={{marginTop:14,borderTop:'1px solid #c9deec',paddingTop:13}}>
     <div style={{display:'flex',alignItems:'center',gap:9,flexWrap:'wrap'}}>
       <strong>Week of {new Date(advice.week_start+'T12:00:00Z').toLocaleDateString('en-GB',{
         day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}</strong>
       <span style={{borderRadius:20,background:status==='conservative_reference'?'#e1f0e7':'#fff0d7',
         color:status==='conservative_reference'?'#22563b':'#754617',
         fontWeight:650,padding:'4px 9px',fontSize:12}}>
         {status?.replaceAll('_',' ')}
       </span>
     </div>
     <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(105px,1fr))',
       gap:8,marginTop:12}}>
       {[
         {name:'Currently planned',value:advice.existing_week_hours+'h'},
         {name:'Device observed',value:advice.validated_weekly_average_hours+'h/wk'},
         {name:'Athlete reports',value:(advice.reported_recent_hours??'Unknown')+'h/wk'}
       ].map(x=><div key={x.name} style={{background:'#fff',borderRadius:9,padding:11}}>
         <small style={{color:'#55748a',display:'block'}}>{x.name}</small>
         <strong style={{display:'block',fontSize:20,marginTop:5}}>{x.value}</strong>
       </div>)}
     </div>
     <p style={{fontSize:13,lineHeight:1.5,fontWeight:600,margin:'12px 0 6px'}}>{advice.reason}</p>
     {advice.suggested_max_weekly_hours!==null&&<p style={{fontSize:13,margin:'7px 0'}}>
       Conservative reference ceiling: <strong>{advice.suggested_max_weekly_hours}h/week</strong>.
       This is not an approved or published target.
     </p>}
     <p style={{fontSize:12,lineHeight:1.5,margin:'8px 0'}}>
       <strong>Next coaching action:</strong> {advice.next_action}
     </p>
     <p style={{fontSize:12,color:'#526f83',lineHeight:1.5}}>
       {advice.validated_sessions} validated activities in the previous 28 days;
       recent high-RPE device sessions {advice.recent_hard_rpe_sessions};
       high-RPE athlete feedback {advice.recent_hard_rpe_feedback}.
       This is a training-load signal, not a clinical readiness assessment.
     </p>
     <details style={{marginTop:10}}>
       <summary style={{fontSize:13,cursor:'pointer',fontWeight:600}}>
         Review {advice.existing_session_count} existing planned sessions
       </summary>
       <div style={{marginTop:8}}>
         {advice.existing_sessions.map((session,i)=><div key={i}
          style={{fontSize:12,padding:'6px 0',borderBottom:'1px solid #d8e4ed'}}>
          {session.date} · {session.sport.toUpperCase()} · {session.title}
          {' · '}{session.duration_min}m
         </div>)}
       </div>
     </details>
     <p style={{fontSize:12,marginTop:12,color:'#526f83'}}>
       {advice.workout_selection_guidance}
     </p>
     <strong style={{display:'block',fontSize:12,marginTop:9}}>
       Read-only recommendation — no calendar changes made.
     </strong>
   </div>}
 </section>;
}
