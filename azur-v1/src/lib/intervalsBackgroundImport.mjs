/** Conservative background import policy. Never completes a planned session or awards training load. */
export function classifyEnduranceSport(type){
 const value=String(type??'').toLowerCase().replace(/[^a-z]/g,'');
 if(['ride','virtualride','indoorride','virtualcycling','cycling','bike','mountainbike','gravelride'].includes(value))return 'bike';
 if(['run','virtualrun','treadmill','trailrun','running'].includes(value))return 'run';
 if(['swim','poolswim','openwaterswim','swimming'].includes(value))return 'swim';
 return null;
}
export function assessBackgroundImport(activity, existing=[], planned=[]){
 const sport=classifyEnduranceSport(activity?.type);
 if(!sport)return {allowed:false,reason:'unsupported_sport'};
 const id=String(activity?.id??'');
 const start=Date.parse(String(activity?.start_date??''));
 const seconds=Number(activity?.elapsed_time??activity?.moving_time);
 if(!id||id.length>150||!Number.isFinite(start)||!Number.isSafeInteger(seconds)||seconds<=0||seconds>86400)return {allowed:false,reason:'invalid_metrics'};
 const duplicate=existing.some(e=>String(e.source)==='intervals'&&String(e.source_activity_id)===id);
 if(duplicate)return {allowed:false,reason:'already_imported'};
 const overlap=existing.some(e=>{
  if(String(e.sport).toLowerCase()!==sport)return false;
  const t=Date.parse(String(e.start_time));const d=Number(e.duration_sec);
  return Number.isFinite(t)&&Number.isFinite(d)&&Math.abs(t-start)<=600000&&Math.abs(d-seconds)<=Math.max(120,seconds*.06);
 });
 if(overlap)return {allowed:false,reason:'possible_cross_provider_duplicate'};
 const day=String(activity.start_date_local??activity.start_date).slice(0,10);
 const active=planned.filter(p=>String(p.planned_date)===day&&String(p.sport).toLowerCase()===sport&&p.is_active_version&& !['completed','skipped','cancelled'].includes(p.status));
 if(active.length)return {allowed:true,sport,match:'needs_review',reason:'record_activity_without_completing_plan'};
 return {allowed:true,sport,match:'extra_session',reason:'record_unplanned_activity'};
}
