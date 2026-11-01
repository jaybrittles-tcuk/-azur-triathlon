import type {BaselineAssessment} from './historyBaseline';
import type {HealthBaseline, HealthMetric} from './healthBaseline';

/** Interpretation-only engine. Never changes workouts, diagnoses illness or issues training instructions. */
export type AthleteCheckIn = {
  date: string;
  perceivedFatigue?: 1|2|3|4|5;
  soreness?: 1|2|3|4|5;
  feelsUnwell?: boolean;
};
export type ReadinessSignal = {
  code: string;
  severity: 'information'|'attention'|'review';
  explanation: string;
  evidence: string[];
};
export type AthleteReadiness = {
  status: 'insufficient_data'|'monitor'|'coach_review'|'no_concerns_detected';
  evidenceConfidence: 'limited'|'moderate';
  trainingLoad: {status: BaselineAssessment['status']; coveragePercent: number};
  signals: ReadinessSignal[];
  coachApprovalRequired: boolean;
  automaticPlanChangesAllowed: false;
  disclaimer: string;
};
const daysBetween = (a:string,b:string) => (Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000;
function byMetric(values: HealthBaseline[],metric:HealthMetric):HealthBaseline|undefined {
 return values.find(v=>v.metric===metric);
}
export function assessAthleteReadiness(input:{
 assessmentDate:string;
 training:BaselineAssessment;
 health:HealthBaseline[];
 checkIn?:AthleteCheckIn;
}):AthleteReadiness {
 const {training,health,checkIn,assessmentDate}=input;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate) || Number.isNaN(Date.parse(assessmentDate+'T00:00:00Z')))
  throw new Error('Invalid assessment date');
 const signals:ReadinessSignal[]=[];
 if(training.status!=='ready') signals.push({
  code:'training_history_limited',severity:'information',
  explanation:'Training history is not sufficiently complete for a confident starting load baseline.',
  evidence:[`${training.observedDays}/${training.windowDays} confirmed days`]
 });
 const established=health.filter(h=>h.status==='established'&&h.current!==null&&h.delta!==null);
 const sleep=byMetric(established,'sleep_minutes');
 const rhr=byMetric(established,'resting_hr');
 const hrv=byMetric(established,'hrv');
 // A single sensor result never determines training readiness or an automated change.
 const recoveryVariations=[
  sleep?.baseline&&sleep.delta!==null&&sleep.delta<=-90 ? 'Sleep at least 90 min below personal median' : null,
  rhr?.baseline&&rhr.delta!==null&&rhr.delta>=7 ? 'Resting HR at least 7 bpm above personal median' : null,
  hrv?.baseline&&hrv.delta!==null&&hrv.delta/hrv.baseline<=-0.2 ? 'HRV at least 20% below personal median' : null,
 ].filter((s):s is string=>s!==null);
 if(recoveryVariations.length>=2) signals.push({
  code:'combined_recovery_variations',severity:'attention',
  explanation:'Multiple recovery measurements differ from the athlete’s personal baseline. Check context and athlete feedback.',
  evidence:recoveryVariations
 });
 else if(recoveryVariations.length===1) signals.push({
  code:'single_recovery_variation',severity:'information',
  explanation:'One recovery measurement is outside the illustrative screening range; no conclusion can be drawn from this alone.',
  evidence:recoveryVariations
 });
 const freshCheckIn=checkIn&&checkIn.date===assessmentDate;
 if(freshCheckIn && checkIn?.feelsUnwell) signals.push({
  code:'athlete_reports_illness',severity:'review',
  explanation:'The athlete reports feeling unwell. Flag for coach review; do not automatically prescribe training.',
  evidence:['Current athlete check-in: feeling unwell']
 });
 if(freshCheckIn && (checkIn?.perceivedFatigue??0)>=4) signals.push({
  code:'high_reported_fatigue',severity:'attention',
  explanation:'The athlete reports high fatigue. Consider checking recent training and discussing the session with the athlete.',
  evidence:[`Athlete-reported fatigue ${checkIn!.perceivedFatigue}/5`]
 });
 if(freshCheckIn && (checkIn?.soreness??0)>=4) signals.push({
  code:'high_reported_soreness',severity:'attention',
  explanation:'The athlete reports substantial soreness. Coach should consider the athlete’s circumstances.',
  evidence:[`Athlete-reported soreness ${checkIn!.soreness}/5`]
 });
 if(checkIn && !freshCheckIn) signals.push({
  code:'stale_checkin',severity:'information',explanation:'Athlete feedback is not from the assessment date.',
  evidence:[`Most recent supplied check-in: ${checkIn.date}`]
 });
 const review=signals.some(s=>s.severity==='review');
 const attention=signals.some(s=>s.severity==='attention');
 const anyReliableData=training.status==='ready'||established.length>0||Boolean(freshCheckIn);
 const status=review?'coach_review':!anyReliableData?'insufficient_data':attention?'monitor':'no_concerns_detected';
 return {
  status,evidenceConfidence:training.status==='ready'&&established.length>=2&&Boolean(freshCheckIn)?'moderate':'limited',
  trainingLoad:{status:training.status,coveragePercent:training.coveragePercent},
  signals,coachApprovalRequired:review||attention,automaticPlanChangesAllowed:false,
  disclaimer:'Non-medical, observational screening only. No automated training adjustment is authorised.'
 };
}
