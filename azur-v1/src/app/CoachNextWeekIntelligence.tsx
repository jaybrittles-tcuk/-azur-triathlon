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
type ProposedSession={date:string;sport:string;title:string;duration_min:number;selection_reason:string};
type ProposedWeek={status:'ready_for_coach'|'blocked';reason?:string|null;week_start?:string|null;
 source_week_start:string;source_minutes:number;proposed_minutes:number;adaptation:string;
 confidence:string;evidence_status:string;sessions:ProposedSession[];coach_approval_required:boolean;
 race_phase:string;race_date:string|null;race_distance:string;weeks_to_race:number|null;
 race_reason:string;development_sport:string|null;sport_priority_reason:string;race_guidance_only:boolean};
type Athlete={id:string;display_name:string};
export default function CoachNextWeekIntelligence(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [selected,setSelected]=useState('');
 const [advice,setAdvice]=useState<Advice|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [proposal,setProposal]=useState<ProposedWeek|null>(null);
 const [rationale,setRationale]=useState('');
 const [decisionBusy,setDecisionBusy]=useState(false);
 const [resultMessage,setResultMessage]=useState('');
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
   setBusy(true);setMessage('');setAdvice(null);setProposal(null);setResultMessage('');
   const result=await supabase.rpc('coach_next_week_adaptive_preview',{p_athlete_id:selected});
   if(result.error)setMessage('Next-week recommendation unavailable: '+result.error.message);
   else if(result.data)setAdvice(result.data as Advice);
   setBusy(false);
 }
 async function generateWeek(){
   if(!selected||busy||decisionBusy)return;
   setBusy(true);setProposal(null);setMessage('');setResultMessage('');
   const response=await supabase.rpc('coach_adaptive_week_proposal',{p_athlete_id:selected});
   setBusy(false);
   if(response.error){setMessage('Unable to create safe proposal: '+response.error.message);return;}
   setProposal(response.data as ProposedWeek);
 }
 async function decideWeek(decision:'approved'|'declined'){
   if(!selected||!proposal||proposal.status!=='ready_for_coach'||decisionBusy)return;
   if(rationale.trim().length<15){
     setResultMessage('A coaching rationale of at least 15 characters is required.');return;
   }
   setDecisionBusy(true);setResultMessage('');
   const response=await supabase.rpc('coach_decide_adaptive_week',{
     p_athlete_id:selected,p_preview:proposal,p_decision:decision,p_rationale:rationale.trim()
   });
   setDecisionBusy(false);
   if(response.error){
     setResultMessage('No calendar changes made: '+response.error.message);return;
   }
   if(response.data?.status==='approved_and_published'){
     setProposal(null);setRationale('');
     await refresh();
     setResultMessage(response.data.sessions+' easy sessions published to the athlete calendar for '+response.data.week_start+'. No athlete confirmation needed.');
   }else if(response.data?.status==='declined'){
     setResultMessage('Proposal declined. Athlete calendar unchanged.');
     setProposal(null);setRationale('');
   }else setResultMessage('Decision outcome could not be confirmed. Refresh before retrying.');
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
      value={selected} onChange={e=>{setSelected(e.target.value);setAdvice(null);setProposal(null);setRationale('');setMessage('');setResultMessage('');}}>
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
       Evidence assessment only — no calendar changes made.
     </strong>
     <div style={{borderTop:'1px solid #c9deec',marginTop:14,paddingTop:13}}>
       <strong>Generate an adaptive week</strong>
       <p style={{fontSize:12,lineHeight:1.5,margin:'7px 0'}}>
         Creates a complete future-week proposal from eligible, previously approved
         easy workouts. It never changes existing sessions. Insufficient history,
         a race/taper or a safety concern blocks publication.
       </p>
       <button type="button" onClick={()=>void generateWeek()} disabled={busy||decisionBusy}>
         {busy?'Generating…':'Preview next available week'}
       </button>
       {proposal&&<div style={{marginTop:12,padding:12,borderRadius:12,background:'#fff'}}>
         <strong style={{fontSize:14}}>
           {proposal.status==='blocked'?'Proposal not safe to publish':
             'Proposed week of '+proposal.week_start}
         </strong>
         <p style={{fontSize:12,margin:'7px 0'}}>
           {proposal.status==='blocked'?proposal.reason:
             proposal.adaptation.replaceAll('_',' ')+' · '+proposal.proposed_minutes+' minutes · '+
             proposal.sessions.length+' prescribed workouts'}
         </p>
         <div style={{margin:'10px 0',padding:12,border:'1px solid #d8e4eb',borderRadius:10,background:'#f5f9fc'}}>
           <strong style={{fontSize:13}}>Race-aware coaching context</strong>
           <p style={{fontSize:12,margin:'6px 0'}}>
             {proposal.race_distance==='ironman'?'Ironman':
               proposal.race_distance==='70.3'?'Ironman 70.3':'Race not set'}
             {proposal.race_date?' · '+proposal.race_date:''}
             {' · '}{proposal.race_phase?.replaceAll('_',' ')}
             {proposal.weeks_to_race!==null?' · '+proposal.weeks_to_race+' weeks to race':''}
           </p>
           <p style={{fontSize:12,lineHeight:1.5,margin:'7px 0'}}>{proposal.race_reason}</p>
           <p style={{fontSize:12,lineHeight:1.5,margin:'7px 0'}}>{proposal.sport_priority_reason}</p>
           <small>Race and sport context is guidance, not permission to prescribe harder sessions.</small>
         </div>
         {proposal.status==='ready_for_coach'&&<>
           <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8}}>
             {proposal.sessions.map((session,i)=><div key={session.date+'-'+i}
              style={{padding:10,border:'1px solid #d7e4eb',borderRadius:10}}>
               <small style={{display:'block',fontWeight:650,color:'#4f6e81'}}>
                 {session.date} · {session.sport.toUpperCase()}</small>
               <strong style={{display:'block',fontSize:13,margin:'5px 0'}}>
                 {session.title}</strong>
               <span style={{fontSize:13}}>{session.duration_min} minutes</span>
             </div>)}
           </div>
           <p style={{fontSize:12,lineHeight:1.45,marginTop:12}}>
             This proposal uses only existing easy, structured RPE workouts.
             Approving publishes this exact future week automatically.
             Declining leaves the calendar unchanged.
           </p>
           <label style={{display:'block',fontSize:13}}>
             Coaching rationale (required)
             <textarea style={{display:'block',width:'100%',minHeight:75,
               boxSizing:'border-box',marginTop:5,padding:9,borderRadius:9}}
               value={rationale} onChange={e=>setRationale(e.target.value)}
               placeholder="Review completed training, available days, safety and why this week is suitable…"/>
           </label>
           <div style={{display:'flex',flexWrap:'wrap',gap:9,marginTop:10}}>
             <button type="button" disabled={decisionBusy} onClick={()=>void decideWeek('approved')}>
               {decisionBusy?'Saving…':'Approve & publish future week'}
             </button>
             <button type="button" disabled={decisionBusy} onClick={()=>void decideWeek('declined')}>
               Decline proposal
             </button>
           </div>
         </>}
       </div>}
       {resultMessage&&<p role="status" style={{fontSize:13,fontWeight:650,marginTop:10}}>
         {resultMessage}</p>}
     </div>
   </div>}
 </section>;
}
