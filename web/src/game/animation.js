const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(a,b,dt,speed=13)=>a+(b-a)*(1-Math.exp(-speed*dt));
// Rig poses are driven by authoritative combat states, including online snapshots.
export function animateRig(n,e,time,dt,menu=false){
 const m=n.model,rig=n.rig; n.baseScale||=m.scale.clone();
 const walking=e.moving||Math.hypot(e.x-n.oldX,e.y-n.oldY)>.09;
 n.walk=approach(n.walk||0,walking?1:0,dt,9);
 const desired=Number.isFinite(e.heading)?Math.PI/2-e.heading:n.angle;
 n.angle+=Math.atan2(Math.sin(desired-n.angle),Math.cos(desired-n.angle))*(1-Math.exp(-dt*14));m.rotation.y=n.angle;
 const phase=e.ph||time*7,wave=Math.sin(phase),idle=Math.sin(time*2.5+e.id)*.026;
 const prep=e.attackWindup>0?clamp(1-e.attackWindup/(e.attackPrep||.16),0,1):0;
 const attack=clamp(e.atk||0,0,1),hit=clamp(e.hurt||0,0,1),ranged=!!e.card.proj||e.card.zap;
 const stride=.62*n.walk,armIdle=menu?.06:idle;
 const pose=(part,x,y=0,z=0)=>{const p=rig[part];if(!p)return;p.rotation.x=approach(p.rotation.x,x,dt,22);p.rotation.y=approach(p.rotation.y,y,dt,22);p.rotation.z=approach(p.rotation.z,z,dt,22);};
 pose('leftLeg',wave*stride);pose('rightLeg',-wave*stride);
 let left=-wave*stride*.65+armIdle,right=wave*stride*.65-armIdle;
 if(prep){right-=prep*(ranged?.95:1.8);left-=prep*(ranged?.85:.3);}
 if(attack){right+=attack*(ranged?-1.05:1.25);left+=attack*(ranged?-.9:.35);}
 pose('leftArm',left,0,prep*.08);pose('rightArm',right,attack*(ranged?0:-.48),-prep*.2);
 pose('leftWing',0,0,Math.sin(time*(e.card.art==='bat'?19:9))*.6);pose('rightWing',0,0,-Math.sin(time*(e.card.art==='bat'?19:9))*.6);
 if(e.stun>0){m.rotation.z=Math.sin(time*19)*.09;m.rotation.x=-.1;}else{m.rotation.z=hit*Math.sin(time*28)*.06;m.rotation.x=approach(m.rotation.x,-n.walk*.05-prep*.07+attack*.13-hit*.16,dt);}
 const spawn=clamp(1-(e.deploy||0)/(e.card.deploy||1),0,1),bounce=spawn<1?Math.sin(spawn*Math.PI)*.12:0;
 m.scale.copy(n.baseScale).multiplyScalar(.78+spawn*.22+bounce);
 m.position.y+=(Math.abs(wave)*.065*n.walk+idle)*(e.air?.25:1)-(1-spawn)*.4;
 if(e.card.art==='dollaltar')m.position.y+=Math.sin(time*3)*.09;
 return {prep,attack,hit};
}
export function animateDeath(n,dt){
 n.deathTime=(n.deathTime||0)+dt;const k=clamp(n.deathTime/.42,0,1);
 n.model.rotation.z=Math.sin(k*Math.PI/2)*1.4;n.model.position.y-=dt*.85;
 n.model.scale.copy(n.baseScale||n.model.scale).multiplyScalar(1-k*.45);return k>=1;
}
