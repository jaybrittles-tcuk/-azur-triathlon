import { useState } from 'react';

type Sport = 'bike'|'run'|'swim';
type Zone = {label:string;purpose:string;range:string};
const formatPace=(sec:number)=>{const n=Math.round(sec);return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
const watts=(ftp:number,low:number,high:number|null)=>`${Math.round(ftp*low)}–${high===null?'above':Math.round(ftp*high)+' W'}`;
function bikeZones(ftp:number):Zone[] {
 const defs:[string,string,number,number|null][]=[
 ['Z1 · Recovery','Easy spinning',0,0.55],
 ['Z2 · Endurance','Aerobic development',0.56,0.75],
 ['Z3 · Tempo','Steady sustained work',0.76,0.90],
 ['Z4 · Threshold','Controlled threshold intervals',0.91,1.05],
 ['Z5 · VO₂max','Short hard aerobic efforts',1.06,1.20],
 ['Z6 · Anaerobic','Very hard, short efforts',1.21,1.50],
 ['Z7 · Neuromuscular','Brief maximal efforts',1.51,null]];
 return defs.map(([label,purpose,lo,hi])=>({label,purpose,range:hi===null?`≥${Math.round(ftp*lo)} W`:`${Math.round(ftp*lo)}–${Math.round(ftp*hi)} W`}));
}
/** Run pace zones are illustrative percentages of threshold *speed*, not pace. */
function runZones(threshold:number):Zone[] {
 const defs:[string,string,number,number][]=[
 ['Z1 · Recovery','Very easy running',0.65,0.80],
 ['Z2 · Easy aerobic','Conversational endurance',0.81,0.90],
 ['Z3 · Steady','Moderate sustained running',0.91,0.96],
 ['Z4 · Threshold','Controlled threshold training',0.97,1.03],
 ['Z5 · Faster intervals','Short faster efforts',1.04,1.15]];
 return defs.map(([label,purpose,low,high])=>({label,purpose,range:`${formatPace(threshold/high)}–${formatPace(threshold/low)}/km`}));
}
function swimZones(css:number):Zone[] {
 const defs:[string,string,number,number][]=[
 ['Z1 · Recovery','Relaxed technique work',20,35],
 ['Z2 · Aerobic','Comfortable controlled swimming',10,19],
 ['Z3 · Steady','Sustained aerobic efforts',4,9],
 ['Z4 · CSS','Threshold-oriented swimming',-2,3],
 ['Z5 · Fast','Short faster repeats',-10,-3]];
 return defs.map(([label,purpose,low,high])=>({label,purpose,range:`${formatPace(Math.max(1,css+low))}–${formatPace(Math.max(1,css+high))}/100m`}));
}
export default function BenchmarkTrainingZones({ftp,runThreshold,swimCss}:{ftp:number|null;runThreshold:number|null;swimCss:number|null}) {
 const [sport,setSport]=useState<Sport>('bike');
 const source=sport==='bike'?ftp:sport==='run'?runThreshold:swimCss;
 const valid=typeof source==='number'&&Number.isFinite(source)&&source>0;
 const zones=valid?(sport==='bike'?bikeZones(source):sport==='run'?runZones(source):swimZones(source)):[];
 return <section className="panel azur-training-zones" aria-label="Personal training zones">
   <div className="section-heading"><div><span className="eyebrow">TRAINING INTENSITIES</span><h3>Your training zones</h3></div></div>
   <p className="panel-note">Reference ranges calculated from the thresholds saved in your athlete profile.</p>
   <div className="azur-zone-switch" role="group" aria-label="Choose sport">
    {([{key:'bike',label:'Bike'},{key:'run',label:'Run'},{key:'swim',label:'Swim'}] as const).map(item=><button type="button" key={item.key} aria-pressed={sport===item.key} onClick={()=>setSport(item.key)}>{item.label}</button>)}
   </div>
   {!valid?<p className="azur-v2-performance-empty">Add your {sport==='bike'?'FTP':sport==='run'?'run threshold pace':'CSS swim pace'} in Profile to see your zones.</p>:
    <div className="azur-zone-list">{zones.map(z=><div className="azur-zone-row" key={z.label}><div><strong>{z.label}</strong><small>{z.purpose}</small></div><strong className="azur-zone-range">{z.range}</strong></div>)}</div>}
   <p className="azur-v2-evidence-note">Illustrative starter zones, not individually validated physiological boundaries. Bike ranges are percentage-of-FTP bands, run ranges are threshold-speed estimates and swim ranges use CSS pace offsets. Your coach may refine them using testing, heart rate, RPE and session response. No workouts are changed by this view.</p>
 </section>;
}
