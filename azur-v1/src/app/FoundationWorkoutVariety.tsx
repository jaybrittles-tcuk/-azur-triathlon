import {useState} from 'react';
import {supabase} from '../lib/supabase';

export default function FoundationWorkoutVariety({onUpdated}:{onUpdated?:()=>Promise<void>|void}){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 async function refresh(){
   if(busy)return;
   setBusy(true);setMessage('');
   const {data,error}=await supabase.rpc('athlete_enrich_foundation_sessions');
   if(error){
     setMessage('Unable to refresh workouts: '+error.message);
     setBusy(false);return;
   }
   if(data?.status==='review_required'){
     setMessage(data.reason||'A coaching safety review is needed before changing training.');
     setBusy(false);return;
   }
   try{
     await onUpdated?.();
     const count=Number(data?.sessions_enriched||0);
     setMessage(count>0?
       count+' upcoming easy sessions now have varied intervals and coaching explanations. Dates, duration and intensity remain unchanged.':
       'Your upcoming eligible starter workouts already have their latest structure, or no changes are appropriate.');
   }catch(error){
     setMessage('Workout details were saved, but the calendar refresh failed. Reopen Calendar to see the latest version.');
   }finally{setBusy(false);}
 }
 return <details style={{background:'#eaf5fd',color:'#143a53',border:'1px solid #b7d5e9',
   borderRadius:14,padding:'12px 15px',marginBottom:13}}>
   <summary style={{fontSize:13,fontWeight:700,cursor:'pointer'}}>
     More variety in your starter workouts
   </summary>
   <p style={{fontSize:12,lineHeight:1.5,margin:'9px 0'}}>
     Your starter sessions should explain what you're developing, with clear work,
     recovery and coaching cues. Refreshing updates only future, unlocked,
     uncompleted easy foundation workouts. Your training days, duration and
     intensity stay unchanged.
   </p>
   <p style={{fontSize:12,lineHeight:1.5,margin:'8px 0'}}>
     Aerobic bike intervals, gentle cadence work, swim drills and repeat sets,
     and relaxed run technique are included when appropriate.
     Higher-intensity VO₂ sessions need a separate coach-approved progression.
   </p>
   <button type="button" onClick={()=>void refresh()} disabled={busy}
     style={{padding:'10px 14px',borderRadius:10,border:'1px solid #2d85bf',
       background:'#126394',color:'#fff',fontWeight:650,cursor:'pointer'}}>
     {busy?'Improving workouts…':'Improve remaining starter workouts'}
   </button>
   {message&&<p role="status" style={{fontSize:12,fontWeight:600,margin:'9px 0 0'}}>
     {message}
   </p>}
 </details>;
}
