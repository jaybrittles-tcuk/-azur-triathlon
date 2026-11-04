import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Proposed={date:string;sport:string;title:string;duration_min:number};
type Request={
 id:string;athlete_id:string;created_at:string;
 preview:{week_start:string;training_tier:string;total_minutes:number;
  existing_peak_week_minutes?:number;week_cap_minutes:number;reason?:string;
  athlete_reported?:boolean;sessions:Proposed[]};
 inputs:{recent_weekly_hours:number|null;training_consistency:string;training_background:string;weekly_hours:number};
};
type Decision={request_id:string;decision:string;review_note:string;decided_at:string};
type Display=Request&{athleteName:string;decision?:Decision};

export default function CoachFoundationApprovals(){
 const [rows,setRows]=useState<Display[]>([]);
 const [assignedCount,setAssignedCount]=useState(0);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState('');
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  let active=true;
  (async()=>{
   setLoading(true);setMessage('');
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.app_metadata?.role!=='coach'){
    if(active){setMessage('Verified AZUR coach account required');setLoading(false);}return;
   }
   const assignment=await supabase.from('coach_athlete_assignment')
      .select('athlete_id').eq('coach_user_id',user.id);
   if(assignment.error){if(active){setMessage(assignment.error.message);setLoading(false);}return;}
   const ids=(assignment.data??[]).map(x=>x.athlete_id);
   if(active)setAssignedCount(ids.length);
   if(!ids.length){if(active){setRows([]);setLoading(false);}return;}
   const [requests,profiles]=await Promise.all([
    supabase.from('foundation_reassessment_request')
     .select('id,athlete_id,created_at,preview,inputs').in('athlete_id',ids)
     .order('created_at',{ascending:false}).limit(60),
    supabase.from('athlete_profile').select('id,display_name').in('id',ids)
   ]);
   if(requests.error||profiles.error){
    if(active){setMessage(requests.error?.message||profiles.error?.message||'Could not load reviews');setLoading(false);}return;
   }
   const reqs=(requests.data??[]) as Request[];
   const decisions=reqs.length?await supabase.from('foundation_reassessment_decision')
    .select('request_id,decision,review_note,decided_at')
    .in('request_id',reqs.map(x=>x.id)):{data:[] as Decision[],error:null};
   if(decisions.error){if(active){setMessage(decisions.error.message);setLoading(false);}return;}
   const names=new Map((profiles.data??[]).map(x=>[x.id,x.display_name||'Assigned athlete']));
   const decided=new Map(((decisions.data??[]) as Decision[]).map(x=>[x.request_id,x]));
   if(active){setRows(reqs.map(x=>({...x,athleteName:names.get(x.athlete_id)||'Assigned athlete',decision:decided.get(x.id)})));setLoading(false);}
  })();
  return ()=>{active=false};
 },[reload]);
 async function decide(row:Display,decision:'approved'|'rejected'){
  const note=(notes[row.id]||'').trim();
  if(note.length<15){setMessage('Enter a coach review note of at least 15 characters.');return;}
  setBusy(row.id);setMessage('');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user||user.app_metadata?.role!=='coach'){setMessage('Coach sign-in required');setBusy('');return;}
  const result=await supabase.from('foundation_reassessment_decision').insert({
   request_id:row.id,coach_user_id:user.id,decision,review_note:note
  });
  if(result.error)setMessage('Review was not saved: '+result.error.message);
  else setMessage(decision==='approved'?
   'Exact programme approved. The athlete must refresh the preview and explicitly confirm before any future sessions change.':
   'Request declined. The athlete can review your note.');
  setBusy('');setReload(x=>x+1);
 }
 const pending=rows.filter(x=>!x.decision);
 return <section aria-label="Foundation training approval requests" style={{
  border:'1px solid #aec9de',borderRadius:16,padding:16,
  margin:'16px 0',background:'#f6faff',color:'#19374d'}}>
  <h3 style={{margin:'0 0 8px'}}>Training baseline approvals</h3>
  <p style={{fontSize:13,lineHeight:1.5}}>
   Requests from assigned athletes whose proposed training exceeds their previous starter calendar.
   An initial low-volume AZUR plan is not proof of their actual capacity.
   Review completed training, readiness and injury history before approving.
  </p>
  {loading?<p>Loading assigned athlete requests…</p>:
   !pending.length?<div style={{fontSize:13,lineHeight:1.55}}>
     <p style={{fontWeight:650}}>{assignedCount===0?'No athletes are assigned to this coach account.':'No submitted, pending baseline approvals from your '+assignedCount+' assigned athlete(s).'}</p>
     <p>Only requests actually submitted by an athlete linked to this coach appear here. A generated preview alone does not create a request.</p>
     <p>To connect a test athlete, open Invitations in Coach Mode, invite the athlete’s signup email, and have them accept it in their own account under More → Coach Invitations. Then they can resubmit the blocked preview.</p>
     <button type="button" onClick={()=>setReload(x=>x+1)} disabled={!!busy}>Refresh approval queue</button>
   </div>:
   pending.map(row=><article key={row.id} style={{
    border:'1px solid #c5d7e5',background:'#fff',borderRadius:12,padding:14,marginTop:12}}>
    <strong>{row.athleteName}</strong>
    <div style={{fontSize:13,marginTop:7}}>
      Week beginning {row.preview.week_start} · {row.preview.sessions.length} workouts
    </div>
    <div style={{fontSize:13,marginTop:7}}>
      Previous highest scheduled week: {row.preview.existing_peak_week_minutes||0}m.
      Proposed training: {Math.round(row.preview.total_minutes/2)}m/week on average
      (two-week sum {row.preview.total_minutes}m).
      Reported recently completed training: {row.inputs.recent_weekly_hours??'unknown'}h/week.
      Maximum availability: {row.inputs.weekly_hours}h/week.
    </div>
    <p style={{fontSize:12,color:'#77502d',margin:'8px 0'}}>
      History and training consistency are athlete-reported, not verified device evidence.
      Approval authorises this exact RPE-based proposal only; it does not authorise harder intervals or ongoing progression.
    </p>
    <details>
      <summary style={{cursor:'pointer'}}>Review exact proposed sessions</summary>
      <div style={{fontSize:12,marginTop:8}}>
       {row.preview.sessions.map((x,i)=><div key={i} style={{padding:'4px 0',borderBottom:'1px solid #e0e8ee'}}>
        {x.date} · {x.sport.toUpperCase()} · {x.title} · {x.duration_min}m
       </div>)}
      </div>
    </details>
    <label style={{display:'block',marginTop:12,fontSize:13}}>
     Coach rationale (required for audit)
     <textarea style={{display:'block',width:'100%',minHeight:72,padding:9,boxSizing:'border-box'}}
      value={notes[row.id]||''} onChange={e=>setNotes(prev=>({...prev,[row.id]:e.target.value}))}
      placeholder="Review actual training consistency, recent activity evidence, injury/readiness and rationale for the chosen load…"/>
    </label>
    <div style={{display:'flex',gap:9,marginTop:10,flexWrap:'wrap'}}>
     <button type="button" disabled={!!busy} onClick={()=>void decide(row,'approved')}>
      {busy===row.id?'Saving…':'Approve exact programme'}
     </button>
     <button type="button" disabled={!!busy} onClick={()=>void decide(row,'rejected')}>Decline</button>
    </div>
   </article>)}
  {message&&<p role="status" style={{fontSize:13}}>{message}</p>}
 </section>;
}
