/** Conservative background import policy. Never completes a planned session or awards training load. */
export function assessBackgroundImport(activity, existing=[], planned=[]){
 const type=String(activity?.type??'').toLowerCase().replace(/[^a-z]/g,'');
 if(!['ride','virtualride','indoorride','virtualcycling'].includes(type))return {allowed:false,reason:'unsupported_sport'};
 const id=String(activity?.id??'');
 const start=Date.parse(String(activity?.start_date??''));
 const seconds=Number(activity?.elapsed_time??activity?.moving_time);
 if(!id||id.length>150||!Number.isFinite(start)||!Number.isSafeInteger(seconds)||seconds<=0||seconds>86400)return {allowed:false,reason:'invalid_metrics'};
 const duplicate=existing.some(e=>String(e.source)==='intervals'&&String(e.source_activity_id)===id);
 if(duplicate)return {allowed:false,reason:'already_imported'};
 const overlap=existing.some(e=>{
  if(String(e.sport).toLowerCase()!=='bike')return false;
  const t=Date.parse(String(e.start_time));const d=Number(e.duration_sec);
  return Number.isFinite(t)&&Number.isFinite(d)&&Math.abs(t-start)<=600000&&Math.abs(d-seconds)<=Math.max(120,seconds*.06);
 });
 if(overlap)return {allowed:false,reason:'possible_cross_provider_duplicate'};
 const day=String(activity.start_date_local??activity.start_date).slice(0,10);
 const active=planned.filter(p=>String(p.planned_date)===day&&String(p.sport).toLowerCase()==='bike'&&p.is_active_version&& !['completed','skipped','cancelled'].includes(p.status));
 if(active.length)return {allowed:false,reason:'planned_session_requires_review'};
 return {allowed:true,reason:'unmatched_safe_record_only'};
}
