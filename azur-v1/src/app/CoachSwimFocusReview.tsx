import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {recommendAthleteSwimDrills} from '../lib/calculations/athleteSwimDrillSelection';
import type {SwimDrillFocus} from '../lib/calculations/swimDrillLibrary';
type Athlete={id:string;display_name:string|null};
const focuses:SwimDrillFocus[]=['body_position','catch','rotation','breathing','kick','sighting'];
export default function CoachSwimFocusReview(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [athleteId,setAthleteId]=useState('');
 const [focus,setFocus]=useState<SwimDrillFocus>('catch');
 const [notes,setNotes]=useState('');
 const [message,setMessage]=useState('');
 const [saved,setSaved]=useState(false);
 const [saving,setSaving]=useState(false);
 const [history,setHistory]=useState<Array<{id:string;focus:string;notes:string;assessed_at:string}>>([]);
 useEffect(()=>{void(async()=>{const {data:{user}}=await supabase.auth.getUser();if(user?.app_metadata?.role!=='coach')return;
 const a=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
 if(a.error){setMessage(a.error.message);return;}
 const ids=(a.data??[]).map(x=>x.athlete_id);if(!ids.length)return;
 const p=await supabase.from('athlete_profile').select('id,display_name').in('id',ids);
 if(p.error)setMessage(p.error.message);else setAthletes(p.data??[]);
 })()},[]);
 useEffect(()=>{let active=true;if(!athleteId){setHistory([]);return;}void supabase.from('coach_swim_assessment').select('id,focus,notes,assessed_at').eq('athlete_id',athleteId).order('assessed_at',{ascending:false}).limit(10).then(({data,error})=>{if(active){if(error)setMessage(error.message);else setHistory(data??[]);}});return()=>{active=false};},[athleteId,saved]);
 const result=athleteId?recommendAthleteSwimDrills([{focus,source:'coach_assessment',observedAt:new Date().toISOString().slice(0,10),notes}],300):null;
 async function review(){setSaving(true);setMessage('');try{const {data:{user}}=await supabase.auth.getUser();if(user?.app_metadata?.role!=='coach'||!athleteId)throw new Error('Assigned coach required');if(!notes.trim())throw new Error('Please record your coaching observations.');const {error}=await supabase.from('coach_swim_assessment').insert({athlete_id:athleteId,coach_user_id:user.id,focus,notes:notes.trim()});if(error)throw error;setSaved(x=>!x);setMessage('Coach assessment saved. Future drill reviews can use this technical focus; no calendar changes were made.');}catch(e){setMessage(e instanceof Error?e.message:'Unable to save assessment');}finally{setSaving(false)}}
 return <section className="coach-attention-group" aria-label="Swim development review">
 <h4>Swim technique development</h4><p>Record a coach-assessed swim development priority and preview matching drills. No calendar changes are made.</p>
 <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
 <label>Athlete <select value={athleteId} onChange={e=>{setAthleteId(e.target.value);setSaved(false)}}><option value="">Choose athlete</option>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name||'Assigned athlete'}</option>)}</select></label>
 <label>Technical focus <select value={focus} onChange={e=>{setFocus(e.target.value as SwimDrillFocus);setSaved(false)}}>{focuses.map(x=><option value={x} key={x}>{x.replaceAll('_',' ')}</option>)}</select></label>
 </div>
 <label>Coach observations <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What did you observe in the swim?" maxLength={800}/></label>
 {result?.status==='coach_review_required'&&<><p><strong>Suggested drill block</strong> · {result.drills.reduce((n,d)=>n+d.repeats*d.distanceMeters,0)}m</p>
 {result.drills.map(d=><article className="coach-attention-row" key={d.id}><div><strong>{d.name}</strong><p>{d.repeats} × {d.distanceMeters}m · {d.restSeconds}s rest</p><small>{d.instructions}</small><p>Observe: {d.watchFor}</p></div></article>)}
 <button type="button" disabled={saving} onClick={()=>void review()}>{saving?'Saving…':'Save coach assessment'}</button></>}
 {result?.status==='needs_assessment'&&<p>{result.reason}</p>}
 {history.length>0&&<details><summary>Previous coach assessments ({history.length})</summary>{history.map(h=><p key={h.id}><strong>{h.focus.replaceAll('_',' ')} · {h.assessed_at.slice(0,10)}</strong> — {h.notes}</p>)}</details>}
 {message&&<p role="status">{message}</p>}
 <small>Assessments are stored for coach review only. No athlete plan has been modified.</small>
 </section>;
}