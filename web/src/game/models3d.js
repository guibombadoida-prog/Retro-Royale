import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* ── Visual cartoon: material "toon" em faixas, brilho de borda e contorno escuro ───────────────
   Todas as peças usam cor por vértice (o modo sem WebGL lê a mesma cor) e são unidas numa malha por
   parte do rig, então cada tropa custa poucas chamadas de desenho mesmo com dezenas em campo. */
export const palette={
 ally:'#2ea2ff',allyDark:'#1b63c9',foe:'#ff4766',foeDark:'#b8223f',
 gold:'#ffc93c',goldDark:'#d18b1c',steel:'#d3dde8',steelDark:'#8796a8',wood:'#a8693a',woodDark:'#6e4224',
 stone:'#d8d0bf',stoneDark:'#a49a87',skin:'#ffcf9f',ink:'#251d3a',white:'#ffffff',
 grass:'#8bd14e',grassDark:'#7cc244'
};
const team=(t,dark=false)=>palette[t+(dark?'Dark':'')]||palette.ally;

// Três tons com borda dura: sombra, meio-tom e luz.
const ramp=(()=>{const t=new T.DataTexture(new Uint8Array([96,168,255]),3,1,T.RedFormat);t.minFilter=t.magFilter=T.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;})();
function toonMaterial(rim=.32){
 const m=new T.MeshToonMaterial({vertexColors:true,gradientMap:ramp});
 m.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>',
  `float rrRim=pow(1.0-clamp(dot(normalize(normal),normalize(vViewPosition)),0.0,1.0),3.0);outgoingLight+=diffuseColor.rgb*rrRim*${rim.toFixed(2)};\n#include <opaque_fragment>`);};
 m.customProgramCacheKey=()=>'rr-toon-'+rim;return m;
}
export const materials={
 toon:toonMaterial(),
 // Peças que brilham sozinhas (pavio aceso, cristais, olhos): não recebem sombra nem luz.
 glow:new T.MeshBasicMaterial({vertexColors:true,toneMapped:false}),
 // Contorno "inverted hull": a mesma malha, inflada pela normal e desenhada só por dentro.
 outline:(()=>{const m=new T.MeshBasicMaterial({color:'#221a33',side:T.BackSide});
  m.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','vec3 transformed=position+normal*0.032;');};
  m.customProgramCacheKey=()=>'rr-outline';return m;})()
};

// Sem WebGL a CPU desenha cada triângulo: modelos com menos lados e sem contorno.
let LOW=false;
const cache=new Map(),projCache=new Map();
export function setLowDetail(v){if(LOW!==!!v){LOW=!!v;cache.clear();projCache.clear();}}
const seg=(n,min=4)=>LOW?Math.max(min,Math.round(n/2)):n;
// Detalhe automático pelo tamanho: peça pequena (olho, mão, rebite) usa menos lados.
const bySize=(size,min,max,k)=>Math.max(min,Math.min(max,Math.round(min+size*k)));
const tmpM=new T.Matrix4(),tmpQ=new T.Quaternion(),tmpE=new T.Euler(),tmpV=new T.Vector3(),tmpS=new T.Vector3();
export class Parts {
 constructor(){this.toon=[];this.glow=[];this.line=[];this.frame=new T.Matrix4();}
 // Peças dentro de `fn` ficam no referencial (posição + rotação) indicado, como um "grupo" já unido.
 at(x,y,z,rx,ry,rz,fn){const saved=this.frame.clone();this.frame.multiply(tmpM.compose(tmpV.set(x,y,z),tmpQ.setFromEuler(tmpE.set(rx,ry,rz)),tmpS.set(1,1,1)));fn(this);this.frame.copy(saved);return this;}
 add(geo,color,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,{glow=false,outline=true}={}){
  let g=geo.index?geo.toNonIndexed():geo;if(g!==geo)geo.dispose();g.deleteAttribute('uv');if(!g.attributes.normal)g.computeVertexNormals();
  g.applyMatrix4(this.frame.clone().multiply(tmpM.compose(tmpV.set(x,y,z),tmpQ.setFromEuler(tmpE.set(rx,ry,rz)),tmpS.set(sx,sy,sz))));
  const c=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}
  g.setAttribute('color',new T.BufferAttribute(a,3));
  (glow?this.glow:this.toon).push(g);if(!glow&&outline)this.line.push(g);return this;
 }
 box(x,y,z,w,h,d,c,rx=0,ry=0,rz=0,o){const r=Math.min(w,h,d)*.28;return this.add(LOW||Math.min(w,h,d)<.07?new T.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,1,r),c,x,y,z,1,1,1,rx,ry,rz,o);}
 sharpBox(x,y,z,w,h,d,c,rx=0,ry=0,rz=0,o){return this.add(new T.BoxGeometry(w,h,d),c,x,y,z,1,1,1,rx,ry,rz,{outline:false,...o});}
 ball(x,y,z,r,c,sx=1,sy=1,sz=1,o,segs){const n=seg(segs||bySize(r*Math.max(sx,sy,sz),6,14,22));return this.add(new T.SphereGeometry(r,n,Math.max(4,n*.75|0)),c,x,y,z,sx,sy,sz,0,0,0,o);}
 dome(x,y,z,r,c,part=.55,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,o){const n=seg(bySize(r*Math.max(sx,sy,sz),6,14,22));return this.add(new T.SphereGeometry(r,n,Math.max(4,n*.6|0),0,Math.PI*2,0,Math.PI*part),c,x,y,z,sx,sy,sz,rx,ry,rz,o);}
 capsule(x,y,z,r,len,c,rx=0,ry=0,rz=0,o){return this.add(new T.CapsuleGeometry(r,len,seg(r<.06?2:3,2),seg(bySize(r,5,8,30),5)),c,x,y,z,1,1,1,rx,ry,rz,o);}
 cyl(x,y,z,rt,rb,h,c,n,rx=0,ry=0,rz=0,o){return this.add(new T.CylinderGeometry(rt,rb,h,seg(n||bySize(Math.max(rt,rb),6,18,20),5)),c,x,y,z,1,1,1,rx,ry,rz,o);}
 cone(x,y,z,r,h,c,rx=0,ry=0,rz=0,o,n=12){return this.add(new T.ConeGeometry(r,h,seg(n,4)),c,x,y,z,1,1,1,rx,ry,rz,o);}
 torus(x,y,z,R,t,c,arc=Math.PI*2,rx=0,ry=0,rz=0,o){return this.add(new T.TorusGeometry(R,t,seg(t<.04?4:5,3),seg(bySize(arc*R,6,26,9),5),arc),c,x,y,z,1,1,1,rx,ry,rz,o);}
 ring(x,y,z,r,t,c,rx=0,ry=0,rz=0,o){return this.torus(x,y,z,r,t,c,Math.PI*2,rx,ry,rz,o);}
 lathe(points,c,x=0,y=0,z=0,n=16,rx=0,ry=0,rz=0,o){return this.add(new T.LatheGeometry(points.map(([a,b])=>new T.Vector2(a,b)),seg(n,5)),c,x,y,z,1,1,1,rx,ry,rz,o);}
 shape(points,depth,c,x=0,y=0,z=0,rx=0,ry=0,rz=0,o){
  const s=new T.Shape(points.map(([a,b])=>new T.Vector2(a,b)));
  const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:!LOW,bevelThickness:depth*.35,bevelSize:depth*.35,bevelSegments:1,curveSegments:4});g.translate(0,0,-depth/2);
  return this.add(g,c,x,y,z,1,1,1,rx,ry,rz,o);
 }
 finish(){
  const merge=list=>{const g=mergeGeometries(list,false);g.computeBoundingSphere();return g;};
  const out=new T.Group();
  if(this.toon.length){const m=new T.Mesh(merge(this.toon),materials.toon);m.castShadow=true;m.receiveShadow=true;out.add(m);}
  if(this.line.length&&!LOW){const o=new T.Mesh(merge(this.line),materials.outline);o.userData.outline=true;out.add(o);}
  if(this.glow.length){out.add(new T.Mesh(merge(this.glow),materials.glow));}
  for(const g of new Set([...this.toon,...this.glow]))g.dispose();
  return out.children.length===1?out.children[0]:out;
 }
}
function member(parent,name,x,y,z,parts){const group=new T.Group();group.name=name;group.position.set(x,y,z);group.add(parts.finish());parent.add(group);return group;}

/* ── Rig com ossos: cada tropa (e torre) vira uma malha só por material ──────────────────────
   As peças continuam nos mesmos grupos do rig (leftLeg, head, prop, turret...), que passam a ser os
   ossos de uma SkinnedMesh. O animation.js mexe nos mesmos grupos, mas o celular desenha a tropa
   inteira em 2 ou 3 chamadas (toon, contorno, brilho) em vez de uma por peça. Sem WebGL (LOW) fica
   como antes, porque o renderizador por CPU não anima ossos. */
const RIG_BONES=['leftLeg','rightLeg','leftArm','rightArm','leftWing','rightWing','head','prop','turret'];
const skins=new WeakMap(),toRoot=new T.Matrix4();
function bakeRig(root){
 if(LOW)return root;
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert();
 const bones=[root];root.traverse(o=>{if(o!==root&&RIG_BONES.includes(o.name))bones.push(o);});
 const lists={toon:[],outline:[],glow:[]},meshes=[];
 root.traverse(o=>{
  if(!o.isMesh)return;meshes.push(o);
  let b=o.parent,bone=-1;while(b&&(bone=bones.indexOf(b))<0)b=b.parent;
  const g=o.geometry.clone();g.applyMatrix4(toRoot.multiplyMatrices(inverse,o.matrixWorld));
  const n=g.attributes.position.count,index=new Uint16Array(n*4),weight=new Float32Array(n*4);
  for(let i=0;i<n;i++){index[i*4]=Math.max(0,bone);weight[i*4]=1;}
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(index,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weight,4));
  lists[o.userData.outline?'outline':o.material===materials.glow?'glow':'toon'].push(g);
 });
 for(const o of meshes){o.parent.remove(o);o.geometry.dispose();}
 const skeleton=new T.Skeleton(bones);
 for(const [kind,list] of Object.entries(lists)){
  if(!list.length)continue;
  const m=new T.SkinnedMesh(mergeGeometries(list,false),materials[kind]);for(const g of list)g.dispose();
  // Sempre visível: a esfera de recorte de uma malha com ossos não acompanha a pose.
  m.frustumCulled=false;if(kind==='toon'){m.castShadow=true;m.receiveShadow=true;}if(kind==='outline')m.userData.outline=true;
  root.add(m);m.bind(skeleton);
 }
 skins.set(root,{names:bones.map((b,i)=>i?b.name:''),inverses:skeleton.boneInverses});
 return root;
}
// Cópia de um modelo do cache com o próprio esqueleto (clone() deixaria os ossos do original).
function cloneModel(source){
 const copy=source.clone(true),skin=skins.get(source);if(!skin)return copy;
 const skeleton=new T.Skeleton(skin.names.map(n=>n?copy.getObjectByName(n):copy),skin.inverses);
 copy.traverse(o=>{if(o.isSkinnedMesh)o.bind(skeleton,o.bindMatrix);});
 return copy;
}
// Libera a textura de ossos de um modelo que saiu de cena (a geometria é do cache e continua).
export function releaseModel(model){model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});}

/* ── Peças de rosto e acessórios ───────────────────────────────────────────────────────────── */
// Olho cartoon: oval escuro com brilho branco. (cx,cy,cz) e R são o centro e o raio da cabeça.
function eyes(p,cx,cy,cz,R,{spread=.37,lift=.05,size=.15,color=palette.ink,brow=null,angry=0,lash=false}={}){
 for(const s of [-1,1]){
  tmpV.set(s*spread,lift,1).normalize().multiplyScalar(R*.93);const x=cx+tmpV.x,y=cy+tmpV.y,z=cz+tmpV.z;
  p.ball(x,y,z,R*size,color,.78,1.12,.55,{outline:false},12);
  p.ball(x-R*.035,y+R*.07,z+R*.06,R*size*.34,palette.white,1,1,1,{outline:false},8);
  if(brow)p.box(x,y+R*size*1.75,z+R*.02,R*.32,R*.075,R*.08,brow,0,0,s*angry,{outline:false});
  if(lash)p.box(x+s*R*.13,y+R*.12,z,R*.12,R*.04,R*.04,palette.ink,0,0,s*.5,{outline:false});
 }
}
function smile(p,cx,cy,cz,R,{w=.15,color='#7a2c2c',open=false,teeth=false}={}){
 const y=cy-R*.38,z=cz+R*.86;
 if(open){p.ball(cx,y,z,R*w,color,1.3,.75,.35,{outline:false},10);if(teeth)for(const s of [-1,1])p.cone(cx+s*R*.09,y+R*.06,z+R*.06,R*.05,R*.1,palette.white,Math.PI,0,0,{outline:false},6);}
 else p.torus(cx,y,z,R*w,R*.025,color,Math.PI,0,0,Math.PI,{outline:false});
}
function crown(p,x,y,z,r=.3){
 p.cyl(x,y,z,r,r*1.04,r*.42,palette.gold,18);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;p.cone(x+Math.sin(a)*r*.86,y+r*.42,z+Math.cos(a)*r*.86,r*.2,r*.55,palette.gold,0,0,0,undefined,8);p.ball(x+Math.sin(a)*r*.86,y+r*.72,z+Math.cos(a)*r*.86,r*.09,palette.gold);}
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.5;p.ball(x+Math.sin(a)*r*1.0,y+r*.02,z+Math.cos(a)*r*1.0,r*.11,i===0?'#ff4b6e':'#52c7ff',1,1,.6,{outline:false},8);}
}
function bomb(p,x,y,z,r){
 p.ball(x,y,z,r,'#2e3446');p.ball(x-r*.35,y+r*.38,z+r*.55,r*.22,'#6d7a96',1,1,1,{outline:false},8);
 p.cyl(x,y+r*1.02,z,r*.26,r*.32,r*.3,'#596276',10);p.capsule(x+r*.12,y+r*1.32,z,r*.07,r*.35,'#c9a26b',0,0,-.5,{outline:false});
 p.ball(x+r*.32,y+r*1.62,z,r*.2,'#ffe066',1,1,1,{glow:true},8);p.ball(x+r*.32,y+r*1.62,z,r*.11,'#ffffff',1,1,1,{glow:true},6);
}

/* ── Humanoide chibi: pernas, corpo, cabeça grande e braços com pivô nas juntas ──────────────
   O rig expõe leftLeg/rightLeg/leftArm/rightArm (pivô no quadril/ombro) e head (pivô no pescoço). */
function humanoid(spec){
 const {skin=palette.skin,shirt,pants='#3b4766',boots='#5a3b28',headR=.38,bodyR=.27,bodyScale=[1,1.08,.9],legR=.095,armR=.075,handR=.095,hip=.42,legX=.13}=spec;
 const root=new T.Group(),body=new Parts();
 const bodyY=hip+.24,shoulderY=bodyY+.2,neckY=bodyY+bodyR*bodyScale[1]-.02;
 body.ball(0,bodyY,0,bodyR,shirt,...bodyScale);
 spec.body?.(body,{bodyY,bodyR,shoulderY,neckY});
 root.add(body.finish());
 const head=new Parts();const hc=[0,headR*.86,0];
 head.ball(...hc,headR,skin);
 spec.head?.(head,{hc,R:headR});
 member(root,'head',0,neckY,0,head);
 for(const [side,s] of [['left',-1],['right',1]]){
  const leg=new Parts();leg.capsule(0,-.15,0,legR,.16,pants);leg.ball(0,-.33,.045,legR*1.32,boots,1,.66,1.38);
  spec.leg?.(leg,s);member(root,side+'Leg',s*legX,hip,0,leg);
  const arm=new Parts();arm.capsule(0,-.13,0,armR,.15,spec.sleeve||shirt);arm.ball(0,-.29,0,handR,spec.hand||skin);
  spec.arm?.(arm,s);const group=member(root,side+'Arm',s*(bodyR+.03),shoulderY,0,arm);
  if(spec.prop&&s>0){const prop=new Parts();spec.prop(prop);member(group,'prop',0,-.36,.05,prop);}
 }
 const scale=spec.scale||1;root.scale.setScalar(scale);root.userData={height:(neckY+headR*1.9+(spec.extraHeight||0))*scale,rig:true,style:spec.style};
 return root;
}

const builders={
 knight(t){
  const C=team(t),D=team(t,true);
  return humanoid({style:'sword',shirt:palette.steel,sleeve:palette.steelDark,hand:'#7b4a2b',pants:palette.steelDark,boots:'#4a3a33',
   body(p,{bodyY,bodyR}){
    p.cyl(0,bodyY-.17,0,bodyR*.92,bodyR*1.12,.22,C,18);p.cyl(0,bodyY-.17,0,bodyR*.95,bodyR*1.15,.06,palette.gold,18,0,0,0,{outline:false});
    p.ring(0,bodyY-.04,0,bodyR*.97,.035,'#6b4426',Math.PI/2);p.box(0,bodyY-.04,bodyR*.92,.11,.09,.05,palette.gold);
    p.box(0,bodyY+.08,bodyR*.86,.1,.2,.06,C);
    p.at(0,bodyY+.12,-bodyR*.78,.18,0,0,q=>q.box(0,-.18,0,.5,.5,.06,D));
   },
   head(p,{hc,R}){
    const [x,y,z]=hc;
    p.dome(x,y+R*.04,z,R*1.07,palette.steel,.5);p.ring(x,y+R*.05,z,R*1.04,R*.07,palette.steelDark,Math.PI/2);
    p.box(x,y+R*.42,z+R*.98,R*.14,R*.5,R*.12,palette.steelDark);
    eyes(p,x,y-R*.12,z,R,{brow:'#5a3a22',angry:.18,spread:.4,lift:.02});
    for(const s of [-1,1])p.ball(x+s*R*.2,y-R*.42,z+R*.84,R*.2,'#7a4a2a',1.3,.55,.6);
    p.ball(x,y-R*.25,z+R*.95,R*.13,'#ffb98a',1,1,1,{outline:false},10);
    for(let i=0;i<4;i++)p.ball(x,y+R*(1.08+i*.06),z-R*(i*.28-.1),R*(.26-i*.025),C,1,1,1.3);
   },
   arm(p,s){
    p.ball(0,-.02,0,.13,palette.steel,1.05,.8,1.05);
    if(s>0)p.at(0,-.3,.02,1.15,0,0,q=>{q.capsule(0,.05,0,.035,.12,palette.woodDark);q.box(0,.15,0,.25,.06,.08,palette.gold);
     q.shape([[-.055,0],[.055,0],[.045,.52],[0,.62],[-.045,.52]],.03,'#eef4fa',0,.18,0);q.ball(0,-.05,0,.05,palette.gold);});
    else p.at(-.06,-.27,.12,0,-.25,0,q=>{q.cyl(0,0,0,.27,.27,.07,C,22,Math.PI/2);q.ring(0,0,.0,.27,.035,palette.steelDark);
     q.ball(0,0,.045,.08,palette.gold,1,1,.5);q.box(0,0,.04,.05,.36,.02,palette.gold,0,0,0,{outline:false});q.box(0,0,.04,.36,.05,.02,palette.gold,0,0,0,{outline:false});});
   }
  });
 },
 archer(t){
  const C=team(t),D=team(t,true);
  return humanoid({style:'bow',shirt:'#3fa45c',sleeve:'#3fa45c',pants:'#7a5133',boots:'#5b3a24',scale:.95,
   body(p,{bodyY,bodyR}){
    p.cyl(0,bodyY-.16,0,bodyR*.95,bodyR*1.25,.24,'#3a8f52',18);p.ring(0,bodyY-.05,0,bodyR*.97,.03,'#6e4224',Math.PI/2);
    p.at(0,bodyY+.18,0,0,0,0,q=>q.torus(0,0,0,bodyR*.7,.06,C,Math.PI*2,Math.PI/2));
    p.at(.06,bodyY+.08,-bodyR*.9,0,0,-.35,q=>{q.cyl(0,0,0,.075,.065,.42,palette.wood,12);for(let i=0;i<3;i++){q.capsule(-.03+i*.03,.26,0,.012,.14,'#e8dcc0',0,0,0,{outline:false});q.cone(-.03+i*.03,.38,0,.035,.07,i===1?C:palette.white,0,0,0,{outline:false},6);}});
    p.at(0,bodyY+.05,-bodyR*.75,.12,0,0,q=>q.box(0,-.12,0,.42,.42,.05,D));
   },
   head(p,{hc,R}){
    const [x,y,z]=hc;
    p.dome(x,y+R*.02,z-R*.05,R*1.1,C,.55,1,1,1,-.6);p.ball(x,y-R*.55,z-R*.5,R*.5,D,1.2,.7,.9);
    for(let i=-2;i<=2;i++)p.ball(x+i*R*.22,y+R*.55,z+R*.72,R*.2,'#ff8a3d',1,.8,.7,{outline:false},10);
    eyes(p,x,y-R*.1,z,R,{lash:true,size:.16});smile(p,x,y,z,R,{w:.12});
    for(const s of [-1,1])p.ball(x+s*R*.55,y-R*.28,z+R*.72,R*.12,'#ff9e9e',1,.6,.4,{outline:false},8);
   },
   arm(p,s){
    if(s<0)p.at(0,.06,0,0,0,0,q=>{q.torus(0,0,0,.36,.028,palette.wood,Math.PI*1.15,0,Math.PI/2,Math.PI*.925);
     for(const z of [-.35,.35])q.ball(0,.084,z,.04,palette.gold);q.capsule(0,.084,0,.007,.68,'#f4ecd8',Math.PI/2,0,0,{outline:false});});
   }
  });
 },
 goblin(t){
  const C=team(t),G='#7fcf49',GD='#5ea832';
  return humanoid({style:'stab',skin:G,shirt:G,pants:'#7a5133',boots:GD,headR:.4,bodyR:.23,scale:.8,hand:G,
   body(p,{bodyY,bodyR}){
    p.cyl(0,bodyY-.12,0,bodyR*.9,bodyR*1.2,.2,C,14);p.ring(0,bodyY-.03,0,bodyR*.95,.03,'#5b3a24',Math.PI/2);
    p.at(0,bodyY+.05,0,0,0,.6,q=>q.torus(0,0,0,bodyR*1.0,.025,'#5b3a24',Math.PI*2,Math.PI/2));
   },
   head(p,{hc,R}){
    const [x,y,z]=hc;
    for(const s of [-1,1]){p.cone(x+s*R*1.05,y+R*.2,z-R*.05,R*.32,R*.95,G,0,0,-s*1.25);p.cone(x+s*R*1.0,y+R*.2,z,R*.17,R*.6,'#ff9e8a',0,0,-s*1.25,{outline:false},8);}
    p.ball(x,y-R*.08,z+R*.98,R*.22,GD,1,.85,1.25);
    eyes(p,x,y+R*.05,z,R,{color:'#2a2010',brow:'#2f5a1a',angry:.42,spread:.42,size:.17});
    smile(p,x,y-R*.02,z,R,{open:true,w:.2,teeth:true,color:'#3a1414'});
    p.torus(x,y+R*.42,z,R*.92,R*.11,C,Math.PI*2,Math.PI/2.3);
   },
   arm(p,s){if(s>0)p.at(0,-.3,.03,1.25,0,0,q=>{q.capsule(0,.03,0,.03,.07,palette.woodDark);q.box(0,.1,0,.14,.04,.06,'#9aa3ad');q.shape([[-.04,0],[.04,0],[0,.3]],.02,'#e7eef5',0,.12,0);});}
  });
 },
 giant(t){
  const C=team(t);
  return humanoid({style:'punch',skin:'#ffbd8a',shirt:'#c47b45',sleeve:'#ffbd8a',pants:'#6b4a33',boots:'#4a3326',headR:.33,bodyR:.36,bodyScale:[1.05,1.05,.95],legR:.12,armR:.105,handR:.17,hip:.4,legX:.16,scale:1.42,
   body(p,{bodyY,bodyR}){
    p.cyl(0,bodyY-.2,0,bodyR*.95,bodyR*1.08,.2,'#6b4a33',18);p.ring(0,bodyY-.12,0,bodyR*1.0,.05,'#3d2a1d',Math.PI/2);p.box(0,bodyY-.12,bodyR*.96,.14,.11,.06,palette.gold);
    p.at(0,bodyY+.05,0,0,0,.75,q=>q.torus(0,0,0,bodyR*1.02,.06,C,Math.PI*2,Math.PI/2));
    p.ball(0,bodyY+.14,bodyR*.62,bodyR*.38,'#ffbd8a',1.2,.8,.5,{outline:false});
   },
   head(p,{hc,R}){
    const [x,y,z]=hc;
    p.ball(x,y-R*.45,z+R*.45,R*.62,'#8a5530',1.25,1,.9);p.ball(x,y-R*.75,z+R*.35,R*.42,'#8a5530',1,1,.9);
    eyes(p,x,y+R*.05,z,R,{size:.12,brow:'#6b3f22',angry:.25,spread:.38});
    p.ball(x,y-R*.12,z+R*.95,R*.22,'#f0a070',1,.9,1,{outline:false},10);
    for(const s of [-1,1])p.ball(x+s*R*.98,y-R*.05,z,R*.2,'#ffbd8a',.6,1,1);
   },
   arm(p){p.ball(0,-.02,0,.16,C,1,.9,1);p.ring(0,-.2,0,.115,.03,'#6b4a33',Math.PI/2);},
   extraHeight:-.05
  });
 },
 bomber(t){
  const C=team(t),B='#f2ead2',BD='#cfc3a3';
  return humanoid({style:'throw',skin:B,shirt:B,pants:B,boots:BD,headR:.37,bodyR:.17,bodyScale:[1,1.15,.8],legR:.045,armR:.04,handR:.06,scale:.9,
   body(p,{bodyY,bodyR}){
    p.cyl(0,bodyY,0,.035,.035,.42,BD,8);
    for(let i=0;i<3;i++)p.torus(0,bodyY+.11-i*.08,0,bodyR*(1.05-i*.12),.022,B,Math.PI*2,Math.PI/2);
    p.ball(0,bodyY-.22,0,.12,B,1.2,.6,.9);p.ball(0,bodyY,0,bodyR*.8,'#3a3048',1,1.1,.7,{outline:false});
    p.at(0,bodyY+.18,0,0,0,0,q=>q.torus(0,0,0,.16,.05,C,Math.PI*2,Math.PI/2));
   },
   head(p,{hc,R}){
    const [x,y,z]=hc;
    p.ball(x,y-R*.62,z+R*.25,R*.55,B,1,.6,1);
    for(const s of [-1,1])p.ball(x+s*R*.36,y+R*.0,z+R*.78,R*.27,'#2a2236',1,1.1,.6,{outline:false},12);
    for(const s of [-1,1])p.ball(x+s*R*.36,y+R*.02,z+R*.93,R*.07,'#ffdb4d',1,1,1,{glow:true},8);
    p.cone(x,y-R*.3,z+R*.92,R*.09,R*.14,'#2a2236',Math.PI,0,0,{outline:false},6);
    for(let i=-2;i<=2;i++)p.box(x+i*R*.13,y-R*.62,z+R*.78,R*.1,R*.16,R*.08,B,0,0,0,{outline:false});
    p.dome(x,y+R*.12,z-R*.04,R*1.06,C,.42);p.ball(x,y+R*.1,z-R*1.0,R*.18,C);
    for(const s of [-1,1])p.capsule(x+s*R*.18,y-R*.1,z-R*1.15,R*.08,R*.35,C,.6,0,s*.4);
   },
   prop(p){bomb(p,0,0,0,.2);}
  });
 }
};

function bat(t){
 const C=team(t),P='#5d4596',PL='#8a73c9';
 const root=new T.Group(),p=new Parts();
 p.ball(0,.5,0,.36,P,1,1,1.02);p.ball(0,.42,.2,.22,PL,1.1,1,.6,{outline:false});
 for(const s of [-1,1]){p.cone(s*.2,.88,-.02,.12,.32,P,0,0,-s*.35);p.cone(s*.2,.86,.02,.06,.2,C,0,0,-s*.35,{outline:false},8);}
 eyes(p,0,.5,0,.36,{size:.2,spread:.38,lift:.25,brow:'#2d1f4f',angry:.3});
 for(const s of [-1,1])p.cone(s*.07,.38,.33,.03,.08,palette.white,Math.PI,0,0,{outline:false},6);
 for(const s of [-1,1])p.ball(s*.12,.16,.02,.06,'#3b2a66',1,.7,1.3);
 for(let i=0;i<3;i++)p.cone((i-1)*.07,.86,-.02+Math.abs(i-1)*-.03,.06,.2,C,0,0,(1-i)*.35);
 root.add(p.finish());
 for(const [name,s] of [['leftWing',-1],['rightWing',1]]){
  const w=new Parts();
  const pts=[[0,0],[.25,.18],[.55,.28],[.82,.12],[.7,.02],[.62,-.12],[.48,-.04],[.36,-.16],[.24,-.05],[.1,-.1]].map(([a,b])=>[a*s,b]);
  w.shape(s<0?pts.reverse():pts,.025,P,0,0,0,Math.PI/2,0,0);
  w.capsule(s*.4,.0,.02,.022,.75,C,0,0,Math.PI/2,{outline:false});
  member(root,name,s*.26,.55,-.04,w);
 }
 root.scale.setScalar(.72);root.userData={height:.95*.72+.2,rig:true,style:'bite'};
 return root;
}

export function unitModel(art,side){
 const key=art+side;
 if(!cache.has(key)){const make=art==='bat'?bat:builders[art];cache.set(key,bakeRig(make?make(side):builders.knight(side)));}
 return cloneModel(cache.get(key));
}

/* ── Torres ─────────────────────────────────────────────────────────────────────────────────── */
function ballista(p,C,size=1){
 const k=size;
 p.cyl(0,.05,0,.42*k,.5*k,.16,palette.woodDark,18);p.cyl(0,.18,0,.3*k,.36*k,.12,palette.wood,16);
 p.box(0,.36,.05,.2*k,.16*k,1.0*k,palette.wood);p.box(0,.36,-.42*k,.26*k,.22*k,.18*k,palette.woodDark);
 p.at(0,.4,.42*k,0,0,0,q=>{q.torus(0,0,-.12*k,.5*k,.045*k,palette.woodDark,Math.PI*.9,Math.PI/2,0,Math.PI*.05);
  for(const s of [-1,1])q.ball(s*.49*k,0,-.04*k,.06*k,C);
  q.capsule(0,.0,-.05*k,.01,.96*k,'#f4ecd8',0,0,Math.PI/2,{outline:false});});
 p.at(0,.48,.1*k,0,0,0,q=>{q.capsule(0,0,0,.035*k,.8*k,palette.woodDark,Math.PI/2);q.cone(0,0,.5*k,.07*k,.18*k,palette.gold,Math.PI/2);
  for(const s of [-1,1])q.shape([[0,0],[.09*k,-.04*k],[.09*k,.1*k]],.01,C,s*.03*k,0,-.36*k,0,s*Math.PI/2,0);});
 p.ring(0,.36,.32*k,.13*k,.03*k,palette.gold);
}
export function towerModel(side,king=false){
 const C=team(side),D=team(side,true),root=new T.Group(),p=new Parts();
 const r=king?1.18:.9,h=king?1.7:1.45;
 // Base de pedra com blocos arredondados, porta de madeira e bandeiras do time.
 p.cyl(0,.12,0,r*1.32,r*1.4,.24,palette.stoneDark,24);
 p.cyl(0,h/2+.2,0,r*1.02,r*1.12,h,palette.stone,20);
 for(let ring=0;ring<3;ring++)for(let i=0;i<12;i++){const a=i/12*Math.PI*2+ring*.26,y=.42+ring*h*.3;p.sharpBox(Math.sin(a)*r*1.1,y,Math.cos(a)*r*1.1,.42,.2,.12,ring%2?palette.stoneDark:'#e6dfd0',0,a,0);}
 p.cyl(0,h+.24,0,r*1.18,r*1.08,.16,palette.stoneDark,24);
 for(let i=0;i<10;i++){const a=i/10*Math.PI*2;p.box(Math.sin(a)*r*1.1,h+.46,Math.cos(a)*r*1.1,.34,.32,.26,palette.stone,0,a,0);}
 p.box(0,.55,r*1.06,.5,.7,.12,palette.woodDark);p.dome(0,.88,r*1.06,.25,palette.woodDark,.5,1,1,.48);p.ball(.13,.55,r*1.14,.035,palette.gold);
 for(const s of [-1,1]){const a=s*.95;p.at(Math.sin(a)*r*1.13,h*.72,Math.cos(a)*r*1.13,0,a,0,q=>{q.box(0,0,.02,.36,.7,.05,C);q.box(0,.33,.03,.4,.08,.07,palette.gold);q.shape([[-.18,0],[.18,0],[0,-.16]],.04,C,0,-.37,.02);});}
 if(king){for(const s of [-1,1]){const x=s*r*1.05;p.cyl(x,h+.55,r*.55,.24,.27,.5,palette.stone,16);p.cone(x,h+1.05,r*.55,.32,.55,C,0,0,0,undefined,16);p.ball(x,h+1.36,r*.55,.06,palette.gold);}}
 root.add(p.finish());
 // A torreta gira para mirar: balestra na torre princesa; rei + balestra na torre do rei.
 const tr=new Parts();ballista(tr,C,king?1.15:1);
 if(king){
  tr.at(0,.05,-.62,0,0,0,q=>{
   q.ball(0,.62,0,.34,D,1.05,1.05,.95);q.cyl(0,.38,0,.3,.42,.32,C,18);q.ring(0,.34,0,.42,.06,palette.white,Math.PI/2);
   q.ball(0,1.15,0,.36,palette.skin);eyes(q,0,1.15,0,.36,{brow:'#e8e0d0',angry:.15});
   q.ball(0,.86,.2,.28,palette.white,1.2,1,.7);q.ball(0,.98,.32,.11,'#ffb98a',1,1,1,{outline:false},10);
   for(const s of [-1,1])q.ball(s*.13,.98,.3,.11,palette.white,1.3,.6,.6);
   crown(q,0,1.47,0,.26);
  });
 }
 member(root,'turret',0,h+.38,0,tr);
 root.userData.height=h+(king?2.1:1.25);return bakeRig(root);
}
/* ── Projéteis (apontam para +z; o arena3d gira na direção do voo) ─────────────────────────── */
export function projectileModel(kind,side){
 const key=kind+side;
 if(!projCache.has(key)){
  const C=team(side),p=new Parts();
  if(kind==='bomb'){bomb(p,0,0,0,.26);}
  else if(kind==='ball'){p.ball(0,0,0,.2,'#3d4558');}
  else{const big=kind==='bolt',L=big?.95:.75;
   p.capsule(0,0,0,big?.035:.025,L,big?palette.woodDark:palette.wood,Math.PI/2);
   p.cone(0,0,L/2+.08,big?.075:.06,.2,big?palette.gold:palette.steel,Math.PI/2);
   for(let i=0;i<3;i++){const a=i*Math.PI*2/3;p.at(0,0,-L/2+.05,0,0,a,q=>q.shape([[0,0],[.1,-.05],[.1,.14]],.01,i?palette.white:C,0,.015,0,0,Math.PI/2,0));}}
  const out=p.finish();projCache.set(key,out);
 }
 return projCache.get(key).clone(true);
}
export function rubbleModel(king){
 const p=new Parts(),r=king?1.2:.95;
 p.cyl(0,.12,0,r*1.32,r*1.4,.24,palette.stoneDark,20);p.cyl(0,.32,0,r*1.0,r*1.1,.3,'#c9c1b0',20);
 for(let i=0;i<13;i++){const a=i*2.399,d=r*(.55+(i%3)*.22);p.box(Math.cos(a)*d,.42+(i%3)*.1,Math.sin(a)*d,.3+(i%2)*.18,.24+(i%3)*.12,.3,i%2?palette.stone:palette.stoneDark,i*.3,i*.8,i*.2);}
 for(let i=0;i<5;i++){const a=i*1.3;p.box(Math.cos(a)*r*.35,.5,Math.sin(a)*r*.35,.08,.5+(i%2)*.25,.08,palette.woodDark,.3*(i%2?1:-1),a,.4);}
 return p.finish();
}
