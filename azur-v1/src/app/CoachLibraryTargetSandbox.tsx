import {useState} from 'react';
import {supabase} from '../lib/supabase';
import {previewPersonalisedSteps} from '../lib/calculations/personalisedWorkoutSteps';
import type {SessionEntry} from '../lib/calculations/sessionSelection';
import type {VerifiedThresholds} from '../lib/calculations/verifiedWorkoutTargets';

type LibraryRow={id:string;title:string;sport:'bike'|'swim'|'run';family:string;duration_min:number;prescription:unknown;approved:boolean};
type Result={row:LibraryRow;steps:Array<{original:string;calculated:string|null}>};
export default function CoachLibraryTargetSandbox({athleteId}:{athleteId:string}){
 const [items,setItems]=useState<Result[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [loaded,setLoaded]=useState(false);
 async function inspect(){
  setLoading(true);setError('');setLoaded(false);setItems([]);
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user||user.app_metadata?.role!=='coach')throw Error('Coach sign-in required');
   const {data:assignment,error:assignmentError}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id).eq('athlete_id',athleteId).maybeSingle();
   if(assignmentError||!assignment)throw Error('Athlete assignment not verified');
   const [validation,library]=await Promise.all([
    supabase.from('coach_threshold_validation').select('ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km,validated_at').eq('athlete_id',athleteId).eq('coach_user_id',user.id).limit(2),
    supabase.from('coach_workout_library').select('id,title,sport,family,duration_min,prescription,approved').eq('approved',true).in('sport',['bike','swim']).limit(40)
   ]);
   if(validation.error||library.error)throw Error(validation.error?.message||library.error?.message||'Library unavailable');
   if(!validation.data||validation.data.length!==1)throw Error('Exactly one coach approval is required before calculating targets');
   const v=validation.data[0];
   const source:VerifiedThresholds={coachValidated:!!v.validated_at,validatedAt:v.validated_at,values:{
    ftpWatts:Number.isInteger(v.ftp_watts)&&v.ftp_watts>=60&&v.ftp_watts<=600?v.ftp_watts:null,
    swimCssSecondsPer100m:Number.isInteger(v.swim_css_seconds_per_100m)&&v.swim_css_seconds_per_100m>=45&&v.swim_css_seconds_per_100m<=300?v.swim_css_seconds_per_100m:null,
    runThresholdSecondsPerKm:Number.isInteger(v.run_threshold_seconds_per_km)&&v.run_threshold_seconds_per_km>=120&&v.run_threshold_seconds_per_km<=900?v.run_threshold_seconds_per_km:null
   }};
   if(!source.coachValidated)throw Error('Coach threshold validation required');
   const rows=(library.data||[]) as LibraryRow[];
   const previews=rows.filter(x=>x.sport==='bike'||x.sport==='swim').map(row=>{
    const session={id:row.id,title:row.title,sport:row.sport,family:row.family,durationMin:row.duration_min,level:1,phases:['base'],prescription:row.prescription,approved:true} as SessionEntry;
    return {row,steps:previewPersonalisedSteps(session,source).steps};
   });
   setItems(previews);setLoaded(true);
  }catch(e){setError(e instanceof Error?e.message:'Unable to inspect library');}finally{setLoading(false)}
 }
 return <details style={{marginTop:12}}>
  <summary><strong>Test approved library targets</strong> (read-only)</summary>
  <div style={{padding:'10px 0'}}>
   <p>Inspect existing approved bike and swim workouts using this athlete's coach-validated thresholds. Nothing is assigned, saved or published.</p>
   <button type="button" disabled={loading} onClick={()=>void inspect()}>{loading?'Loading…':'Preview personalised library workouts'}</button>
   {error&&<p role="alert">{error}</p>}
   {loaded&&items.length===0&&<p>No approved bike or swim workouts were accessible.</p>}
   {items.map(({row,steps})=><details key={row.id} style={{marginTop:10,padding:12,border:'1px solid #45617a',borderRadius:12}}>
    <summary><strong>{row.title}</strong> · {row.sport} · {row.duration_min} min</summary>
    <ol>{steps.map((step,i)=><li key={i} style={{marginBottom:10}}>{step.original||'Coach-defined step'}<div style={{fontWeight:600}}>{step.calculated||'No safe numerical conversion; retain original guidance'}</div></li>)}</ol>
   </details>)}
   {loaded&&<small>Illustrative coach-only preview. Existing calendar and completed workouts are unchanged.</small>}
  </div>
 </details>;
}
