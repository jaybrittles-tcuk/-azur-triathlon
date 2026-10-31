// Read-only beta guide. No model calls, mutations, or inferred recovery advice.
export const planChatWelcome='I’m AZUR’s automated plan guide, not a message from your coach. Choose a session and ask about its purpose, duration or targets. I can’t change your plan or assess recovery. Messages stay in this browser session.';
export function explainPlanQuestion(question,{sessions=[],selectedId='',today}={}) {
 const q=String(question).trim().toLowerCase();
 if(/pain|injur|illness|sick|chest|dizz/.test(q))return 'This plan guide cannot assess symptoms or decide whether training is safe. Contact your coach and seek appropriate medical advice for health concerns.';
 if(/change|changed|adapt/.test(q))return 'I can explain the saved plan, but I do not have a verified change history here, so I cannot tell you why a workout changed. Ask your coach to review it.';
 if(/move|reschedul|shorter|less time|only.*min|reduce/.test(q))return 'I cannot move or shorten sessions in this beta. Open the session to review its prescription, then prepare a question for Jay. Nothing has been changed.';
 if(/fuel|nutrition|recover|readiness|fatigue|fitness|training load/.test(q))return 'That is outside this session-explanation beta. I can explain the saved workout’s purpose and targets. Ask your coach for advice requiring recovery, nutrition or training-load context.';
 let chosen=selectedId?sessions.filter(s=>s.id===selectedId):[];
 if(!selectedId){
  const named=sessions.filter(s=>s.title&&q.includes(s.title.toLowerCase()));
  const tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const day=q.includes('tomorrow')?tomorrow.toISOString().slice(0,10):today;
  chosen=named.length?named:sessions.filter(s=>s.plannedDate===day);
 }
 if(chosen.length!==1)return chosen.length?'There is more than one matching session. Choose the workout above so I explain the correct one.':'I cannot find a matching saved session. Choose a workout from the list or check your calendar. An empty day does not establish that recovery was prescribed.';
 const s=chosen[0],prefix=`From your saved plan: ${s.title} · ${s.plannedDate} · ${s.sport}.`;
 if(!/why|purpose|explain|target|duration|long|session|workout|today|tomorrow/.test(q))return 'I can explain a saved workout’s purpose, duration and prescribed targets. Try “Why am I doing this session?”';
 const duration=Number(s.durationMin);
 const lines=[prefix,Number.isFinite(duration)&&duration>0?`Planned duration: ${duration} minutes.`:'Planned duration is not available.'];
 if(s.rationale?.trim())lines.push(`Plan rationale: ${s.rationale.trim()}`);else lines.push('No coaching rationale has been saved for this session. I will not infer a personalised reason from its title.');
 const prescription=s.prescription;
 const blocks=prescription&&typeof prescription==='object'?['warmup','main_set','cooldown'].flatMap(key=>Array.isArray(prescription[key])?prescription[key].map(b=>({key,...b})):[]):[];
 const targets=blocks.filter(b=>typeof b.target==='string'&&b.target.trim()).slice(0,8).map(b=>`${b.key.replace('_',' ')}: ${b.target}${Number(b.duration_min)>0?` for ${b.duration_min} min`:''}${b.rpe?` · RPE ${b.rpe}`:''}`);
 lines.push(targets.length?'Saved targets: '+targets.join('; '):'Open session details for the full prescription; no structured target text is available here.');
 if(s.status==='completed')lines.push('Recorded complete. That status alone does not establish how well the targets were executed.');
 return lines.join('\n\n');
}
