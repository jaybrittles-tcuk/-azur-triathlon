import {useState} from 'react';
import type {AssignedAthlete} from './CoachAthleteRoster';
import CoachActionCentre from './CoachActionCentre';
import CoachAttentionInbox from './CoachAttentionInbox';
import CoachTrainingExceptions from './CoachTrainingExceptions';
import CoachTrainingPatterns from './CoachTrainingPatterns';
import CoachWorkoutMatchReview from './CoachWorkoutMatchReview';
import CoachWeeklyReview from './CoachWeeklyReview';
import CoachSwimFocusReview from './CoachSwimFocusReview';

type Area='actions'|'analysis'|'planning';
type Props={onSelectAthlete:(athlete:AssignedAthlete)=>void};
const areas:{id:Area;title:string;description:string;icon:string}[]=[
 {id:'actions',title:'Athlete Actions',description:'Prioritised decisions and athlete feedback',icon:'◎'},
 {id:'analysis',title:'Training Analysis',description:'Workout execution and training patterns',icon:'◷'},
 {id:'planning',title:'Planning Tools',description:'Review workout libraries and weekly plans',icon:'▦'},
];

export default function CoachMonitoringWorkspace({onSelectAthlete}:Props){
 const [active,setActive]=useState<Area>('actions');
 return <section aria-label="Coach monitoring tools" style={{minWidth:0,maxWidth:'100%',paddingBottom:'calc(96px + env(safe-area-inset-bottom, 0px))'}}>
  <div style={{margin:'0 0 16px',minWidth:0}}>
   <div style={{marginBottom:12}}>
    <h3 style={{fontSize:'clamp(20px, 4.3vw, 25px)',margin:'0 0 5px',color:'#f5faff'}}>Coach Monitoring</h3>
    <p style={{margin:0,color:'#a8c2d8',fontSize:13,lineHeight:1.45}}>Start with the decisions that need you. Open the detailed tools only when needed.</p>
   </div>
   <nav aria-label="Monitoring sections" style={{display:'grid',gridTemplateColumns:'repeat(3, minmax(0, 1fr))',gap:7,minWidth:0}}>
    {areas.map(area=><button key={area.id} type="button" aria-pressed={active===area.id}
      onClick={()=>setActive(area.id)}
      style={{minWidth:0,minHeight:78,textAlign:'left',display:'flex',flexDirection:'column',alignItems:'flex-start',justifyContent:'center',gap:5,
        padding:'10px 9px',borderRadius:13,whiteSpace:'normal',lineHeight:1.2,overflowWrap:'anywhere',
        border:active===area.id?'1px solid #3faff9':'1px solid rgba(123,180,219,.28)',
        background:active===area.id?'linear-gradient(145deg,#125689,#102e4d)':'#112d45',
        boxShadow:active===area.id?'inset 0 1px 0 rgba(204,237,255,.15)':'none',color:'#effaff'}}>
      <span style={{fontSize:17,color:active===area.id?'#95ddff':'#88adc9'}} aria-hidden="true">{area.icon}</span>
      <span style={{fontWeight:700,fontSize:12.5,letterSpacing:'-.1px'}}>{area.title}</span>
     </button>)}
   </nav>
   <p style={{fontSize:12,color:'#92aec5',margin:'9px 2px 0',lineHeight:1.5}}>{areas.find(area=>area.id===active)?.description}</p>
  </div>
  {active==='actions'&&<div aria-label="Athlete Actions" style={{minWidth:0}}>
    <CoachActionCentre/>
    <CoachAttentionInbox onSelect={onSelectAthlete}/>
   </div>}
  {active==='analysis'&&<div aria-label="Training Analysis" style={{minWidth:0}}>
    <CoachTrainingExceptions/>
    <CoachTrainingPatterns/>
    <CoachWorkoutMatchReview/>
    {import.meta.env.VITE_ENABLE_SWIM_ASSESSMENTS === 'true' && <CoachSwimFocusReview/>}
   </div>}
  {active==='planning'&&<div aria-label="Planning Tools" style={{minWidth:0}}>
    {import.meta.env.VITE_ENABLE_WEEKLY_REVIEW === 'true'
      ? <CoachWeeklyReview/>
      : <p style={{color:'#aac4d5'}}>Weekly planning tools are not enabled in this environment.</p>}
   </div>}
 </section>;
}
