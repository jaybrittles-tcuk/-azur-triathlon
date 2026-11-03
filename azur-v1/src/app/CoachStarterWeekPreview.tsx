import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {starterWeekPreview} from '../lib/starterWeekPreview.mjs';

type Athlete={id:string;display_name:string;user_id:string|null};
type Workout={workout_key:string;title:string;sport:string;family:string;duration_min:number;level:number;phases:string[];prescription:unknown;approved:boolean};
const monday=()=>{const date=new Date();date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10)};
/** Read-only starter-week discovery for assigned athletes. Never writes a calendar. */
export default function CoachStarterWeekPreview(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [selected,setSelected]=useState('');
 const [week,setWeek]=useState(monday);
 const [loading,setLoading]=useState(true);
 const [result,setResult]=useState<ReturnType<typeof starterWeekPreview>|null>(null);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;(async()=>{
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(user?.app_metadata?.role!=='coach')throw new Error('Coach access required');
   const {data:assign,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
   if(ae)throw ae;
   const ids=(assign||[]).map(x=>x.athlete_id);
   if(!ids.length){if(active)setMessage('No assigned athletes yet');return}
   const {data,error}=await supabase.from('athlete_profile').select('id,display_name,user_id').in('id',ids);
   if(error)throw error;
   if(active){setAthletes(data||[]);setSelected((data||[])[0]?.id||'')}
  }catch(e){if(active)setMessage(e instanceof Error?e.message:'Unable to load assigned athletes')}
  finally{if(active)setLoading(false)}
 })();return()=>{active=false}},[]);
 useEffect(()=>{setResult(null)},[selected,week]);
 async function preview(){
  setBusy(true);setMessage('');setResult(null);
  try{
   const athlete=athletes.find(a=>a.id===selected);
   if(!athlete?.user_id)throw new Error('Select an athlete with a verified account');
   const end=new Date(week+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);
   const [setup,workouts,existing]=await Promise.all([
    supabase.from('athlete_onboarding').select('weekly_hours,onboarding_step').eq('user_id',athlete.user_id).maybeSingle(),
    supabase.from('coach_workout_library').select('workout_key,title,sport,family,duration_min,level,phases,prescription,approved').eq('approved',true),
    supabase.from('planned_session').select('id').eq('athlete_id',athlete.id).gte('planned_date',week).lt('planned_date',end.toISOString().slice(0,10)).eq('is_active_version',true).neq('status','cancelled')
   ]);
   if(setup.error||workouts.error||existing.error)throw new Error(setup.error?.message||workouts.error?.message||existing.error?.message||'Data validation failed');
   setResult(starterWeekPreview({weekStart:week,availabilityHours:Number(setup.data?.weekly_hours),onboardingCompleted:setup.data?.onboarding_step===3,existingSessions:existing.data?.length??0,library:(workouts.data??[]) as Workout[]}));
  }catch(e){setMessage(e instanceof Error?e.message:'Preview unavailable')}
  finally{setBusy(false)}
 }
 return <section aria-label="Automatic starter-week preview" style={{padding:16,background:'#102c44',border:'1px solid #335c77',borderRadius:15,color:'#edf8ff',minWidth:0}}>
  <h3 style={{fontSize:20,margin:'0 0 8px'}}>Automatic starter-week preview</h3>
  <p style={{fontSize:13,color:'#aec8d9',lineHeight:1.5}}>AZUR checks onboarding and approved workouts. This preview cannot publish or change an athlete's calendar.</p>
  <div style={{display:'grid',gap:12,margin:'14px 0'}}>
   <label style={{fontSize:13}}>Athlete<select style={{width:'100%',minHeight:44,marginTop:5}} value={selected} onChange={e=>setSelected(e.target.value)}>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}</select></label>
   <label style={{fontSize:13}}>Week starting Monday<input style={{display:'block',width:'100%',minHeight:44,marginTop:5}} type="date" value={week} onChange={e=>setWeek(e.target.value)}/></label>
  </div>
  <button type="button" disabled={loading||busy||!selected} onClick={()=>void preview()} style={{minHeight:46,padding:'10px 17px',borderRadius:12,border:'1px solid #53bce9',background:'#1576ab',fontWeight:700,color:'#fff'}}>{busy?'Checking…':'Generate safe preview'}</button>
  {message&&<p role="alert">{message}</p>}
  {result&&<div style={{marginTop:16}}>
   <strong style={{color:'#ffdb8a'}}>Coach review required · not publishable</strong>
   <p style={{fontSize:13,color:'#a9c7d7'}}>{result.minutes} candidate minutes · availability ceiling {result.availabilityCeilingMinutes??'unknown'} minutes (not a training target)</p>
   {result.sessions.map(s=><article key={s.workout_key} style={{padding:12,marginBottom:10,borderRadius:11,border:'1px solid #315c78',background:'#173d58'}}>
     <strong>{s.title}</strong><p style={{fontSize:12,margin:'6px 0 0',color:'#bbd7e9'}}>{s.date} · {s.sport} · {s.duration_min} min · approved RPE-compatible candidate</p>
    </article>)}
   <div style={{padding:12,borderRadius:11,background:'#26392e',border:'1px solid #626a42'}}>
    <strong>Before the first week can be released</strong>
    <ul style={{fontSize:13,lineHeight:1.6,paddingLeft:20}}>{result.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
   </div>
  </div>}
 </section>;
}
