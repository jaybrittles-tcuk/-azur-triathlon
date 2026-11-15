import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {parsePaceSeconds,displayPace} from '../lib/calculations/paceEntry';
type Values={ftp_watts:string;swim_css_seconds_per_100m:string;run_threshold_seconds_per_km:string};
const fields:[keyof Values,string,number,number][]=[['ftp_watts','Bike FTP (watts)',60,600],['swim_css_seconds_per_100m','Swim CSS (seconds / 100 m)',45,300],['run_threshold_seconds_per_km','Run threshold (seconds / km)',120,900]];
const empty:Values={ftp_watts:'',swim_css_seconds_per_100m:'',run_threshold_seconds_per_km:''};
export default function CoachThresholdValidation({athleteId,onSaved}:{athleteId:string;onSaved:()=>void}){
 const [values,setValues]=useState<Values>(empty);const [approved,setApproved]=useState<Values|null>(null);
 const [validatedAt,setValidatedAt]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 useEffect(()=>{let active=true;(async()=>{
  const [profile,onboarding,validation]=await Promise.all([
   supabase.from('athlete_profile').select('ftp_w,swim_threshold_sec_per_100m,run_threshold_sec_per_km').eq('user_id',athleteId).maybeSingle(),
   supabase.from('athlete_onboarding').select('ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km').eq('user_id',athleteId).maybeSingle(),
   supabase.from('coach_threshold_validation').select('ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km,validated_at').eq('athlete_id',athleteId).maybeSingle()
  ]);
  if(!active)return;
  if(profile.error||onboarding.error||validation.error){setMessage('Unable to read athlete thresholds: '+(profile.error?.message||onboarding.error?.message||validation.error?.message));return;}
  const p=profile.data,o=onboarding.data,a=validation.data;
  const next:Values={ftp_watts:String(a?.ftp_watts??p?.ftp_w??o?.ftp_watts??''),swim_css_seconds_per_100m:displayPace(a?.swim_css_seconds_per_100m??p?.swim_threshold_sec_per_100m??o?.swim_css_seconds_per_100m),run_threshold_seconds_per_km:displayPace(a?.run_threshold_seconds_per_km??p?.run_threshold_sec_per_km??o?.run_threshold_seconds_per_km)};
  setValues(next);if(a){setApproved({ftp_watts:String(a.ftp_watts??''),swim_css_seconds_per_100m:displayPace(a.swim_css_seconds_per_100m),run_threshold_seconds_per_km:displayPace(a.run_threshold_seconds_per_km)});setValidatedAt(a.validated_at);}
 })();return()=>{active=false}},[athleteId]);
 async function approve(){
  setMessage('');
  const payload:Record<string,number|null>={};let populated=0;
  for(const [key,label,min,max] of fields){const raw=values[key].trim();if(!raw){payload[key]=null;continue;}const n=key==='ftp_watts'?(/^\d+$/.test(raw)?Number(raw):null):parsePaceSeconds(raw);if(n===null||!Number.isInteger(n)||n<min||n>max){setMessage(key==='ftp_watts'?label+' must be between '+min+' and '+max+' watts':label+' must be entered as mm:ss (e.g. 1:30) or decimal minutes (e.g. 1.5)');return;}payload[key]=n;populated++;}
  if(!populated){setMessage('Enter at least one threshold before approval.');return;}
  setBusy(true);
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user||user.app_metadata?.role!=='coach')throw Error('Verified coach account required');
   const {data:assignment,error:assignmentError}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id).eq('athlete_id',athleteId).maybeSingle();
   if(assignmentError||!assignment)throw Error('Coach assignment not verified');
   const now=new Date().toISOString();
   const {error}=await supabase.from('coach_threshold_validation').upsert({athlete_id:athleteId,coach_user_id:user.id,...payload,validated_at:now},{onConflict:'athlete_id,coach_user_id'});
   if(error)throw Error(error.message);
   const {data:verified,error:readError}=await supabase.from('coach_threshold_validation').select('ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km,validated_at').eq('athlete_id',athleteId).eq('coach_user_id',user.id).single();
   if(readError||!verified)throw Error('Approval saved but could not be re-verified');
   setApproved({ftp_watts:String(verified.ftp_watts??''),swim_css_seconds_per_100m:String(verified.swim_css_seconds_per_100m??''),run_threshold_seconds_per_km:String(verified.run_threshold_seconds_per_km??'')});
   setValidatedAt(verified.validated_at);setMessage('Coach validation saved and verified. Refresh the VIPA preview to see target references.');onSaved();
  }catch(e){setMessage(e instanceof Error?e.message:'Could not validate thresholds');}finally{setBusy(false);}
 }
 const changed=JSON.stringify(values)!==JSON.stringify(approved);
 return <details><summary>Coach threshold validation</summary><div style={{display:'grid',gap:10,padding:12}}>
  <p>Review athlete-reported values before approval. Blank values remain unapproved. This does not publish or modify workouts.</p>
  {fields.map(([key,label,min,max])=><label key={key}>{key==='ftp_watts'?label:key==='swim_css_seconds_per_100m'?'Swim CSS (mm:ss / 100 m)':'Run threshold (mm:ss / km)'}<input style={{display:'block',width:'100%',maxWidth:260}} inputMode={key==='ftp_watts'?'numeric':'decimal'} type={key==='ftp_watts'?'number':'text'} placeholder={key==='ftp_watts'?'e.g. 310':key==='swim_css_seconds_per_100m'?'e.g. 1:30':'e.g. 4:00'} min={key==='ftp_watts'?min:undefined} max={key==='ftp_watts'?max:undefined} step={key==='ftp_watts'?'1':undefined} value={values[key]} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/></label>)}
  {validatedAt&&<p>Last coach validation: {new Date(validatedAt).toLocaleString('en-GB')}</p>}
  <button type="button" disabled={busy||(!changed&&!!validatedAt)} onClick={()=>void approve()}>{busy?'Saving…':validatedAt?'Review and revalidate thresholds':'Approve entered thresholds'}</button>
  {message&&<p role="status">{message}</p>}
 </div></details>;
}
