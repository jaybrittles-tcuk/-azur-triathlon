import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {recommendSwimBlockForWeek} from '../lib/calculations/swimWeekAssessmentBridge';
import type {StoredSwimAssessment} from '../lib/calculations/swimWeekAssessmentBridge';
import type {DraftResult,DraftItem} from '../lib/calculations/weeklyDraftGenerator';

export default function WeeklySwimDrillReview({athleteId,weekStart,sessions}:{athleteId:string;weekStart:string;sessions:unknown}){
 const [assessments,setAssessments]=useState<StoredSwimAssessment[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
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
 return <div className="coach-feedback-notes">
  <strong>Swim technique · coach review</strong>
  {loading?<p>Loading coach-assessed swim focus…</p>:error?<p role="alert">{error}</p>:review.status==='review_required'&&review.drillBlock?<>
   <p>Priority: {review.drillBlock.focus.replaceAll('_',' ')} · Suggested drill block: {review.drillBlock.totalMeters}m</p>
   {review.drillBlock.drills.map(d=><p key={d.id}><strong>{d.name}</strong> · {d.repeats} × {d.distanceMeters}m · {d.restSeconds}s rest. {d.instructions}</p>)}
   <small>Suggestion only. Review the athlete, existing swim distance and pool setup, then edit and re-approve the full weekly draft separately. Nothing has been inserted.</small>
  </>:<p>{review.message}</p>}
 </div>;
}
