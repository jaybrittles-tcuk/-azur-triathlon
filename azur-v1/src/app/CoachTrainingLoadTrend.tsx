import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AssignedAthlete } from './CoachAthleteRoster';
import {
  calculateBikeTrainingStress, calculateRunTrainingStress, calculateSwimTrainingStress,
  calculateTrainingLoad, isTrainingLoadEligible,
} from '../lib/calculations/trainingLoad';
import type { TrainingLoadPoint } from '../lib/calculations/trainingLoad';

type Activity = {
  sport: string | null; start_time: string; duration_sec: number | null;
  distance_m: number | null; processed_metrics: { normalized_power?: number | null; is_test?: boolean } | null;
  source: string | null;
};
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export default function CoachTrainingLoadTrend({athlete}:{athlete:AssignedAthlete}) {
  const [series,setSeries] = useState<TrainingLoadPoint[]>([]);
  const [eligible,setEligible] = useState(0);
  const [range,setRange] = useState<42|90|180>(42);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');

  useEffect(()=>{
    let cancelled=false;
    setSeries([]);setEligible(0);setError('');setLoading(true);
    const load=async()=>{
      try {
        const {data:{user},error:authError}=await supabase.auth.getUser();
        if(authError||!user||user.app_metadata?.role!=='coach') throw new Error('Verified coach access required');
        const {data:assignment,error:assignmentError}=await supabase.from('coach_athlete_assignment')
          .select('athlete_id').eq('coach_user_id',user.id).eq('athlete_id',athlete.id).maybeSingle();
        if(assignmentError||!assignment) throw new Error('Athlete not assigned to this coach');
        const today=new Date();
        const start=new Date(today);start.setUTCDate(start.getUTCDate()-179);
        const {data,error:activityError}=await supabase.from('completed_activity')
          .select('sport,start_time,duration_sec,distance_m,processed_metrics,source')
          .eq('athlete_id',athlete.id).gte('start_time',start.toISOString())
          .lte('start_time',today.toISOString()).order('start_time',{ascending:true}).limit(2000);
        if(activityError)throw activityError;
        if((data??[]).length===2000)throw new Error('Activity history exceeds the current chart limit; cannot display a complete trend.');
        const stressByDay=new Map<string,number>();
        let count=0;
        for(const a of (data??[]) as Activity[]){
          if(!a.start_time||!isTrainingLoadEligible({source:a.source??undefined,isTest:a.processed_metrics?.is_test===true}))continue;
          const duration=Number(a.duration_sec)||0;
          const distance=Number(a.distance_m)||0;
          const result=a.sport==='bike'&&athlete.ftp_w&&a.processed_metrics?.normalized_power
            ?calculateBikeTrainingStress({durationSec:duration,normalizedPower:Number(a.processed_metrics.normalized_power),ftp:athlete.ftp_w})
            :a.sport==='run'&&athlete.run_threshold_sec_per_km
            ?calculateRunTrainingStress({durationSec:duration,distanceM:distance,thresholdSecPerKm:athlete.run_threshold_sec_per_km})
            :a.sport==='swim'&&athlete.swim_threshold_sec_per_100m
            ?calculateSwimTrainingStress({durationSec:duration,distanceM:distance,thresholdSecPer100m:athlete.swim_threshold_sec_per_100m})
            :null;
          if(!result||!Number.isFinite(result.stress))continue;
          count++;
          const key=dayKey(new Date(a.start_time));
          stressByDay.set(key,(stressByDay.get(key)??0)+result.stress);
        }
        const first=[...stressByDay.keys()].sort()[0];
        let points:TrainingLoadPoint[]=[];
        if(first){
          const days=[];const firstDate=new Date(first+'T00:00:00Z');
          const last=new Date(dayKey(today)+'T00:00:00Z');
          for(let date=new Date(firstDate);date<=last;date.setUTCDate(date.getUTCDate()+1)){
            const key=dayKey(date);days.push({date:key,stress:stressByDay.get(key)??0});
          }
          points=calculateTrainingLoad(days);
        }
        if(!cancelled){setSeries(points);setEligible(count);}
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Unable to load training load');}
      finally{if(!cancelled)setLoading(false);}
    };void load();return()=>{cancelled=true;};
  },[athlete.id,athlete.ftp_w,athlete.run_threshold_sec_per_km,athlete.swim_threshold_sec_per_100m]);

  const qualified=series.length>=42&&eligible>=8;
  const points=series.slice(-range);
  const latest=points[points.length-1];
  const values=points.flatMap(p=>[p.fitness,p.fatigue,p.form]);
  const low=Math.min(0,...values),high=Math.max(1,...values);
  const y=(n:number)=>100-(n-low)/Math.max(1,high-low)*90;
  const lines=([{key:'fitness',label:'Fitness',color:'#24b9f2'},{key:'fatigue',label:'Fatigue',color:'#f5c544'},{key:'form',label:'Form',color:'#62d9a3'}] as const);
  return <section className="coach-load-panel" aria-label="Athlete training-load history">
    <div className="coach-load-top"><div><h5>Training-load trends</h5><small>Read-only · recorded activities</small></div>
      <div className="coach-load-ranges">{([42,90,180] as const).map(n=><button key={n} type="button" aria-pressed={range===n} onClick={()=>setRange(n)}>{n===42?'6W':n===90?'3M':'6M'}</button>)}</div>
    </div>
    {loading&&<p>Loading athlete training load…</p>}
    {error&&<p role="alert">{error}</p>}
    {!loading&&!error&&!qualified&&<p>Not enough reliable activity history to estimate trends. Requires at least 42 days since the first stress-calculable activity and 8 eligible activities. Available: {eligible} eligible activities over {series.length} days.</p>}
    {!loading&&!error&&qualified&&<>
      <div className="coach-load-numbers">{lines.map(line=><div key={line.key}><small style={{color:line.color}}>{line.label}</small><strong>{Math.round(latest[line.key])}</strong></div>)}</div>
      <svg className="coach-load-plot" viewBox="0 0 340 115" role="img" aria-label={`Fitness fatigue form estimates across ${points.length} recorded days`} preserveAspectRatio="none">
        {[0,.5,1].map((f,i)=><line key={i} x1="4" x2="336" y1={10+f*90} y2={10+f*90} stroke="#2b5069" strokeDasharray="3 5"/>)}
        {lines.map(line=><polyline key={line.key} fill="none" stroke={line.color} strokeWidth="2.6" strokeLinejoin="round" points={points.map((p,i)=>`${4+i*332/Math.max(1,points.length-1)},${y(p[line.key])}`).join(' ')}/>)}
      </svg>
      <p>Latest: {latest.date} · Based on {eligible} eligible activities. Trends estimate workload adaptation, not recovery readiness or injury risk.</p>
      <small className="coach-load-note">Coach review only. No automatic plan changes. Model starts at zero until adequate prior training history is available.</small>
    </>}
  </section>;
}
