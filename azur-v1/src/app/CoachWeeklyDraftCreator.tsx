import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { resolveCurrentBikeApprovals } from '../lib/calculations/coachApprovalResolver';
import { draftApprovedTrainingWeek } from '../lib/calculations/weeklyDraftGenerator';
import { mondayOf } from '../lib/calculations/weeklyPlanSafety';

type Athlete={id:string;display_name:string|null;normal_weekly_hours:number|null;ftp_w:number|null};
type Phase='base'|'build'|'peak'|'taper'|'recovery';
const phases:Phase[]=['base','build','peak','taper','recovery'];
function nextMonday(){const now=new Date();const iso=now.toISOString().slice(0,10);const monday=mondayOf(iso);const d=new Date(monday+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7);return d.toISOString().slice(0,10);}
export default function CoachWeeklyDraftCreator({onSaved}:{onSaved:()=>void}){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [athleteId,setAthleteId]=useState('');
 const [weekStart,setWeekStart]=useState(nextMonday());
 const [phase,setPhase]=useState<Phase>('base');
 const [feedback,setFeedback]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{void (async()=>{const {data:{user}}=await supabase.auth.getUser();if(user?.app_metadata?.role!=='coach')return;
 const {data:assign,error}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
 if(error){setFeedback(error.message);return;}
 const ids=(assign??[]).map(a=>a.athlete_id);if(!ids.length)return;
 const result=await supabase.from('athlete_profile').select('id,display_name,normal_weekly_hours,ftp_w').in('id',ids);
 if(result.error){setFeedback(result.error.message);return;}
 setAthletes(result.data??[]);
 })()},[]);
 async function prepare(){
  setBusy(true);setFeedback('');
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach required');
   const athlete=athletes.find(a=>a.id===athleteId);
   if(!athlete)throw new Error('Choose an assigned athlete');
   if(mondayOf(weekStart)!==weekStart)throw new Error('Choose a Monday start date');
   const end=new Date(weekStart+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);
   const [{count,error:planError},{data:approvalRows,error:approvalError}]=await Promise.all([
    supabase.from('planned_session').select('id',{count:'exact',head:true}).eq('athlete_id',athlete.id).eq('is_active_version',true).gte('planned_date',weekStart).lte('planned_date',end.toISOString().slice(0,10)),
    supabase.from('coach_workout_approval_event').select('id,workout_id,workout_version,decision,level,phases,decided_at').order('decided_at',{ascending:false}).limit(500)
   ]);
   if(planError||approvalError)throw new Error(planError?.message||approvalError?.message);
   const library=resolveCurrentBikeApprovals(approvalRows??[]);
   // A fixed triathlon structure is a conservative first check. Missing approved
   // swim/run workouts block persistence rather than generate a misleading plan.
   const proposal=draftApprovedTrainingWeek({
     weekStart,phase,library,weeklyLimitMinutes:Number(athlete.normal_weekly_hours??0)*60,
     existingActiveSessions:count??0,athleteProfileReady:Boolean(athlete.ftp_w&&athlete.normal_weekly_hours),
     slots:[
       {day:0,sport:'swim',family:'technique',maxMinutes:60,maxLevel:1},
       {day:1,sport:'bike',family:'aerobic_endurance',maxMinutes:90,maxLevel:1},
       {day:2,sport:'run',family:'aerobic_endurance',maxMinutes:70,maxLevel:1},
       {day:4,sport:'bike',family:'threshold',maxMinutes:75,maxLevel:2},
       {day:5,sport:'run',family:'aerobic_endurance',maxMinutes:100,maxLevel:2},
       {day:6,sport:'bike',family:'race_specific',maxMinutes:180,maxLevel:2}
     ]
   });
   if(proposal.status==='blocked')throw new Error('Plan not saved: '+proposal.reasons.join('; '));
   // This code path requires approved source workouts for every specified sport.
   // Browser crypto supplies a content-integrity fingerprint, not authorisation.
   const sessions=proposal.sessions;
   const body=JSON.stringify(sessions);
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
   const fingerprint=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
   const {data:old,error:oldError}=await supabase.from('weekly_plan_draft').select('revision').eq('athlete_id',athlete.id).eq('week_start',weekStart).order('revision',{ascending:false}).limit(1);
   if(oldError)throw oldError;
   const next=(old?.[0]?.revision??0)+1;
   const {error:saveError}=await supabase.from('weekly_plan_draft').insert({athlete_id:athlete.id,week_start:weekStart,revision:next,phase,sessions,proposal_fingerprint:fingerprint,created_by:user.id});
   if(saveError)throw saveError;
   setFeedback('Draft saved for coach review. No sessions have been published.');
   onSaved();
  }catch(e){setFeedback(e instanceof Error?e.message:'Unable to prepare weekly draft');}
  finally{setBusy(false);}
 }
 return <section className="coach-attention-group">
 <h4>Prepare next week</h4><p>Check coach-approved session coverage before saving an athlete’s triathlon programme. This does not publish training.</p>
 <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12}}>
  <label>Athlete <select value={athleteId} onChange={e=>setAthleteId(e.target.value)}><option value="">Choose athlete</option>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name||'Assigned athlete'}</option>)}</select></label>
  <label>Week beginning <input type="date" value={weekStart} onChange={e=>setWeekStart(e.target.value)}/></label>
  <label>Training phase <select value={phase} onChange={e=>setPhase(e.target.value)}>{phases.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
 </div>
 <button type="button" disabled={busy||!athleteId} onClick={()=>void prepare()}>{busy?'Checking…':'Check and save proposal'}</button>
 {feedback&&<p role="status">{feedback}</p>}
 </section>;
}