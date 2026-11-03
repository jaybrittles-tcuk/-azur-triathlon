import type {CSSProperties} from 'react';

type Step={durationMin?:unknown;target?:unknown;purpose?:unknown;repeats?:unknown;distanceMeters?:unknown;restSeconds?:unknown};
const cleanText=(value:unknown)=>typeof value==='string'?value.trim().slice(0,600):'';
const positiveNumber=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const heading=(target:string,index:number,total:number)=>{
 const t=target.toLowerCase();
 if(/warm[ -]?up/.test(t))return 'Warm-up';
 if(/cool[ -]?down/.test(t))return 'Cool-down';
 if(/recover|easy spin|rest /.test(t))return 'Recovery / easy';
 if(index===0)return 'Opening block';
 if(index===total-1)return 'Final block';
 return 'Main set';
};
const rowStyle:CSSProperties={display:'flex',alignItems:'flex-start',gap:12,padding:'12px 0',borderBottom:'1px solid rgba(155,194,221,.16)',minWidth:0};
const detailStyle:CSSProperties={color:'#cee1ed',fontSize:14,lineHeight:1.55,whiteSpace:'normal',overflowWrap:'anywhere'};
const duration=(min:unknown)=>positiveNumber(min)===null?'Time to confirm':`${min} min`;
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
export default function WorkoutPrescriptionView({prescription}:{prescription:unknown}){
 if(!object(prescription))return <p style={detailStyle}>Structured workout information is unavailable.</p>;
 const steps=Array.isArray(prescription.steps)?prescription.steps.filter(object).slice(0,80) as Step[]:[];
 const segments=Array.isArray(prescription.poolSegments)?prescription.poolSegments.filter(object).slice(0,80) as Step[]:[];
 if(steps.length){
  return <div aria-label="Structured workout prescription" style={{maxWidth:'100%',minWidth:0}}>
   {steps.map((step,index)=>{
    const target=cleanText(step.target);
    return <div key={index} style={rowStyle}>
     <span aria-hidden="true" style={{display:'grid',placeItems:'center',flex:'0 0 28px',width:28,height:28,borderRadius:9,background:'rgba(26,140,232,.2)',color:'#9bd6ff',fontWeight:700,fontSize:12}}>{index+1}</span>
     <div style={{minWidth:0,flex:1}}>
      <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:5,alignItems:'baseline'}}>
       <strong style={{fontSize:14,color:'#f4faff'}}>{heading(target,index,steps.length)}</strong>
       <span style={{color:'#82caff',fontSize:13,fontWeight:700}}>{duration(step.durationMin)}</span>
      </div>
      <p style={{...detailStyle,margin:'5px 0 0'}}>{target||'Coach instructions to follow'}</p>
     </div>
    </div>;
   })}
  </div>;
 }
 if(segments.length){
  return <div aria-label="Structured swim prescription" style={{maxWidth:'100%',minWidth:0}}>
   {segments.map((segment,index)=>{
    const repeats=positiveNumber(segment.repeats);
    const metres=positiveNumber(segment.distanceMeters);
    const rest=positiveNumber(segment.restSeconds);
    const target=cleanText(segment.target);
    const label=cleanText(segment.purpose).replace(/_/g,' ')||heading(target,index,segments.length);
    return <div key={index} style={rowStyle}>
     <span aria-hidden="true" style={{display:'grid',placeItems:'center',flex:'0 0 28px',width:28,height:28,borderRadius:9,background:'rgba(26,140,232,.2)',color:'#9bd6ff',fontWeight:700,fontSize:12}}>{index+1}</span>
     <div style={{minWidth:0,flex:1}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:6,flexWrap:'wrap'}}>
       <strong style={{fontSize:14,color:'#f4faff',textTransform:'capitalize'}}>{label}</strong>
       <span style={{color:'#82caff',fontSize:13,fontWeight:700}}>{repeats===null?'':`${repeats} × `}{metres===null?'Distance to confirm':`${metres}m`}</span>
      </div>
      <p style={{...detailStyle,margin:'5px 0 0'}}>{target||'Coach instructions to follow'}</p>
      {rest!==null&&rest>0&&<span style={{color:'#9ab9ca',fontSize:12}}>Rest: {rest} seconds between repetitions</span>}
     </div>
    </div>;
   })}
  </div>;
 }
 return <p style={detailStyle}>No recognised structured workout blocks are available. Ask the coach to verify the prescription.</p>;
}
