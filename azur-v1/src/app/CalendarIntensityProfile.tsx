import { normalizeWorkoutIntervals } from '../lib/calculations/workoutIntensity';

// Zwift-style cycling power colours for FTP prescriptions; RPE uses an explicitly labelled effort palette, not inferred FTP zones.
const ftpZoneColor=(percent:number)=>percent<55?'#a7adb7':percent<75?'#328bd4':percent<90?'#36a66c':percent<105?'#f0c23d':percent<120?'#f28c38':'#e54855';
const rpeEffortColor=(rpe:number)=>rpe<=2?'#a7adb7':rpe<=4?'#328bd4':rpe<=5?'#36a66c':rpe<=7?'#f0c23d':rpe<=8?'#f28c38':'#e54855';
export default function CalendarIntensityProfile({ steps }: { steps: unknown }) {
  const intervals = normalizeWorkoutIntervals(steps);
  if (!intervals.length || intervals.length > 60 || intervals.some((step) => step.durationSec === null)) return null;
  const total = intervals.reduce((sum, step) => sum + (step.durationSec ?? 0), 0);
  const targets = intervals.map((step) => step.target).filter((target) => target !== null);
  if (!total || targets.length !== intervals.length) return null;
  const metric = targets[0].metric;
  if (!targets.every((target) => target.metric === metric)) return null;
  const values = targets.map((target) => (target.low + target.high) / 2);
  const isPace = metric === 'pace_sec_per_km' || metric === 'swim_pace_sec_per_100m';
  const performance = values.map((value) => isPace ? 1 / value : value);
  if (performance.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const min = Math.min(...performance);
  const max = Math.max(...performance);
  const span = max - min;
  return (
    <div className="calendar-intensity-profile" style={{position:"relative",display:"block",width:"100%",minWidth:0,overflow:"hidden",padding:"5px 0",boxSizing:"border-box",clear:"both"}}>
      <div className="calendar-intensity-profile-head" style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
        <strong>Prescribed intensity</strong>
        <span>{targets[0].unit} · relative scale</span>
      </div>
      <div className="calendar-intensity-bars" style={{display:"flex",alignItems:"flex-end",height:54,width:"100%",minWidth:0,overflow:"hidden",background:"#142b3b",borderRadius:10,padding:"6px",boxSizing:"border-box"}} role="img"
        aria-label={`Workout intensity profile: ${intervals.length} timed segments; relative bar heights compare ${targets[0].unit} within this workout`}>
        {intervals.map((part, index) => {
          const height = span === 0 ? 62 : 20 + 80 * (performance[index] - min) / span;
          return (
            <span key={index}
              className={`calendar-intensity-bar ${part.kind}`}
              style={{ flexGrow: part.durationSec ?? 0, flexBasis: 0, height: `${height}%`, minWidth: 2, backgroundColor:metric==="ftp_percent"?ftpZoneColor(values[index]):metric==="rpe"?rpeEffortColor(values[index]):"#8298a8",borderRadius:2,alignSelf:"flex-end" }}
              title={`${part.kind}: ${Math.round((part.durationSec ?? 0) / 60 * 10) / 10} min · ${targets[index].low}–${targets[index].high} ${targets[index].unit}`}
            />
          );
        })}
      </div>
      <small style={{display:"block",marginTop:5,lineHeight:1.4}}>Widths = duration · Heights = relative prescribed target{metric==="ftp_percent"?" · Colours = cycling FTP zones":metric==="rpe"?" · Colours = perceived effort (not FTP zones)":" · No inferred power zones"}</small>
    </div>
  );
}
