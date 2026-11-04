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
type TrainingEvidence={
 window_days:number;validated_device_activities:number;manual_activities:number;
 pending_or_rejected_activities:number;weeks_with_activity:number;
 validated_device_hours_28d:number;manual_reported_hours_28d:number;
 verified_weekly_average_hours:number;reported_weekly_hours:number|null;
 proposed_weekly_hours:number;duplicate_records_excluded:number;
 history_adequacy:string;decision_guidance:string;note:string;
 weekly_validated_load:Array<{week_start:string;validated_hours:number;validated_sessions:number}>;
 sport_distribution:Array<{sport:string;validated_hours:number;sessions:number}>;
};
type Display=Request&{athleteName:string;decision?:Decision};

export default function CoachFoundationApprovals(){
 const [rows,setRows]=useState<Display[]>([]);
 const [assignedCount,setAssignedCount]=useState(0);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState('');
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [evidence,setEvidence]=useState<Record<string,TrainingEvidence>>({});
 const [evidenceBusy,setEvidenceBusy]=useState('');
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  let active=true;
  (async()=>{
   setLoading(true);
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
 async function loadEvidence(requestId:string){
  setEvidenceBusy(requestId);setMessage('');
  const response=await supabase.rpc('coach_foundation_training_evidence',{p_request_id:requestId});
  if(response.error)setMessage('Training evidence not available: '+response.error.message);
  else if(response.data)setEvidence(prev=>({...prev,[requestId]:response.data as TrainingEvidence}));
  setEvidenceBusy('');
 }
 async function decide(row:Display,decision:'approved'|'rejected'){
  const note=(notes[row.id]||'').trim();
  if(note.length<15){setMessage('Enter a coach review note of at least 15 characters.');return;}
  setBusy(row.id);setMessage('');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user||user.app_metadata?.role!=='coach'){setMessage('Coach sign-in required');setBusy('');return;}
  const result=await supabase.rpc('decide_foundation_reassessment',{
   p_request_id:row.id,p_decision:decision,p_review_note:note
  });
  if(result.error)setMessage('Decision NOT saved; calendar unchanged: '+result.error.message);
  else if(decision==='approved'&&result.data?.status==='approved_and_applied')
    setMessage('Programme approved and automatically published: '+result.data.sessions+' future sessions. The athlete calendar will show the update on refresh.');
  else if(decision==='rejected'&&result.data?.status==='declined')
    setMessage('Proposal declined. Existing athlete calendar preserved and your rationale recorded.');
  else setMessage('Could not verify the coaching decision. Refresh before trying again.');
  setBusy('');if(!result.error&&((decision==='approved'&&result.data?.status==='approved_and_applied')||(decision==='rejected'&&result.data?.status==='declined')))setReload(x=>x+1);
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
    <div style={{margin:'11px 0',padding:12,borderRadius:10,background:'#edf4f8',fontSize:13}}>
      <strong>Recent training evidence</strong>
      {!evidence[row.id]?<div style={{marginTop:7}}>
        <button type="button" disabled={!!evidenceBusy} onClick={()=>void loadEvidence(row.id)}>
          {evidenceBusy===row.id?'Checking…':'Review verified training history'}
        </button>
      </div>:<>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(95px,1fr))',gap:8,marginTop:10}}>
          {[
            {label:'Athlete reports',value:String(evidence[row.id].reported_weekly_hours??'Unknown')+'h/wk'},
            {label:'Device observed',value:String(evidence[row.id].verified_weekly_average_hours)+'h/wk'},
            {label:'Proposed plan',value:String(evidence[row.id].proposed_weekly_hours)+'h/wk'}
          ].map(item=><div key={item.label} style={{background:'#fff',padding:9,borderRadius:9}}>
            <small style={{color:'#45637a'}}>{item.label}</small>
            <strong style={{display:'block',fontSize:18,marginTop:5}}>{item.value}</strong>
          </div>)}
        </div>
        <div style={{marginTop:11}}>
          <strong style={{fontSize:12}}>Last four weeks — validated device sessions only</strong>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:6,marginTop:7}}>
          {evidence[row.id].weekly_validated_load?.map(week=><div key={week.week_start}
            style={{borderRadius:8,padding:6,background:'#fff',textAlign:'center'}}>
            <small style={{display:'block',color:'#526d7e',fontSize:10}}>{week.week_start.slice(5)}</small>
            <strong style={{fontSize:14}}>{week.validated_hours}h</strong>
            <small style={{display:'block',fontSize:10}}>{week.validated_sessions} sessions</small>
          </div>)}
          </div>
        </div>
        {evidence[row.id].sport_distribution?.length>0&&<p style={{fontSize:12}}>
          By discipline: {evidence[row.id].sport_distribution.map(x=>x.sport+' '+x.validated_hours+'h').join(' · ')}
        </p>}
        <p style={{fontSize:12,margin:'8px 0'}}>
          {evidence[row.id].validated_device_activities} validated device activities;
          {' '}{evidence[row.id].manual_activities} manual;
          {' '}{evidence[row.id].pending_or_rejected_activities} pending/rejected;
          {' '}{evidence[row.id].duplicate_records_excluded} duplicates excluded.
        </p>
        <p role="status" style={{
          color:evidence[row.id].history_adequacy==='insufficient_validated_history'?'#89501a':'#235a44',
          background:'#fff',padding:10,borderRadius:9,fontWeight:600,fontSize:12
        }}>{evidence[row.id].decision_guidance}</p>
        <small>Device observations may be incomplete if integrations or imports are missing. Reported hours are not independently verified. Review readiness and injuries before approving.</small>
      </>}
    </div>
    <p style={{fontSize:12,color:'#77502d',margin:'8px 0'}}>
      History and training consistency are athlete-reported, not verified device evidence.
      Approving automatically replaces only eligible future foundation sessions with this exact RPE-based proposal. Declining preserves the current calendar. Neither action authorises harder intervals or ongoing progression.
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
      {busy===row.id?'Approving…':'Approve & publish programme'}
     </button>
     <button type="button" disabled={!!busy} onClick={()=>void decide(row,'rejected')}>Decline</button>
    </div>
   </article>)}
  {message&&<p role="status" style={{fontSize:13}}>{message}</p>}
 </section>;
}
