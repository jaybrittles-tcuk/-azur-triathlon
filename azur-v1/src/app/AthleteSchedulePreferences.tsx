import type { ReactNode } from 'react';
import { useState } from 'react';
import { validateSchedulingPreferences, type SchedulingPreferences, type Weekday, type Sport } from '../domain/schedulingPreferences';

const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
const colours:Record<Sport,string>={swim:'#53c9f5',bike:'#e88cbe',run:'#ffb45d'};
const sports:Sport[]=['swim','bike','run'];
type Props={value:SchedulingPreferences;onChange:(value:SchedulingPreferences)=>void};
export default function AthleteSchedulePreferences({value,onChange}:Props){
 const [panel,setPanel]=useState<'availability'|Sport|'long'|'limits'|'commitments'>('availability');
 const update=(patch:Partial<SchedulingPreferences>)=>onChange({...value,...patch});
 const toggle=(values:Weekday[],day:Weekday)=>values.includes(day)?values.filter(x=>x!==day):[...values,day].sort();
 const dayButton=(day:Weekday,selected:boolean,action:()=>void,disabled=false,accent='#58c4f3')=><button key={day} type="button" disabled={disabled} aria-pressed={selected} onClick={action} style={{minHeight:78,borderRadius:15,border:'1px solid '+(selected?accent:'#344353'),background:selected?'#183044':'#0b1b2b',color:disabled?'#647484':'#f2f7fb',fontWeight:700,display:'grid',placeContent:'center',gap:6,cursor:disabled?'not-allowed':'pointer'}}><span>{days[day]}</span><span aria-hidden="true">{disabled?'—':selected?'✓':'○'}</span></button>;
 const grid=(render:(d:Weekday)=>ReactNode)=><div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8,margin:'14px 0 18px'}}>{days.map((_,i)=>render(i as Weekday))}</div>;
 const tab=(id:typeof panel,label:string)=><button type="button" onClick={()=>setPanel(id)} aria-pressed={panel===id} style={{borderRadius:12,padding:'10px 8px',background:panel===id?'#164a67':'#11283b',border:'1px solid '+(panel===id?'#55b5e7':'#28465c'),color:'#fff',fontWeight:600}}>{label}</button>;
 const errors=validateSchedulingPreferences(value);
 return <section aria-label="Training schedule preferences" style={{margin:'20px 0',color:'#e9f3f9'}}>
  <h3>Build your training week</h3><p style={{opacity:.8}}>Tell AZUR what fits your life. Preferences guide scheduling, not your training load.</p>
  <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>{tab('availability','Available')}{sports.map(s=>tab(s,s[0].toUpperCase()+s.slice(1)))}{tab('long','Long sessions')}{tab('limits','Limits')}{tab('commitments','Commitments')}</div>
  {panel==='availability'&&<><p>Which days can you train?</p>{grid(d=>dayButton(d,value.availableDays.includes(d),()=>{const availableDays=toggle(value.availableDays,d);update({availableDays,preferredDays:Object.fromEntries(sports.map(s=>[s,value.preferredDays[s].filter(x=>availableDays.includes(x))])) as Record<Sport,Weekday[]>,longRideDay:value.longRideDay!==null&&availableDays.includes(value.longRideDay)?value.longRideDay:null,longRunDay:value.longRunDay!==null&&availableDays.includes(value.longRunDay)?value.longRunDay:null,oneSessionDays:value.oneSessionDays.filter(x=>availableDays.includes(x))});}))}</>}
  {sports.map(s=>panel===s&&<div key={s}><p>Preferred {s} days <small>— optional; these don't increase your session count.</small></p>{grid(d=>dayButton(d,value.preferredDays[s].includes(d),()=>update({preferredDays:{...value.preferredDays,[s]:toggle(value.preferredDays[s],d)}}),!value.availableDays.includes(d),colours[s]))}</div>)}
  {panel==='long'&&<><p>Choose your preferred long ride and long run days, or leave either unselected.</p>{(['longRideDay','longRunDay'] as const).map(key=><div key={key}><strong>{key==='longRideDay'?'Long ride':'Long run'}</strong>{grid(d=>dayButton(d,value[key]===d,()=>update({[key]:value[key]===d?null:d}),!value.availableDays.includes(d)||(key==='longRideDay'?value.longRunDay===d:value.longRideDay===d),key==='longRideDay'?colours.bike:colours.run))}</div>)}</>}
  {panel==='limits'&&<><p>Which days can only fit one session?</p>{grid(d=>dayButton(d,value.oneSessionDays.includes(d),()=>update({oneSessionDays:toggle(value.oneSessionDays,d)}),!value.availableDays.includes(d),'#f58b83'))}<label>Weekly routine <select value={value.routine} onChange={e=>update({routine:e.target.value as 'fixed'|'variable'})}><option value="fixed">Mostly consistent</option><option value="variable">Changes week to week</option></select></label><label>Pool length <select value={value.poolLengthMetres??''} onChange={e=>update({poolLengthMetres:e.target.value?Number(e.target.value) as 20|25|30|33|50:null})}><option value="">Not sure / no pool</option>{[20,25,30,33,50].map(m=><option key={m} value={m}>{m} metres</option>)}</select></label></>}
  {panel==='commitments'&&<div>
   <p>Add regular commitments that your coach should account for. Training commitments are identified separately so they aren't silently added to your weekly load.</p>
   {value.commitments.map(item=><div key={item.id} style={{border:'1px solid #31516a',borderRadius:14,padding:12,marginBottom:10}}>
    <label>Commitment name<input type="text" maxLength={100} value={item.title} onChange={e=>update({commitments:value.commitments.map(c=>c.id===item.id?{...c,title:e.target.value}:c)})}/></label>
    <label>Day<select value={item.day} onChange={e=>update({commitments:value.commitments.map(c=>c.id===item.id?{...c,day:Number(e.target.value) as Weekday}:c)})}>{days.map((d,i)=><option key={d} value={i}>{d}</option>)}</select></label>
    <label>Duration in minutes<input type="number" min={1} max={1440} value={item.durationMinutes} onChange={e=>update({commitments:value.commitments.map(c=>c.id===item.id?{...c,durationMinutes:Number(e.target.value)}:c)})}/></label>
    <label>Activity type<select value={item.sport??'other'} onChange={e=>update({commitments:value.commitments.map(c=>c.id===item.id?{...c,sport:e.target.value as typeof c.sport}:c)})}><option value="other">Other commitment</option><option value="strength">Strength / gym</option>{sports.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
    <label style={{display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" checked={item.countsTowardTraining} onChange={e=>update({commitments:value.commitments.map(c=>c.id===item.id?{...c,countsTowardTraining:e.target.checked}:c)})}/>This is training I already complete</label>
    <button type="button" onClick={()=>update({commitments:value.commitments.filter(c=>c.id!==item.id)})}>Remove commitment</button>
   </div>)}
   <button type="button" onClick={()=>update({commitments:[...value.commitments,{id:'commitment-'+Date.now()+'-'+value.commitments.length,title:'',day:0,durationMinutes:45,sport:'other',countsTowardTraining:false}]})}>+ Add weekly commitment</button>
  </div>}
  {errors.length>0&&<p role="alert" style={{color:'#ffb0a7'}}>{errors.join(' ')}</p>}
 </section>;
}

