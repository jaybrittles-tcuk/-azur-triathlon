import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

/** Explicit athlete consent, not an inference from race goals or CSS. */
export default function FoundationSwimPreference({onUpdated}:{onUpdated:()=>Promise<void>|void}){
 const [eligible,setEligible]=useState(false);
 const [confirmed,setConfirmed]=useState(false);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState('');
 const [editing,setEditing]=useState(false);
 useEffect(()=>{
   let cancelled=false;
   void (async()=>{
     const {data:{user}}=await supabase.auth.getUser();
     if(!user || user.app_metadata?.role==='coach')return;
     const {data:setup,error:setupError}=await supabase.from('athlete_onboarding')
       .select('onboarding_step,can_swim_200m').eq('user_id',user.id).maybeSingle();
     if(setupError||setup?.onboarding_step!==3||cancelled)return;
     const {data:athlete}=await supabase.from('athlete_profile')
       .select('id').eq('user_id',user.id).maybeSingle();
     if(!athlete)return;
     const {data:sessions}=await supabase.from('planned_session')
       .select('id,targets').eq('athlete_id',athlete.id).eq('is_active_version',true).limit(25);
     if(cancelled)return;
     setEligible((sessions??[]).some(s=>s.targets?.generation_source==='onboarding_foundation'));
     setConfirmed(setup.can_swim_200m===true);
   })();
   return ()=>{cancelled=true};
 },[]);
 if(!eligible)return null;
 async function save(){
   if(saving)return;
   setSaving(true);setNotice('');
   const {data,error}=await supabase.rpc('update_foundation_swim_preference',{p_can_swim:confirmed});
   if(error){setNotice('Unable to save swimming preference: '+error.message);setSaving(false);return;}
   if(data?.status==='review_required'){setNotice(data.reason||'Coach review required');setSaving(false);return;}
   if(data?.status!=='updated'){setNotice('Unable to confirm swimming update');setSaving(false);return;}
   try{
     await onUpdated();
     setNotice(confirmed
       ? (data.added_swims>0?`Swimming confirmed. ${data.added_swims} future ride(s) replaced with safe swim sessions.`:'Swimming confirmed. Existing sessions were preserved; no suitable future foundation ride was available to substitute.')
       : 'Swimming preference saved. Future uncompleted starter swims have been removed.');
     setEditing(false);
   }catch{setNotice('Preference saved, but refreshing the calendar failed. Reopen Calendar.');}
   setSaving(false);
 }
 return <section aria-label="Swimming preference for starter programme" style={{
    border:'1px solid #9cc9e8',borderRadius:16,padding:16,
    background:'#f0f8ff',marginBottom:16,color:'#17354b'
   }}>
   <strong style={{fontSize:16}}>Swimming in your starter programme</strong>
   <p style={{fontSize:13,lineHeight:1.5,margin:'8px 0'}}>
     {confirmed?'Swimming ability confirmed. You can change this if your circumstances change.':
       'No swim sessions are planned until you confirm you can swim 200m comfortably and safely.'}
   </p>
   {!editing?<button type="button" onClick={()=>setEditing(true)} style={{padding:'9px 14px',borderRadius:10}}>
     Update swimming ability
   </button>:<>
     <label style={{display:'flex',alignItems:'flex-start',gap:9,fontSize:14,lineHeight:1.5}}>
       <input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>
       I can swim at least 200 metres comfortably and safely, and have access to a suitable pool
     </label>
     <p style={{fontSize:12}}>If confirmed, AZUR may replace one uncompleted foundation bike session per week with an easy swim. Total training duration will not increase.</p>
     <button type="button" disabled={saving} onClick={()=>void save()} style={{padding:'9px 14px',borderRadius:10}}>
       {saving?'Saving…':'Save swimming preference'}
     </button>
   </>}
   {notice&&<p role="status" style={{fontSize:13,marginTop:9}}>{notice}</p>}
 </section>;
}
