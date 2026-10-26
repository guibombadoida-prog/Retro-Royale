const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(a,b,dt,speed=13)=>a+(b-a)*(1-Math.exp(-speed*dt));
const ease=k=>k*k*(3-2*k);

/* As poses vêm só do estado autoritativo do combate (também nos snapshots do online):
   moving/ph (passo), attackWindup/attackPrep (preparação), atk 1→0 (golpe: o dano sai em atk=1),
   hurt (dano recebido), stun (atordoado) e deploy (entrada). `userData.style` escolhe o ataque.
   Princesa da Bolha: cast (conjurando a bolha), bolha (presa flutuando) e caindo (a bolha estourou). */
const STYLES={
 // [braço direito na preparação, no golpe], [giro do corpo prep/golpe], avanço no golpe, inclinação prep/golpe
 sword:{arm:[-2.7,-1.15],armZ:[.35,-.15],off:[-.55,-.7],twist:[.4,-.35],lunge:.16,lean:[-.08,.16]},
 stab:{arm:[.9,-1.65],armZ:[0,0],off:[.3,-.4],twist:[.3,-.25],lunge:.24,lean:[-.12,.24]},
 punch:{arm:[1.1,-1.55],armZ:[.2,0],off:[-.6,.5],twist:[.45,-.4],lunge:.2,lean:[-.14,.22]},
 throw:{arm:[-2.85,-.75],armZ:[.25,0],off:[.4,-.2],twist:[.3,-.3],lunge:.08,lean:[-.12,.2]},
 bow:{arm:[-1.35,-.35],armZ:[-.25,-.1],off:[-1.5,-1.5],twist:[.35,.3],lunge:-.04,lean:[0,-.04]},
 bite:{arm:[0,0],armZ:[0,0],off:[0,0],twist:[0,0],lunge:.38,lean:[-.35,.45]}
};

export function animateRig(n,e,time,dt,menu=false){
 const m=n.model,rig=n.rig;n.baseScale||=m.scale.clone();
 const style=STYLES[m.userData.style]||STYLES.sword;
 const walking=e.moving||Math.hypot(e.x-n.oldX,e.y-n.oldY)>.09;
 n.walk=approach(n.walk||0,walking?1:0,dt,9);
 const desired=Number.isFinite(e.heading)?Math.PI/2-e.heading:n.angle;
 n.angle+=Math.atan2(Math.sin(desired-n.angle),Math.cos(desired-n.angle))*(1-Math.exp(-dt*14));

 const id=e.id||0,phase=e.ph||time*8,wave=Math.sin(phase),walk=n.walk;
 const prep=e.attackWindup>0?ease(clamp(1-e.attackWindup/(e.attackPrep||.16),0,1)):0;
 const attack=clamp(e.atk||0,0,1),strike=attack*attack,hit=clamp(e.hurt||0,0,1),stun=e.stun>0;
 // Fica em "guarda" enquanto prepara ou acabou de golpear.
 n.fight=approach(n.fight||0,prep>0||attack>0?1:0,dt,prep>0?16:4);
 const breathe=Math.sin(time*2.6+id*1.7),fast=attack>0||prep>0?34:16;
 const pose=(part,x,y=0,z=0,speed=fast)=>{const p=rig[part];if(!p)return;p.rotation.x=approach(p.rotation.x,x,dt,speed);p.rotation.y=approach(p.rotation.y,y,dt,speed);p.rotation.z=approach(p.rotation.z,z,dt,speed);};
 const mix=a=>a[0]*prep*(1-strike)+a[1]*strike;

 const trapped=e.bolha>0,falling=!!e.caindo,kick=Math.sin(time*6+id);
 // Pernas: passo curto e largo de boneco chibi; presa na bolha, pedala no ar.
 if(trapped){pose('leftLeg',kick*.6,0,-.15,14);pose('rightLeg',-kick*.6,0,.15,14);}
 else if(falling){pose('leftLeg',-.25,0,-.3,20);pose('rightLeg',-.25,0,.3,20);}
 else{pose('leftLeg',wave*.85*walk,0,0,22);pose('rightLeg',-wave*.85*walk,0,0,22);}
 // Braços: balanço do passo + respiração + ataque do estilo.
 const swing=wave*.7*walk*(1-n.fight),idle=menu?.08:.05;
 let rx=-swing+breathe*idle*.5,rz=-.08-breathe*.03,lx=swing-breathe*idle*.5,lz=.08+breathe*.03;
 rx+=mix(style.arm);rz+=mix(style.armZ);lx+=mix(style.off);
 if(m.userData.style==='sword')lx=Math.min(lx,-.55*n.fight+swing);
 if(m.userData.style==='bow'){lx=-1.5*n.fight+swing*(1-n.fight);lz=.05;rx=n.fight*(-1.45+prep*.95-strike*.35)+rx*(1-n.fight);}
 if(stun){rx=.35+Math.sin(time*7)*.15;lx=.35-Math.sin(time*7)*.15;rz=-.35;lz=.35;}
 // Conjurando: ergue a espada de bolhas bem alto e aponta para onde a bolha vai.
 const conj=e.card?.bolha?.conjura,cast=e.cast>0&&conj?ease(clamp(1-e.cast/conj,0,1)):0;
 if(cast){rx=-1.5-cast*1.35;rz=-.2;lx=-.35;lz=.6;}
 // Presa: bate os braços dentro da bolha; caindo: braços para cima.
 if(trapped){rx=-2.3+kick*.45;lx=-2.3-kick*.45;rz=-.55;lz=.55;}
 if(falling){rx=-2.9;lx=-2.9;rz=-.3;lz=.3;}
 pose('rightArm',rx,0,rz,trapped||falling?14:fast);pose('leftArm',lx,0,lz,trapped||falling?14:fast);

 // Asas (morcego): batem sempre, mais rápido ao atacar.
 const flap=Math.sin(time*(attack>0||prep>0?26:17)+id)*.75;
 pose('leftWing',0,0,flap,40);pose('rightWing',0,0,-flap,40);

 // Bomba na mão some quando é lançada e volta enquanto ele se recupera.
 if(rig.prop){const s=attack>0?0:approach(rig.prop.scale.x,1,dt,6);rig.prop.scale.setScalar(Math.max(.001,s));}

 // Cabeça: balança no passo, inclina ao respirar, roda tonta no atordoamento.
 if(rig.head){
  if(stun)pose('head',Math.cos(time*9)*.18,0,Math.sin(time*9)*.28,20);
  else pose('head',Math.sin(phase*2)*.06*walk-hit*.35-prep*.1+strike*.12,Math.sin(time*.9+id)*.15*(1-walk)*(1-n.fight),breathe*.03,18);
 }

 // Corpo inteiro: giro do golpe, inclinação, avanço e quique do passo.
 const twist=mix(style.twist),lean=.1*walk+mix(style.lean)-hit*.3;
 m.rotation.y=n.angle+twist;
 if(stun){m.rotation.z=Math.sin(time*11)*.1;m.rotation.x=-.06;}
 else if(trapped){m.rotation.z=Math.sin(time*2.4+id)*.2;m.rotation.x=approach(m.rotation.x,-.12+Math.sin(time*1.7)*.08,dt,6);}
 else if(cast){m.rotation.z=approach(m.rotation.z,0,dt,10);m.rotation.x=approach(m.rotation.x,-.12*cast,dt,12);}
 else{m.rotation.z=approach(m.rotation.z,Math.sin(phase)*.06*walk+hit*Math.sin(time*40)*.05,dt,20);m.rotation.x=approach(m.rotation.x,lean,dt,fast);}
 const fx=Math.sin(n.angle),fz=Math.cos(n.angle),lunge=style.lunge*strike-.06*prep*(style.lunge>0?1:0);
 m.position.x+=fx*lunge;m.position.z+=fz*lunge;

 // Entrada: cai do céu, achata ao tocar o chão e quica de volta.
 const spawn=clamp(1-(e.deploy||0)/(e.card?.deploy||1),0,1);
 let sy=1+breathe*.025,sxz=1-breathe*.012,lift=Math.abs(wave)*.09*walk;
 if(spawn<1){
  if(spawn<.3){const k=spawn/.3;lift+=(1-k*k)*3.2;sy=1.15;sxz=.9;}
  else{const k=(spawn-.3)/.7,s=Math.exp(-5*k)*Math.cos(13*k);sy=1-.32*s;sxz=1+.22*s;}
 }
 // Golpe e dano esticam e achatam o corpo (squash & stretch).
 sy*=1-strike*.06+prep*.05-hit*.1;sxz*=1+strike*.05-prep*.03+hit*.08;
 if(e.air){lift+=Math.sin(time*5+id)*.12;}
 m.scale.set(n.baseScale.x*sxz,n.baseScale.y*sy,n.baseScale.z*sxz);
 m.position.y+=lift;
 return {prep,attack,hit};
}

// Morte: achata, tomba de lado e afunda encolhendo. Devolve true quando terminou.
export function animateDeath(n,dt){
 n.deathTime=(n.deathTime||0)+dt;const k=clamp(n.deathTime/.5,0,1),base=n.baseScale||n.model.scale;
 const pop=k<.2?Math.sin(k/.2*Math.PI):0,fall=ease(clamp((k-.12)/.6,0,1));
 n.deathSide||=n.model.id%2?1:-1;n.model.rotation.z=fall*1.45*n.deathSide;
 n.model.position.y-=dt*.7*fall;
 const shrink=1-ease(clamp((k-.55)/.45,0,1))*.65;
 n.model.scale.set(base.x*(1+pop*.25)*shrink,base.y*(1-pop*.3)*shrink,base.z*(1+pop*.25)*shrink);
 return k>=1;
}
