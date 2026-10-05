import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const solid = new T.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:.06,flatShading:true});
const crystal = new T.MeshStandardMaterial({vertexColors:true,roughness:.25,metalness:.2,transparent:true,opacity:.7,emissive:0x126f76,emissiveIntensity:.7});
const cache = new Map();
export const palette={stone:'#b1b6a5',stoneDark:'#657f80',gold:'#efc364',wood:'#795436',ally:'#28b8d9',foe:'#e86266',ink:'#232838',paper:'#f0e9da'};
export class Parts {
 constructor(){this.parts=[];}
 add(geo,color,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
  let g=geo.toNonIndexed();if(g!==geo)geo.dispose();
  const matrix=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),new T.Vector3(sx,sy,sz));g.applyMatrix4(matrix);
  const c=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}
  g.setAttribute('color',new T.BufferAttribute(a,3));this.parts.push(g);return this;
 }
 box(x,y,z,w,h,d,c,rx=0,ry=0,rz=0){return this.add(new T.BoxGeometry(1,1,1),c,x,y,z,w,h,d,rx,ry,rz);}
 ball(x,y,z,r,c,sx=1,sy=1,sz=1){return this.add(new T.SphereGeometry(1,10,7),c,x,y,z,r*sx,r*sy,r*sz);}
 cyl(x,y,z,rt,rb,h,c,n=8,rx=0,ry=0,rz=0){return this.add(new T.CylinderGeometry(rt,rb,h,n),c,x,y,z,1,1,1,rx,ry,rz);}
 cone(x,y,z,r,h,c,rx=0,ry=0,rz=0){return this.cyl(x,y,z,0,r,h,c,7,rx,ry,rz);}
 ring(x,y,z,r,t,c,rx=0,ry=0,rz=0){return this.add(new T.TorusGeometry(r,t,5,16),c,x,y,z,1,1,1,rx,ry,rz);}
 finish(material=solid){const g=mergeGeometries(this.parts,false);for(const p of this.parts)p.dispose();const m=new T.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;return m;}
}
function member(parent,name,x,y,z,p){const group=new T.Group();group.name=name;group.position.set(x,y,z);group.add(p.finish());parent.add(group);return group;}
function crown(p,x,y,z,r=.34){p.cyl(x,y,z,r,r,.17,palette.gold,8);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;p.cone(x+Math.sin(a)*r*.92,y+.22,z+Math.cos(a)*r*.92,.105,.34,palette.gold);}}
function face(p,{x=0,y=1.68,z=.12,r=.32,skin='#e5b491',eyes='#1d2939',nose=true}={}){
 p.ball(x,y,z,r,skin,1,1.03,.91);p.box(x-r*.4,y+r*.1,z+r*.83,r*.2,r*.18,.04,eyes);p.box(x+r*.4,y+r*.1,z+r*.83,r*.2,r*.18,.04,eyes);
 if(nose)p.ball(x,y-r*.12,z+r*.91,r*.19,skin,1,1,.8);
}
function bow(p,x=.05,y=-.1,z=.15,c='#b48e56'){p.ring(x,y,z,.34,.055,c,0,Math.PI/2);p.box(x,y,z,.018,.68,.018,'#e1d9ba');}
function sword(p,len=.85){p.box(.0,-.25,.08,.11,len,.045,'#d9e5e2',0,0,-.1);p.box(0,.16,.08,.35,.055,.09,palette.gold);p.box(0,.31,.08,.08,.26,.08,'#805838');}
function smallBomb(p,x=0,y=-.15,z=.22,r=.3){p.ball(x,y,z,r,'#292e39');p.cyl(x,y+r+.06,z,.025,.025,.16,'#a4854e',5);p.ball(x+.02,y+r+.17,z,.06,'#ffe486');}
function humanoid(art,team){
 const root=new T.Group(),C=palette[team],p=new Parts();
 let skin='#e6b193',shirt=C,pants='#394659',headY=1.7,bodyY=1.15,bodyW=.56,headR=.31,scale=1;
 if(art==='goblin'){skin='#7bb654';shirt='#b58147';scale=.82;headR=.36;}
 if(['skeleton','bomber','kamikaze'].includes(art)){skin='#ece3c4';shirt='#d9d1b6';bodyW=.34;scale=.82;}
 if(art==='giant'){skin='#e0a273';shirt='#9c663d';bodyW=.92;headR=.4;headY=1.92;scale=1.38;}
 if(art==='colossus'){skin='#52617e';shirt='#34445e';bodyW=.9;headR=.39;scale=1.42;}
 if(art==='bombking'){shirt=C;bodyW=.84;headR=.37;headY=1.82;scale=1.17;}
 if(art==='bwchamp'){skin=palette.paper;shirt=palette.ink;pants='#161e2b';bodyW=.4;headR=.32;headY=1.95;scale=1.1;}
 if(art==='hologram'){skin='#b9ffff';shirt='#70ecec';pants='#3ed2d9';scale=.98;}
 const gang=['bpingo','bsirene','bogiva','bcoveiro'].includes(art);
 if(gang){shirt={bpingo:'#e69d44',bsirene:'#55cadb',bogiva:'#e86165',bcoveiro:'#9378bf'}[art];bodyW=.46;headR=.28;scale=.77;}
 if(['mage','hologram'].includes(art)){p.cyl(0,.96,0,.31,.51,1.25,shirt);p.box(0,.66,.31,.095,.6,.07,palette.gold);}
 else if(art==='skeleton'||art==='bomber'){
  p.cyl(0,1.15,0,.07,.07,.68,skin,6);for(let i=0;i<3;i++)p.box(0,1.02+i*.13,0,.39,.075,.18,skin);
 }else{
  p.box(0,bodyY,0,bodyW,.73,.4,shirt);p.box(0,.87,.01,bodyW+.025,.105,.425,'#4b3c33');p.box(.0,.88,.24,.16,.13,.055,palette.gold);
 }
 face(p,{y:headY,r:headR,skin});
 if(art==='knight'){
  p.ball(0,headY+.15,-.01,.36,'#9fb9c2',1,.8,1);p.box(0,headY-.03,.405,.56,.17,.055,'#697d90');p.box(0,headY+.38,-.06,.095,.4,.12,C);p.box(0,headY+.46,-.14,.12,.19,.22,C);
 }
 if(art==='archer'){
  p.ball(0,headY+.10,-.12,.34,'#bd6a9b');p.box(0,headY-.2,-.2,.52,.55,.22,'#bd6a9b');p.box(0,headY+.27,.08,.53,.13,.31,'#b76190');p.cyl(.17,1.17,-.33,.15,.13,.62,'#806349',8,0,0,-.2);
  for(let i=0;i<3;i++)p.cyl(.08+i*.08,1.66,-.33,.019,.019,.42,'#d1c6a0',5);
 }
 if(art==='goblin'){
  p.cone(-.39,headY,0,.19,.38,skin,0,0,Math.PI/2);p.cone(.39,headY,0,.19,.38,skin,0,0,-Math.PI/2);p.cone(0,headY-.05,.42,.12,.25,skin,Math.PI/2);p.box(0,headY-.19,.34,.28,.075,.035,'#f2ebc6');
 }
 if(['skeleton','bomber'].includes(art)){
  p.box(-.13,headY+.03,.37,.15,.16,.035,'#353943');p.box(.13,headY+.03,.37,.15,.16,.035,'#353943');p.box(0,headY-.22,.25,.3,.1,.22,skin);
 }
 if(art==='bomber'||gang){p.ball(0,headY+.12,-.08,headR*1.15,C,1,.72,1.1);p.box(0,headY+.06,.37,.54,.12,.04,'#735542');}
 if(art==='giant'){p.box(0,headY-.17,.37,.5,.25,.18,'#b86930');p.ball(0,headY+.22,-.02,.39,'#c7742e',1,.65,.98);}
 if(art==='colossus'){
  p.box(0,headY,.0,.74,.69,.59,'#4b5a75');p.box(0,headY+.04,.325,.42,.095,.04,'#c889ff');p.cone(-.37,headY+.32,0,.16,.52,'#d3bd82',0,0,.35);p.cone(.37,headY+.32,0,.16,.52,'#d3bd82',0,0,-.35);
 }
 if(art==='mage'){p.cone(0,2.17,-.05,.42,.84,C);p.ring(0,1.79,0,.37,.07,palette.gold,Math.PI/2);p.cone(0,1.47,.29,.15,.38,'#d0d8d1',Math.PI);}
 if(art==='bombking'){crown(p,0,2.21,0,.39);p.box(0,headY-.18,.39,.37,.09,.04,'#50352d');p.box(0,1.48,-.3,.69,.74,.13,C);}
 if(art==='bwchamp'){
  p.box(-.12,1.22,.02,.23,.96,.4,palette.paper);p.box(.12,1.22,.02,.23,.96,.4,palette.ink);p.box(0,1.97,.14,.56,.57,.35,palette.paper);p.box(-.12,1.97,.331,.1,.15,.024,palette.ink);p.box(.12,1.97,.331,.1,.15,.024,'#8bbac4');p.box(0,2.27,-.01,.77,.08,.52,palette.ink);p.cone(0,2.46,-.02,.3,.42,C);p.ball(0,2.72,-.02,.065,palette.gold);
 }
 if(art==='kamikaze'){smallBomb(p,0,1.1,.27,.35);}
 if(art==='hologram'){p.ring(0,2.16,0,.42,.035,'#80ffff',Math.PI/2);p.cone(0,1.64,.34,.16,.35,'#85ffff',Math.PI);}
 root.add(p.finish(art==='hologram'?crystal:solid));
 const thin=['skeleton','bomber'].includes(art),legWidth=thin?.09:.18,legSkin=thin?skin:pants;
 for(const [side,x] of [['left',-.18],['right',.18]]){
  const leg=new Parts().box(0,-.26,0,legWidth,.52,.21,legSkin).box(0,-.56,.08,legWidth+.1,.16,.37,thin?skin:'#303a46');
  member(root,side+'Leg',x,.67,0,leg);
 }
 for(const [side,x] of [['left',-(bodyW/2+.14)],['right',bodyW/2+.14]]){
  const arm=new Parts().box(0,-.18,0,thin?.09:.19,.42,.2,thin?skin:shirt).ball(0,-.42,.05,thin?.07:.13,skin);
  if(art==='knight'&&side==='right'){sword(arm);}
  if(art==='knight'&&side==='left'){arm.box(0,-.33,.22,.39,.58,.09,C);arm.box(0,-.32,.28,.09,.35,.035,palette.gold);}
  if(['goblin','skeleton'].includes(art)&&side==='right')sword(arm,.5);
  if(art==='archer'&&side==='left')bow(arm,0,-.26,.18);
  if(['bomber','bombking','bpingo','bsirene','bogiva','bcoveiro'].includes(art)&&side==='right')smallBomb(arm,0,-.27,.29,art==='bombking'?.34:.27);
  if(art==='colossus'&&side==='right'){arm.cyl(0,-.26,.23,.065,.065,1.0,'#9e8265');arm.box(0,-.77,.22,.59,.35,.35,'#a9b9c1');}
  if(['mage','hologram'].includes(art)&&side==='left'){arm.cyl(0,-.23,.15,.045,.045,1.4,'#786345');arm.ball(0,.49,.15,.21,art==='mage'?'#82d7f5':'#b2ffff');}
  if(art==='bwchamp'){
   if(side==='right'){arm.cyl(0,-.23,.19,.07,.07,1.8,palette.ink,6);arm.cone(0,-1.20,.19,.07,.21,palette.gold,Math.PI);arm.box(0,.36,.21,.10,.3,.13,palette.paper);}
   else{arm.box(0,-.32,.24,.47,.63,.025,palette.paper);for(let i=0;i<3;i++)arm.box(0,-.19-i*.12,.263,.30,.024,.011,'#7f8f97');}
  }
  member(root,side+'Arm',x,1.48,0,arm);
 }
 root.scale.setScalar(scale);root.userData={height:(headY+.65)*scale,rig:true};return root;
}
function creature(art,team){
 const root=new T.Group(),p=new Parts(),c=palette[team];
 if(art==='bat'||art==='drake'){
  const dragon=art==='drake',body=dragon?'#63a482':'#737cb8';
  p.ball(0,.25,0,dragon?.5:.24,body,dragon?1:.8,1,dragon?1.5:1);p.ball(0,.5,.58,dragon?.36:.25,body);p.box(0,.46,.94,.4,.2,.3,body);p.box(-.19,.58,.85,.095,.10,.035,'#f6dc8b');p.box(.19,.58,.85,.095,.1,.035,'#f6dc8b');
  p.cone(-.2,.88,.56,.09,.3,'#dfc996');p.cone(.2,.88,.56,.09,.3,'#dfc996');p.cone(0,.11,-.94,.17,1.0,body,Math.PI/2);p.box(0,.35,.05,.28,.20,.5,c);
  root.add(p.finish());
  for(const s of [-1,1]){const wing=new Parts();wing.cone(s*.61,0,-.18,.55,1.18,body,0,0,-s*Math.PI/2);wing.box(s*.53,0,-.08,.97,.07,.10,c,0,-s*.25,0);member(root,s<0?'leftWing':'rightWing',s*.2,.45,-.1,wing);}
  if(!dragon)root.scale.setScalar(.67);root.userData.height=1.0;
 }else if(art==='cannon'||art==='coil'){
  p.cyl(0,.19,0,.64,.72,.38,'#738990');p.cyl(0,.46,0,.45,.51,.27,'#bac1b4');
  if(art==='cannon'){p.ball(0,.78,0,.38,'#445968');p.cyl(0,.86,.41,.24,.31,1.1,'#465f72',10,Math.PI/2);p.cyl(0,.86,.975,.17,.17,.015,'#152536',10,Math.PI/2);p.ring(0,.86,.79,.275,.05,palette.gold);}
  else{p.cyl(0,.99,0,.18,.29,1.12,c);for(let i=0;i<4;i++)p.ring(0,.72+i*.19,0,.31-i*.03,.06,'#d2bf83',Math.PI/2);p.ball(0,1.65,0,.3,'#b6f7ff');}
  root.add(p.finish());root.userData.height=2;
 }else if(art==='ram'){
  p.cyl(0,.88,0,.36,.36,1.7,'#967453',8,Math.PI/2);p.cyl(0,.88,.87,.4,.4,.18,'#aabfbd',8,Math.PI/2);p.box(0,.45,0,1.1,.18,1.3,'#615a4a');
  for(const x of [-.52,.52])for(const z of [-.48,.48])p.cyl(x,.3,z,.31,.31,.14,'#425263',10,0,0,Math.PI/2);
  p.box(0,1.15,-.55,.49,.7,.34,c);face(p,{y:1.69,z:-.54});root.add(p.finish());root.userData.height=2.1;
 }else if(art==='dollaltar'){
  p.cyl(0,.14,0,.7,.78,.28,'#6d718d');p.cyl(0,.45,0,.45,.57,.39,'#968fb7');p.ring(0,.63,0,.53,.06,'#79f5ff',Math.PI/2);
  p.cone(0,1.3,0,.37,.86,'#ef8bc7');face(p,{y:1.94,r:.30,skin:'#c8f5e7'});p.ball(0,2.12,-.03,.32,'#c587e5',1,.7,1);p.box(-.47,1.64,0,.54,.13,.13,'#acdfef',0,0,-.35);p.box(.47,1.64,0,.54,.13,.13,'#acdfef',0,0,.35);root.add(p.finish());root.userData.height=2.6;
 }
 return root;
}
export function unitModel(art,team){
 const key=art+team;
 if(!cache.has(key)){const type=['bat','drake','cannon','coil','ram','dollaltar'].includes(art)?creature:humanoid;cache.set(key,type(art,team));}
 return cache.get(key).clone(true);
}
export function towerModel(team,king=false){
 const root=new T.Group(),p=new Parts(),c=palette[team],r=king?1.1:.8,h=king?1.9:1.6;
 p.box(0,.12,0,r*2.65,.24,r*2.5,'#89765a');p.box(0,h/2+.2,0,r*2,h,r*1.85,'#f4b737');
 p.box(0,.35,0,r*2.17,.22,r*2.02,'#c48123');p.box(0,h+.23,0,r*2.35,.28,r*2.20,'#ffe076');
 for(const x of [-1,1])for(const z of [-1,1]){p.box(x*r,h+.46,z*r*.9,.42,.52,.43,'#f9c642');p.box(x*r,.94,z*r*.88,.30,1.4,.33,'#dfa42e');}
 for(const z of [-1,1]){p.box(0,h*.62,z*(r+.018),r*.8,h*.74,.07,c);p.box(0,h*.60,z*(r+.07),.14,.48,.04,'#ffd76c');p.box(0,h*.74,z*(r+.09),.37,.12,.025,'#ffe685');}
 p.box(0,.5,r*.94,.40,.65,.05,'#665236');p.box(0,.48,r*.985,.25,.54,.04,c);root.add(p.finish());
 const t=new Parts();t.cyl(0,0,0,r*.6,r*.68,.28,c,8);t.ball(0,.24,0,r*.40,'#34495a');t.cyl(0,.25,.55,.19,.25,.91,'#48687f',10,Math.PI/2);t.cyl(0,.25,1.015,.14,.14,.017,'#152337',10,Math.PI/2);t.ring(0,.25,.98,.20,.045,'#fbd351');
 if(king){t.box(0,.40,-.4,.64,.78,.47,c);face(t,{y:.93,z:-.35,r:.30});t.box(0,.82,-.07,.42,.09,.06,'#402f23');crown(t,0,1.28,-.35,.33);}
 member(root,'turret',0,h+.44,0,t);root.userData.height=h+(king?1.85:1.0);return root;
}
export function rubbleModel(king){const p=new Parts(),r=king?1.2:.95;p.cyl(0,.11,0,r,r+.1,.22,'#5b7579',8);for(let i=0;i<11;i++){const a=i*2.399;p.box(Math.cos(a)*r*.7,.25+(i%3)*.12,Math.sin(a)*r*.7,.35+(i%2)*.15,.28+(i%3)*.18,.37,i%2?'#9caaab':'#788d93',i*.2,i*.8,i*.12);}return p.finish();}
