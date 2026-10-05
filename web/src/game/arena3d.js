import * as T from 'three';
import { Software3DRenderer } from './software3d.js';
import { animateRig, animateDeath } from './animation.js';
import { Parts, palette, unitModel, towerModel, rubbleModel } from './models3d.js';
const TILE=64,W=18,H=26,TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const v3=new T.Vector3(),v4=new T.Vector3(),up=new T.Vector3(0,1,0),quat=new T.Quaternion(),matrix=new T.Matrix4(),color=new T.Color();
const world=(x,y,z=0)=>new T.Vector3(x/TILE-9,.10+z/TILE,y/TILE-13);
const stoneMat=new T.MeshStandardMaterial({color:0x728d91,roughness:.92});
const unitBaseGeo=new T.CylinderGeometry(.48,.5,.07,20);
const particleMax=1200;

let particleTextures;
function textures(){
 if(!particleTextures){const loader=new T.TextureLoader();particleTextures={ready:{value:0}};let loaded=0;
  for(const [key,file] of [['smokeMap','smoke_01'],['fireMap','fire_01'],['sparkMap','spark_01'],['magicMap','magic_01']])particleTextures[key]={value:loader.load('/game/assets/vfx/'+file+'.png',()=>{if(++loaded===4)particleTextures.ready.value=1;})};
 }return particleTextures;
}
class ParticleCloud{
 constructor(scene,additive,software=false){
  this.software=software;
  this.geo=new T.BufferGeometry();this.pos=new Float32Array(particleMax*3);this.colors=new Float32Array(particleMax*3);this.sizes=new Float32Array(particleMax);this.alpha=new Float32Array(particleMax);this.types=new Float32Array(particleMax);this.rotations=new Float32Array(particleMax);
  this.geo.setAttribute('position',new T.BufferAttribute(this.pos,3).setUsage(T.DynamicDrawUsage));this.geo.setAttribute('color',new T.BufferAttribute(this.colors,3).setUsage(T.DynamicDrawUsage));this.geo.setAttribute('size',new T.BufferAttribute(this.sizes,1).setUsage(T.DynamicDrawUsage));this.geo.setAttribute('alpha',new T.BufferAttribute(this.alpha,1).setUsage(T.DynamicDrawUsage));
  this.geo.setAttribute('sprite',new T.BufferAttribute(this.types,1).setUsage(T.DynamicDrawUsage));this.geo.setAttribute('angle',new T.BufferAttribute(this.rotations,1).setUsage(T.DynamicDrawUsage));
  this.mat=new T.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,blending:additive?T.AdditiveBlending:T.NormalBlending,uniforms:{pixelScale:{value:700},...(software?{}:textures())},
   vertexShader:`attribute float size;attribute float alpha;attribute float sprite;attribute float angle;varying vec3 vColor;varying float vAlpha;varying float vSprite;varying float vAngle;uniform float pixelScale;void main(){vColor=color;vAlpha=alpha;vSprite=sprite;vAngle=angle;vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*pixelScale/max(1.0,-p.z),1.0,110.0);}`,
   fragmentShader:`varying vec3 vColor;varying float vAlpha;varying float vSprite;varying float vAngle;uniform sampler2D smokeMap;uniform sampler2D fireMap;uniform sampler2D sparkMap;uniform sampler2D magicMap;uniform float ready;void main(){vec2 uv=gl_PointCoord-.5;float cs=cos(vAngle),sn=sin(vAngle);uv=mat2(cs,-sn,sn,cs)*uv+.5;float d=length(gl_PointCoord-.5)*2.0;float a=max(0.0,1.0-d);vec4 tex=vec4(1.0);if(ready>.5){if(vSprite<.5)tex=texture2D(smokeMap,uv);else if(vSprite<1.5)tex=texture2D(fireMap,uv);else if(vSprite<2.5)tex=texture2D(sparkMap,uv);else tex=texture2D(magicMap,uv);a=tex.a;}if(a<.02||uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)discard;gl_FragColor=vec4(vColor*mix(vec3(1.0),tex.rgb,.35),a*vAlpha);}`});
  this.mesh=new T.Points(this.geo,software?new T.PointsMaterial({color:additive?'#ffc775':'#b4bbc2',size:additive?.09:.17,transparent:true,opacity:.65}):this.mat);this.mesh.frustumCulled=false;scene.add(this.mesh);this.additive=additive;
 }
 update(parts,height,dpr,quality){let n=0,limit=this.software?100:quality<.5?220:800;
  for(let i=parts.length-1;i>=0&&n<limit;i--){const p=parts[i];if(!!p.add!==this.additive)continue;const j=n*3;this.pos[j]=p.x/64-9;this.pos[j+1]=Math.max(.04,(p.z||0)/64+.15);this.pos[j+2]=p.y/64-13;color.set(p.col||'#ffffff');this.colors[j]=color.r;this.colors[j+1]=color.g;this.colors[j+2]=color.b;this.types[n]=!p.add?0:p.kind==='streak'?2:color.r>color.b*1.5?1:3;this.rotations[n]=p.rot||0;this.alpha[n]=clamp(p.life/(p.max||1),0,1);this.sizes[n]=Math.max(.04,(p.r||2)/64)*(this.additive?4:5.5);n++;}
  this.geo.setDrawRange(0,n);if(this.software)this.geo.attributes.position.array=this.pos.subarray(0,n*3);for(const a of Object.values(this.geo.attributes))a.needsUpdate=true;this.mat.uniforms.pixelScale.value=height*dpr*1.5;
 }
}
class Pool{
 constructor(scene,geometry,{add=false,lit=false,opacity=1}={}){this.scene=scene;this.geo=geometry;this.items=[];this.used=0;this.opts={add,lit,opacity};}
 reset(){this.used=0;}
 get(c,opacity=1){
  let m=this.items[this.used++];
  if(!m){const {add,lit}=this.opts;const mat=lit?new T.MeshStandardMaterial({color:c,roughness:.5,transparent:true,depthWrite:false}):new T.MeshBasicMaterial({color:c,transparent:true,depthWrite:false,blending:add?T.AdditiveBlending:T.NormalBlending,side:T.DoubleSide});m=new T.Mesh(this.geo,mat);m.frustumCulled=false;this.items.push(m);this.scene.add(m);}
  m.visible=true;m.position.set(0,0,0);m.rotation.set(0,0,0);m.scale.set(1,1,1);m.material.color.set(c);m.material.opacity=clamp(opacity,0,1);return m;
 }
 finish(){for(let i=this.used;i<this.items.length;i++)this.items[i].visible=false;}
}
export class Arena3D{
 constructor({canvas,input,stage,onReady,onError}){
  this.canvas=canvas;this.input=input;this.stage=stage;this.entities=new Map();this.mode=0;this.yaw=0;this.polar=.30;this.last=0;this.ghostId='';this.ready=false;this.low=false;
  try{
   const context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
   this.software=!context;
   if(context)this.renderer=new T.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'high-performance'});
   else{
    // The same scene, perspective camera and triangle meshes remain genuinely 3D
    // on browsers without WebGL. Only rasterization falls back to the CPU.
    this.renderer=new Software3DRenderer();
    this.renderer.setPixelRatio=()=>{};this.renderer.getPixelRatio=()=>1;this.renderer.shadowMap={enabled:false};
    this.renderer.domElement.id='world3dSoftware';this.renderer.domElement.setAttribute('aria-label','Arena 3D em modo de compatibilidade');
    canvas.hidden=true;stage.prepend(this.renderer.domElement);
   }
  }catch(e){onError(e);return;}
  this.renderer.setClearColor('#0a1922');this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.scene=new T.Scene();this.scene.background=new T.Color('#73a743');this.scene.fog=new T.Fog('#73a743',90,150);this.scene.scale.z=1.25;
  this.camera=new T.PerspectiveCamera(29,1,.1,150);this.target=new T.Vector3(0,.6,0);
  this.scene.add(this.software?new T.AmbientLight(0xffffff,.5):new T.HemisphereLight(0xd6f3ef,0x576970,2.35));
  this.sun=new T.DirectionalLight(0xffeac1,3.7);this.sun.position.set(-12,23,9);this.sun.castShadow=true;
  this.sun.shadow.mapSize.set(1536,1536);Object.assign(this.sun.shadow.camera,{left:-22,right:22,top:25,bottom:-25,near:1,far:65});this.sun.shadow.bias=-.0003;this.sun.shadow.normalBias=.08;if(this.software)this.sun.intensity=.65;this.scene.add(this.sun);
  const fill=new T.DirectionalLight(0x83c5ea,this.software?.18:.9);fill.position.set(12,9,-13);this.scene.add(fill);
  this.makeArena();for(const o of this.scene.children)if(!o.isLight)o.userData.environment=true;
  this.raycaster=new T.Raycaster();this.plane=new T.Plane(up,0);this.pointer=new T.Vector2();
  this.labelLayer=document.createElement('div');this.labelLayer.className='worldLabels';stage.append(this.labelLayer);
  this.particles=new ParticleCloud(this.scene,true,this.software);this.smoke=new ParticleCloud(this.scene,false,this.software);
  this.rings=new Pool(this.scene,new T.TorusGeometry(1,.025,4,36),{add:true});
  this.orbs=new Pool(this.scene,new T.SphereGeometry(1,10,7),{add:true});
  this.bombs=new Pool(this.scene,new T.SphereGeometry(1,8,6),{lit:true});
  this.boxes=new Pool(this.scene,new T.BoxGeometry(1,1,1));
  this.beams=new Pool(this.scene,new T.CylinderGeometry(1,1,1,8),{add:true});
  this.decals=new Pool(this.scene,new T.CircleGeometry(1,20));
  this.poolList=[this.rings,this.orbs,this.bombs,this.boxes,this.beams,this.decals];
  this.boltGeo=new T.BufferGeometry();this.boltPos=new Float32Array(2400);this.boltCol=new Float32Array(2400);this.boltGeo.setAttribute('position',new T.BufferAttribute(this.boltPos,3).setUsage(T.DynamicDrawUsage));this.boltGeo.setAttribute('color',new T.BufferAttribute(this.boltCol,3).setUsage(T.DynamicDrawUsage));this.boltGeo.setDrawRange(0,0);
  this.boltMesh=new T.LineSegments(this.boltGeo,new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.9,blending:T.AdditiveBlending}));this.boltMesh.frustumCulled=false;this.scene.add(this.boltMesh);
  this.deployRing=new T.Mesh(new T.RingGeometry(.92,1,48),new T.MeshBasicMaterial({color:palette.ally,side:T.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));this.deployRing.rotation.x=-Math.PI/2;this.deployRing.visible=false;this.scene.add(this.deployRing);
  this.zone=new T.Mesh(new T.PlaneGeometry(18,12),new T.MeshBasicMaterial({color:0x62e5cc,transparent:true,opacity:.08,depthWrite:false}));this.zone.rotation.x=-Math.PI/2;this.zone.position.set(0,.045,7);this.zone.visible=false;this.scene.add(this.zone);
  this.ghostMat=new T.MeshBasicMaterial({color:0x7eeed8,transparent:true,opacity:.35,depthWrite:false});
  this.installControls();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(stage);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.ready=false;onError(new Error('Contexto 3D interrompido'));});canvas.addEventListener('webglcontextrestored',()=>location.reload());
  this.ready=true;this.resize();onReady(this.software?'software-3d':'webgl-3d');
 }
 makeArena(){
  const p=new Parts();
  // A solid floating island, with the river carved between two playable banks.
  p.box(0,-1.25,0,19.4,2.1,27.7,'#49606a');p.box(0,-.45,0,19.8,.40,28.1,'#8b9e96');
  p.box(0,-.19,-7,18,.38,12,'#86b94b');p.box(0,-.19,7,18,.38,12,'#86b94b');
  const island=p.finish();island.renderOrder=-20;this.scene.add(island);
  const grass=new T.InstancedMesh(new T.BoxGeometry(.994,.026,.994),new T.MeshStandardMaterial({roughness:1}),18*24);let n=0;
  const cpuGrass=this.software?new Parts():null;
  for(let z=0;z<26;z++)for(let x=0;x<18;x++){if(z===12||z===13)continue;matrix.makeTranslation(x-8.5,.016,z-12.5);grass.setMatrixAt(n,matrix);color.set(((x+z)%2)?'#98c854':'#a1cc5c');if(z<12)color.multiplyScalar(.99);grass.setColorAt(n,color);if(cpuGrass)cpuGrass.add(new T.PlaneGeometry(.994,.994),color,x-8.5,.029,z-12.5,1,1,1,-Math.PI/2);n++;}grass.receiveShadow=true;grass.instanceMatrix.needsUpdate=true;grass.instanceColor.needsUpdate=true;const turf=cpuGrass?cpuGrass.finish():grass;turf.renderOrder=-19;this.scene.add(turf);
  const edge=new Parts();
  for(const x of [-9.3,9.3])for(let z=-13.3;z<=13.5;z+=1.24)edge.box(x,.14,z,.60,.40,1.14,'#b2b7a0');
  for(const z of [-13.55,13.55])for(let x=-8.65;x<9;x+=1.28)edge.box(x,.14,z,1.18,.40,.63,'#b2b7a0');
  for(const z of [-1.08,1.08])edge.box(0,-.12,z,18,.36,.21,'#a1b69d');
  // Lane paths and tower foundations remain flat, so troop positions match the simulation.
  for(const x of [-5.5,5.5])for(const z of [-1,1]){
   for(let j=0;j<10;j++)edge.box(x,.049,z*(1.1+j*1.10),1.25,.03,.95,j%2?'#d6bd7c':'#ddc482');
  }
  const border=edge.finish();border.renderOrder=-17;this.scene.add(border);
  for(const x of [-5.5,5.5]){
   const b=new Parts();b.box(x,.08,0,2.03,.23,2.45,'#795b3e');
   for(let i=0;i<9;i++)b.box(x,.225,-1.13+i*.28,2.12,.16,.245,i%2?'#b1905b':'#bb9863');

   const bridge=b.finish();bridge.renderOrder=-16;this.scene.add(bridge);
  }
  this.waterMat=new T.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec2 v;uniform float time;void main(){v=uv;vec3 p=position;p.z+=sin(p.x*2.1+time*1.2)*.025;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,fragmentShader:`varying vec2 v;uniform float time;void main(){float a=sin(v.x*75.0+v.y*16.0-time*2.0);float b=sin(v.x*32.0-v.y*20.0+time);vec3 c=mix(vec3(.035,.29,.39),vec3(.06,.55,.63),.5+.22*a+.14*b);float foam=pow(abs(v.y-.5)*2.0,18.0);c=mix(c,vec3(.41,.76,.70),foam*.65);gl_FragColor=vec4(c,1.0);}`});
  const water=new T.Mesh(new T.PlaneGeometry(18.2,2,this.software?1:48,this.software?1:5),this.software?new T.MeshBasicMaterial({color:0x20869b}):this.waterMat);water.rotation.x=-Math.PI/2;water.position.y=-.08;water.renderOrder=-18;this.scene.add(water);
  const riverWalls=new Parts();riverWalls.box(-9.15,-.9,0,.09,1.7,1.95,'#3d9fad');riverWalls.box(9.15,-.9,0,.09,1.7,1.95,'#3d9fad');const walls=riverWalls.finish();walls.renderOrder=-15;this.scene.add(walls);
  const decor=new Parts();
  for(const x of [-10.3,10.3])for(const z of [-10,-4,4,10]){
   decor.cyl(x,-.05,z,.8,1,.4,'#677e78',6);decor.cyl(x,1.0,z,.15,.2,1.9,'#775b46',7);decor.ball(x,1.8,z,.95,'#529b37',1,1.1,1);decor.ball(x-.5,2.0,z+.25,.65,'#6cb53c');decor.ball(x+.4,2.25,z-.25,.68,'#82bf48');
  }
  for(const x of [-9.95,9.95])for(const z of [-7.6,7.6]){
   decor.cyl(x,1.35,z,.045,.06,2.7,'#cbb989',6);decor.ball(x,2.79,z,.09,palette.gold);decor.box(x+.30,2.22,z,.58,.68,.045,z>0?palette.ally:palette.foe);
  }
  for(let i=0;i<22;i++){const x=i%2?-9.4:9.4,z=-12+(i*2.77)%25;decor.ball(x,-1.12,z,.55+(i%3)*.14,i%2?'#526775':'#657c83',1.2,1,.8);}
  for(const z of [-11.2,11.2])for(const x of [-5.5,5.5]){decor.box(x,.55,z,4,.20,.18,'#aa774a');for(const d of [-1.9,0,1.9])decor.box(x+d,.57,z,.25,1.12,.28,'#7c5132');}
  const trees=decor.finish();trees.renderOrder=-14;this.scene.add(trees);
  const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0x172d34,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-3.2;floor.receiveShadow=true;floor.renderOrder=-30;if(!this.software)this.scene.add(floor);
  this.motes=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(Array.from({length:90},(_,i)=>[(i*7.341)%30-15,1+(i*3.71)%5,(i*11.137)%37-18]).flat(),3)),new T.PointsMaterial({color:0xd3d5a5,size:.05,transparent:true,opacity:.55}));this.scene.add(this.motes);
 }
 installControls(){
  let drag=null;
  this.input.addEventListener('contextmenu',e=>e.preventDefault());
  this.input.addEventListener('pointerdown',e=>{if(e.button===2){drag={x:e.clientX,y:e.clientY};this.input.setPointerCapture(e.pointerId);}});
  this.input.addEventListener('pointermove',e=>{if(!drag)return;this.yaw=clamp(this.yaw+(e.clientX-drag.x)*.006,-.9,.9);this.polar=clamp(this.polar+(e.clientY-drag.y)*.004,.3,1.05);drag={x:e.clientX,y:e.clientY};this.fitCamera();});
  this.input.addEventListener('pointerup',e=>{if(e.button===2)drag=null;});this.input.addEventListener('pointercancel',()=>drag=null);
 }
 cycleView(){this.mode=(this.mode+1)%3;const p=[[0,.30],[.36,.76],[-.55,.94]][this.mode];this.yaw=p[0];this.polar=p[1];this.fitCamera();return ['Tática','Perspectiva','Lateral'][this.mode];}
 resize(){if(!this.renderer)return;this.w=this.stage.clientWidth;this.h=this.stage.clientHeight;if(!this.w||!this.h)return;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.low?1:1.5));this.renderer.setSize(this.w,this.h,false);this.camera.aspect=this.w/this.h;this.camera.updateProjectionMatrix();this.fitCamera();}
 fitCamera(){if(!this.w||!this.h)return;
  const yaw=this.w<500?this.yaw*.5:this.yaw;
  const direction=new T.Vector3(Math.sin(yaw)*Math.sin(this.polar),Math.cos(this.polar),Math.cos(yaw)*Math.sin(this.polar));
  let distance=30;for(let i=0;i<34;i++){
   this.camera.position.copy(this.target).addScaledVector(direction,distance);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();let fits=true;
   for(const x of [-10,10])for(const y of [-2,3.4])for(const z of [-17.5,17.5]){v3.set(x,y,z).project(this.camera);if(Math.abs(v3.x)>.97||Math.abs(v3.y)>.96)fits=false;}
   if(fits)break;distance+=1.5;
  }
  this.cameraBase=this.camera.position.clone();this.renderer?.render(this.scene,this.camera);
 }
 pick(x,y){if(!this.ready)return null;this.pointer.set(x/this.w*2-1,-y/this.h*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.ray.intersectPlane(this.plane,v3);if(!hit)return null;this.scene.worldToLocal(hit);return {x:(hit.x+9)*64,y:(hit.z+13)*64};}
 label(key,model,entity){
  const el=document.createElement('div');el.className='worldHp'+(entity.kind==='tower'?' towerHp':'');el.innerHTML='<span></span><div><i></i></div>';this.labelLayer.append(el);return {el,text:el.querySelector('span'),fill:el.querySelector('i'),value:-1};
 }
 addEntity(key,e){
  const isTower=e.kind==='tower',model=isTower?towerModel(e.side,e.king):unitModel(e.card.art,e.side);this.scene.add(model);
  const foot=new T.Mesh(unitBaseGeo,new T.MeshBasicMaterial({color:palette[e.side],transparent:true,opacity:isTower?.0:.32,depthWrite:false}));this.scene.add(foot);
  const bar=this.label(key,model,e);const entry={model,foot,bar,oldX:e.x,oldY:e.y,angle:e.side==='ally'?Math.PI:0,rig:{}};
  for(const name of ['leftLeg','rightLeg','leftArm','rightArm','leftWing','rightWing','turret'])entry.rig[name]=model.getObjectByName(name);
  if(isTower){entry.ruin=rubbleModel(e.king);entry.ruin.visible=false;entry.ruin.position.copy(world(e.x,e.y));this.scene.add(entry.ruin);}
  this.entities.set(key,entry);return entry;
 }
 updateEntities(G,time,dt){const seen=new Set();
  for(const e of [...G.towers,...G.units]){
   if(e.dead)continue;const tower=e.kind==='tower',key=tower?'t:'+e.side+':'+e.lane+':'+e.king:'u:'+e.id+':'+e.card.id+':'+e.side;seen.add(key);const n=this.entities.get(key)||this.addEntity(key,e),m=n.model;
   if(tower&&!e.alive){m.visible=false;n.ruin.visible=true;n.bar.el.hidden=true;n.foot.visible=false;continue;}
   m.visible=true;if(n.ruin)n.ruin.visible=false;
   const lift=tower?0:Math.max(0,(e.z||0)/64)+(e.air?.40:0);
   m.position.copy(world(e.x,e.y));m.position.y+=lift;
   if(!tower){
    animateRig(n,e,time,dt,G.state==='menu');
   }else if(n.rig.turret){n.rig.turret.rotation.y=Math.PI/2-(e.aim||0);n.rig.turret.position.z=-(e.recoil||0)*.13;}

   n.oldX=e.x;n.oldY=e.y;n.foot.position.set(m.position.x,.07,m.position.z);const r=tower?0:(e.r||24)/64;n.foot.scale.setScalar(r*1.95);n.foot.visible=!tower;
   const show=tower||e.hp<e.maxHp;n.bar.el.hidden=!show;
   if(show){m.getWorldPosition(v3);v3.y+=(m.userData.height||2.5)+.17;v3.project(this.camera);n.bar.el.style.transform=`translate(${(v3.x*.5+.5)*this.w}px,${(-v3.y*.5+.5)*this.h}px) translate(-50%,-100%)`;const value=Math.ceil(Math.max(0,e.hp));if(n.bar.value!==value){n.bar.value=value;n.bar.text.textContent=tower?value:'';n.bar.fill.style.transform=`scaleX(${clamp(e.hp/e.maxHp,0,1)})`;n.bar.fill.style.background=palette[e.side];}n.bar.el.hidden=Math.abs(v3.x)>1||Math.abs(v3.y)>1;}
  }
  for(const [key,n] of this.entities)if(!seen.has(key)){
   n.bar.el.hidden=true;n.foot.visible=false;
   if(key.startsWith('u:')&&['battle','over'].includes(G.state)&&!animateDeath(n,dt))continue;
   this.scene.remove(n.model,n.foot);if(n.ruin){this.scene.remove(n.ruin);n.ruin.geometry.dispose();}if(key.startsWith('t:'))n.model.traverse(o=>{if(o.isMesh)o.geometry.dispose();});n.foot.material.dispose();n.bar.el.remove();this.entities.delete(key);
  }
 }
 ring(x,y,r,c,a=1,height=.075){const m=this.rings.get(c,a);m.position.set(x/64-9,height,y/64-13);m.rotation.x=Math.PI/2;m.scale.setScalar(Math.max(.03,r));return m;}
 orb(x,y,h,r,c,a=1,bomb=false){const m=(bomb?this.bombs:this.orbs).get(c,a);m.position.set(x/64-9,h,y/64-13);m.scale.setScalar(Math.max(.025,r));return m;}
 beam(x,y,h,x2,y2,h2,r,c,a=1){const m=this.beams.get(c,a),a1=world(x,y),b=world(x2,y2);a1.y=h;b.y=h2;v4.subVectors(b,a1);const length=v4.length();m.position.copy(a1).addScaledVector(v4,.5);m.quaternion.setFromUnitVectors(up,v4.normalize());m.scale.set(r,length,r);return m;}
 effects(G,FX,time,quality){for(const p of this.poolList)p.reset();
  for(const r of FX.rings.slice(-32)){const k=1-clamp(r.life/(r.max||.4),0,1);const radius=mix(r.r0,r.r1,k)/64;this.ring(r.x,r.y,radius,r.col,(1-k)*.8);if(quality>.5&&radius>.5){this.ring(r.x,r.y,radius*.75,r.col,(1-k)*.26,.15+k*.3);}}
  for(const p of G.projs.slice(-100)){
   const k=clamp(p.t/p.dur,0,1),lift=mix(p.lift0||45,p.lift1||25,k),h=.25+((p.z||0)+lift)/64,py=p.y+lift;
   const flame=['fire','orb'].includes(p.kind),m=this.orb(p.x,py,h,(p.r||3)/64*1.6,p.kind==='bomb'?'#303746':p.col||'#ffca76',1,['bomb','ball'].includes(p.kind));
   if(['arrow','bolt'].includes(p.kind)){m.scale.set(.035,.035,.3);m.rotation.y=Math.PI/2-(p.ang||0);}
   if(flame){for(let j=1;j<=3;j++){const back=j*9;this.orb(p.x-Math.cos(p.ang||0)*back,py-Math.sin(p.ang||0)*back,h+.02*j,(p.r||5)/64*(1.3-j*.22),p.kind==='fire'?'#ff9a35':'#9df4ff',.5-j*.10);}}
  }
  for(const d of FX.decals.slice(-28)){const m=this.decals.get(d.col,Math.min(.40,(d.a||.2)*Math.min(1,d.life/2)));m.position.set(d.x/64-9,.06,d.y/64-13);m.rotation.x=-Math.PI/2;m.scale.setScalar(d.r/64);}
  for(const f of G.fields){
   if(!Number.isFinite(f.x)||!Number.isFinite(f.y))continue;
   const C=f.sd==='ally'?palette.ally:palette.foe,R=f.s?.raio||2,k=clamp(f.t/(f.dur||1),0,1);
   if(['meteor','volley','zapmark','nuke','aereo'].includes(f.kind))this.ring(f.x,f.y,R,f.kind==='meteor'||f.kind==='nuke'?'#ffab56':C,.55+.2*Math.sin(time*15));
   if(f.kind==='meteor'||f.kind==='nuke'){
    const h=.3+(1-k)*9,xx=f.x-(1-k)*180;this.orb(xx,f.y,h,f.kind==='nuke'?.65:.43,'#ffe198');this.orb(xx-15,f.y,h+.28,.58,'#ff682f',.45);this.beam(xx,f.y,h,xx-80,f.y,h+2,.07,'#ffb25e',.65);
   }
   if(f.kind==='volley'){for(let j=0;j<9;j++){const a=j*2.39,rr=(j%4)*.65,xx=f.x+Math.sin(a)*rr*64,yy=f.y+Math.cos(a)*rr*64;this.beam(xx,yy,.2+(1-k)*6,xx-20,yy,.7+(1-k)*6,.02,'#ebe5cb',.9);}}
   if(f.kind==='twister')for(let j=0;j<9;j++){const h=.2+j*.4,r=.3+j*.27,xx=f.x+Math.sin(time*5+j)*11,yy=f.y+Math.cos(time*5+j)*11;const m=this.ring(xx,yy,r,'#acddff',.38,h);m.rotation.x=Math.PI/2+Math.sin(time*4+j)*.13;const a=time*7+j;this.orb(f.x+Math.sin(a)*r*64,f.y+Math.cos(a)*r*64,h,.08,'#d5efff',.6);}
   if(f.kind==='pingo'){const hop=clamp(f.t/f.hop,0,1);this.orb(f.x+f.dx*hop,f.y+f.dy*hop,.22+Math.sin(hop*Math.PI)*1.8,.17,'#303644',1,true);}
   if(f.kind==='balefire'&&Number.isFinite(f.px))this.beam(f.x,f.y,.6,f.px,f.py,.6,.13,'#ffe8a9',.85);
   if(f.kind==='bwcore'){
    if(f.disparou&&Number.isFinite(f.x2)){this.beam(f.x,f.y,1.6,f.x2,f.y2,1.6,.19,'#fff3d2',.92);this.beam(f.x,f.y,1.6,f.x2,f.y2,1.6,.42,'#9fbef5',.2);}
    else{this.orb(f.x,f.y,1.6,.25+f.t*.7,'#fff7da',.7);this.ring(f.x,f.y,.6,'#f8f4dd',.7,1.6);}
   }
   if(['bwimagine','bwsketch','bwdraft'].includes(f.kind)){
    const m=this.boxes.get(f.papel===false?'#1c2937':'#fff1db',.25+.5*k);m.position.set(f.x/64-9,f.kind==='bwsketch'?1:.095,f.y/64-13);m.scale.set(R*(.3+k)*1.35,.025,R*(.3+k)*1.35);m.rotation.y=time*.65;
    this.ring(f.x,f.y,R*(.3+k),'#fdf4de',.6);}
   if(f.kind==='bwreal'){
    const m=this.boxes.get('#fff5e1',.94);m.position.copy(world(f.x,f.y));m.position.y=1.4;m.scale.set(.22,2.4,.16);m.rotation.y=time;
    const b=this.boxes.get('#fff5e1',.94);b.position.copy(m.position);b.position.y=1.8;b.scale.set(1.35,.22,.16);b.rotation.y=time;
    for(let j=0;j<6;j++){const a=time*5+j*TAU/6;const p=this.boxes.get('#fff7dc',.8);p.position.set(m.position.x+Math.sin(a)*1.15,1.4+Math.cos(a)*.5,m.position.z+Math.cos(a)*1.15);p.scale.set(.28,.04,.14);p.rotation.y=a;}
   }
  }
  let b=0;for(const bolt of FX.bolts){color.set(bolt.col);const fade=clamp(bolt.life/(bolt.max||1),0,1);for(let j=1;j<bolt.seg.length&&b+6<this.boltPos.length;j++)for(const p of [bolt.seg[j-1],bolt.seg[j]]){this.boltPos[b]=p.x/64-9;this.boltPos[b+1]=.65+Math.sin(time*80+j*3)*.09;this.boltPos[b+2]=p.y/64-13;this.boltCol[b]=color.r*fade;this.boltCol[b+1]=color.g*fade;this.boltCol[b+2]=color.b*fade;b+=3;}}
  this.boltGeo.setDrawRange(0,b/3);if(this.software){this.boltGeo.attributes.position.array=this.boltPos.subarray(0,b);this.boltGeo.attributes.color.array=this.boltCol.subarray(0,b);}this.boltGeo.attributes.position.needsUpdate=true;this.boltGeo.attributes.color.needsUpdate=true;
  this.particles.update(FX.parts,this.h,this.renderer.getPixelRatio(),quality);this.smoke.update(FX.parts,this.h,this.renderer.getPixelRatio(),quality);
  for(const p of this.poolList)p.finish();
 }
 render({G,FX,UI,CARD,PREF,QUALITY},time){if(!this.ready)return;
  if(this.software&&this.last&&time-this.last<1/30)return;
  const dt=Math.min(.1,time-(this.last||time));this.last=time;
  if(this.low!==PREF.light){this.low=PREF.light;this.renderer.shadowMap.enabled=!this.low;this.resize();}
  if(this.cameraBase){this.camera.position.copy(this.cameraBase);if(PREF.fx&&FX.shake>.5){this.camera.position.x+=Math.sin(time*49)*FX.shake*.004;this.camera.position.y+=Math.cos(time*43)*FX.shake*.003;}this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
  this.waterMat.uniforms.time.value=time;this.motes.rotation.y=Math.sin(time*.06)*.06;
  this.updateEntities(G,time,dt);this.effects(G,FX,time,QUALITY);
  const show=G.state==='battle'&&UI.holding&&Number.isFinite(UI.wx)&&Number.isFinite(UI.wy);this.deployRing.visible=!!show;this.zone.visible=!!show&&CARD[UI.holding.id]?.tipo!=='feitico';
  if(this.ghost)this.ghost.visible=false;
  if(show){const card=CARD[UI.holding.id],r=card.feitico?.raio||Math.max(.65,card.raio||.5);this.deployRing.position.set(UI.wx/64-9,.08,UI.wy/64-13);this.deployRing.scale.setScalar(r);this.deployRing.material.color.set(UI.valid?'#b0ffe0':'#ff7065');
   if(card.tipo!=='feitico'){
    if(this.ghostId!==card.id){if(this.ghost)this.scene.remove(this.ghost);this.ghost=unitModel(card.art,'ally');this.ghost.traverse(o=>{if(o.isMesh)o.material=this.ghostMat;});this.scene.add(this.ghost);this.ghostId=card.id;}
    this.ghost.visible=true;this.ghost.position.copy(world(UI.wx,UI.wy));this.ghost.rotation.y=Math.PI;this.ghostMat.color.set(UI.valid?'#9cf5d8':'#ff7770');
   }
  }
  this.renderer.render(this.scene,this.camera);this.framesRendered=(this.framesRendered||0)+1;
 }
}
window.createArena3D=options=>new Arena3D(options);
