import {easySegmentsForReplacement,replaceEasySwimmingWithDrills} from '../lib/calculations/replaceEasySwimWithDrills';
import {resolveSwimDrillVolume} from '../lib/calculations/swimDrillVolumePolicy';
import {validateDrillEnhancedSwim} from '../lib/calculations/validateDrillEnhancedSwim';
import {addReviewedDrillBlock,canonicalDraftFingerprintInput} from '../lib/calculations/applySwimDrillBlock';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {recommendSwimBlockForWeek} from '../lib/calculations/swimWeekAssessmentBridge';
import type {StoredSwimAssessment} from '../lib/calculations/swimWeekAssessmentBridge';
import type {DraftResult,DraftItem} from '../lib/calculations/weeklyDraftGenerator';

export default function WeeklySwimDrillReview({athleteId,weekStart,sessions,revision,phase,onSaved}:{athleteId:string;weekStart:string;sessions:unknown;revision:number;phase:string;onSaved:()=>void}){
 const [assessments,setAssessments]=useState<StoredSwimAssessment[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [selected,setSelected]=useState(0);
 const [cssSeconds,setCssSeconds]=useState('');
 const [weeklyLimit,setWeeklyLimit]=useState('');
 const [weeklyPlanned,setWeeklyPlanned]=useState('');
 const [allowExtra,setAllowExtra]=useState(false);
 const [easySegment,setEasySegment]=useState('');
 const [saveMessage,setSaveMessage]=useState('');
 useEffect(()=>{let live=true;setLoading(true);setError('');
  void supabase.from('coach_swim_assessment').select('focus,notes,assessed_at,coach_user_id,status').eq('athlete_id',athleteId).order('assessed_at',{ascending:false}).limit(15)
   .then(({data,error})=>{if(!live)return;if(error)setError(error.message);else setAssessments((data??[]) as StoredSwimAssessment[]);setLoading(false)});
  return()=>{live=false};
 },[athleteId]);
 const records=Array.isArray(sessions)?sessions:[];
 const isSwim=(item:unknown)=>{if(!item||typeof item!=='object')return false;
  const entry=item as {session?:{sport?:unknown};sport?:unknown};
  return (entry.session?.sport??entry.sport)==='swim';
 };
 const draft:DraftResult={status:'ready_for_coach_review',weekStart,sessions:records.filter(isSwim).map((item)=>({
  date:weekStart,reason:'Existing coach-created weekly draft',session:{sport:'swim'} as DraftItem['session']
 })),totalMinutes:0};
 const review=recommendSwimBlockForWeek({draft,assessments,referenceDate:weekStart});
 const swimIndices=records.flatMap((entry,i)=>isSwim(entry)?[i]:[]);
 async function saveRevision(){
  setSaving(true);setSaveMessage('');
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.app_metadata?.role!=='coach')throw new Error('A coach login is required');
   const current=swimIndices[selected];
   if(current===undefined)throw new Error('Choose a swim workout');
   const revised=addReviewedDrillBlock(records,review,current);
   const validation=validateDrillEnhancedSwim(revised[current],Number(cssSeconds)||null);
   if(validation.status==='blocked')throw new Error('Full workout validation required: '+validation.reasons.join('; '));
   const original=records[current] as {session?:{durationMin?:number;family?:string;prescription?:{poolSegments?:Array<{distanceMeters:number;repeats:number}>}}};
   const baseMeters=original.session?.prescription?.poolSegments?.reduce((n,x)=>n+x.distanceMeters*x.repeats,0)??0;
   const policy=resolveSwimDrillVolume({phase:phase as 'base'|'build'|'peak'|'taper'|'recovery',isTechniqueWeek:original.session?.family==='technique',baseMeters,drillMeters:review.drillBlock!.totalMeters,weeklySwimPlannedMeters:weeklyPlanned?Number(weeklyPlanned):NaN,weeklySwimLimitMeters:weeklyLimit?Number(weeklyLimit):NaN,plannedSessionMinutes:original.session?.durationMin??0,estimatedRevisedMinutes:validation.estimatedMinutes,coachApprovedExtraVolume:allowExtra});
   if(policy.status==='blocked')throw new Error(policy.reason);
   if(policy.status==='replace'){
    const choice=Number(easySegment);
    if(easySegment===''||!easySegmentsForReplacement(records[current],policy.replaceMeters).includes(choice))throw new Error('Select a suitable easy swimming segment for replacement');
    revised[current]=replaceEasySwimmingWithDrills(revised[current],choice,policy.replaceMeters);
    const rechecked=validateDrillEnhancedSwim(revised[current],Number(cssSeconds)||null);
    if(rechecked.status==='blocked')throw new Error('Revised workout validation: '+rechecked.reasons.join('; '));
    if(rechecked.totalMeters!==baseMeters)throw new Error('Replacement must maintain original total swim distance');
   }
   const {data:latest,error:le}=await supabase.from('weekly_plan_draft').select('revision').eq('athlete_id',athleteId).eq('week_start',weekStart).order('revision',{ascending:false}).limit(1);
   if(le)throw le;
   if(latest?.[0]?.revision!==revision)throw new Error('Draft revised elsewhere. Refresh first.');
   const raw=new TextEncoder().encode(canonicalDraftFingerprintInput(revised));
   const digest=await crypto.subtle.digest('SHA-256',raw);
   const proposal_fingerprint=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
   const {error:se}=await supabase.from('weekly_plan_draft').insert({
    athlete_id:athleteId,week_start:weekStart,revision:revision+1,phase,sessions:revised,proposal_fingerprint,created_by:user.id
   });
   if(se)throw se;
   setSaveMessage('New draft revision saved. Coach must review and approve the revised whole week.');
   onSaved();
  }catch(e){setSaveMessage(e instanceof Error?e.message:'Could not save revised swim draft')}
  finally{setSaving(false)}
 }
 return <div className="coach-feedback-notes">
  <strong>Swim technique · coach review</strong>
  {loading?<p>Loading coach-assessed swim focus…</p>:error?<p role="alert">{error}</p>:review.status==='review_required'&&review.drillBlock?<>
   <p>Priority: {review.drillBlock.focus.replaceAll('_',' ')} · Suggested drill block: {review.drillBlock.totalMeters}m</p>
   {review.drillBlock.drills.map(d=><p key={d.id}><strong>{d.name}</strong> · {d.repeats} × {d.distanceMeters}m · {d.restSeconds}s rest. {d.instructions}</p>)}
   <p><label>Apply to swim session <select value={selected} onChange={e=>setSelected(Number(e.target.value))}>{swimIndices.map((i,index)=><option key={i} value={index}>{String((records[i] as {session?:{title?:string}}).session?.title??'Swim '+(index+1))}</option>)}</select></label></p>
   <p><label>Validated athlete CSS (seconds per 100m) <input type="number" min="45" max="240" step="1" value={cssSeconds} onChange={e=>setCssSeconds(e.target.value)} placeholder="e.g. 90" /></label></p>
   <p><label>Weekly swim planned distance (metres) <input type="number" min="0" value={weeklyPlanned} onChange={e=>setWeeklyPlanned(e.target.value)}/></label></p>
   <p><label>Coach-approved weekly swim ceiling (metres) <input type="number" min="0" value={weeklyLimit} onChange={e=>setWeeklyLimit(e.target.value)}/></label></p>
   <label><input type="checkbox" checked={allowExtra} onChange={e=>setAllowExtra(e.target.checked)}/> Allow additional drill distance in this build week</label>
   <p><label>Replace easy swimming segment <select value={easySegment} onChange={e=>setEasySegment(e.target.value)}><option value="">Choose eligible easy section</option>{swimIndices[selected]!==undefined&&review.drillBlock&&easySegmentsForReplacement(records[swimIndices[selected]],review.drillBlock.totalMeters).map(i=><option key={i} value={i}>Easy segment {i+1}</option>)}</select></label></p>
   <button type="button" disabled={saving||swimIndices.length===0} onClick={()=>void saveRevision()}>{saving?'Saving…':'Create revised weekly draft with drills'}</button>
   <small>Creates a new pending revision only. Confirm the session's total distance, technical suitability and recovery before approving the full week. Does not publish to the athlete calendar.</small>
  </>:<p>{review.message}</p>}
 {saveMessage&&<p role="status">{saveMessage}</p>}
 </div>;
}
