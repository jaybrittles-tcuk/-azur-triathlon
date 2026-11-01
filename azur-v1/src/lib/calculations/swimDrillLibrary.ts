export type SwimDrillFocus='body_position'|'catch'|'rotation'|'breathing'|'kick'|'sighting';
export type SwimDrill={id:string;name:string;focus:SwimDrillFocus;distanceMeters:number;repeats:number;restSeconds:number;instructions:string;watchFor:string;equipment?:string;};
export const swimDrillLibrary:readonly SwimDrill[]=[
 {id:'side-kick',name:'Side kicking',focus:'body_position',distanceMeters:25,repeats:4,restSeconds:20,instructions:'Kick on one side with one arm forward, swap sides each length; keep head in line.',watchFor:'Hips and legs near surface'},
 {id:'six-one-six',name:'6-1-6 rotation',focus:'rotation',distanceMeters:25,repeats:4,restSeconds:20,instructions:'Six kicks on the side, one stroke to rotate, then six kicks on the other side.',watchFor:'Smooth hip-led rotation'},
 {id:'sculling',name:'Front scull',focus:'catch',distanceMeters:25,repeats:4,restSeconds:25,instructions:'Hands slightly wider than shoulders; feel pressure on the forearms.',watchFor:'Controlled forearm pressure, not rushed arm movements'},
 {id:'fist-swim',name:'Fist swimming',focus:'catch',distanceMeters:25,repeats:4,restSeconds:20,instructions:'Swim with relaxed closed fists, then compare with open-hand swimming.',watchFor:'Forearm engagement without losing body alignment'},
 {id:'bilateral-breathing',name:'Breathing rhythm',focus:'breathing',distanceMeters:50,repeats:4,restSeconds:20,instructions:'Maintain a comfortable breathing pattern while turning with the body; never hold breath.',watchFor:'Continuous exhalation in the water'},
 {id:'single-arm',name:'Single-arm freestyle',focus:'rotation',distanceMeters:25,repeats:4,restSeconds:25,instructions:'One arm swims while the other stays forward; alternate arms each length.',watchFor:'Balance and stable head position'},
 {id:'sighting',name:'Open-water sighting practice',focus:'sighting',distanceMeters:50,repeats:4,restSeconds:20,instructions:'Briefly lift eyes forward, then turn to breathe while maintaining body position.',watchFor:'Minimal leg drop after sighting'}
];
export function chooseDrills(focus:SwimDrillFocus,maximumMeters=400):SwimDrill[]{
 if(!Number.isFinite(maximumMeters)||maximumMeters<=0)return [];
 let used=0;
 return swimDrillLibrary.filter(drill=>{
  const length=drill.distanceMeters*drill.repeats;
  if(drill.focus!==focus||used+length>maximumMeters)return false;
  used+=length;return true;
 });
}
export function validateSwimDrill(drill:SwimDrill):string[]{
 const errors:string[]=[];
 if(!Number.isInteger(drill.distanceMeters)||drill.distanceMeters<25||drill.distanceMeters%25)errors.push('Distance must align to 25m pool lengths');
 if(!Number.isInteger(drill.repeats)||drill.repeats<1||drill.repeats>20)errors.push('Invalid number of repeats');
 if(!Number.isInteger(drill.restSeconds)||drill.restSeconds<0||drill.restSeconds>120)errors.push('Invalid rest');
 if(!drill.instructions.trim()||!drill.watchFor.trim())errors.push('Missing coaching cues');
 return errors;
}
