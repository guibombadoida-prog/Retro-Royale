import * as T from 'three';
import { Software3DRenderer } from './software3d.js';
import { animateRig, animateDeath } from './animation.js';
import { Parts, palette, materials, unitModel, towerModel, rubbleModel, projectileModel, setLowDetail } from './models3d.js';
const TILE=64,TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const v3=new T.Vector3(),v4=new T.Vector3(),up=new T.Vector3(0,1,0),color=new T.Color(),matrix=new T.Matrix4();
const world=(x,y,z=0)=>new T.Vector3(x/TILE-9,.02+z/TILE,y/TILE-13);
const particleMax=1200;

/* ── Partículas do engine (FX.parts) com as texturas Kenney CC0 ──────────────────────────── */
let particleTextures;
function textures(){
 if(!particleTextures){const loader=new T.TextureLoader();particleTextures={ready:{value:0}};let loaded=0;
  for(const [key,file] of [['smokeMap','smoke_01'],['fireMap','fire_01'],['sparkMap','spark_01'],['magicMap','magic_01']])particleTextures[key]={value:loader.load('assets/vfx/'+file+'.png',()=>{if(++loaded===4)particleTextures.ready.value=1;})};
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
  this.mesh=new T.Points(this.geo,software?new T.PointsMaterial({color:additive?'#ffc775':'#d8dde2',size:additive?.09:.17,transparent:true,opacity:.65}):this.mat);this.mesh.frustumCulled=false;scene.add(this.mesh);this.additive=additive;
 }
 update(parts,height,dpr,quality){let n=0,limit=this.software?100:quality<.5?220:800;
  for(let i=parts.length-1;i>=0&&n<limit;i--){const p=parts[i];if(!!p.add!==this.additive)continue;const j=n*3;this.pos[j]=p.x/64-9;this.pos[j+1]=Math.max(.04,(p.z||0)/64+.15);this.pos[j+2]=p.y/64-13;color.set(p.col||'#ffffff');
   // Fumaça escura do engine fica clara e fofa, no estilo cartoon.
   if(!p.add&&p.kind==='puff')color.lerp(TINT_PUFF,.55);
   this.colors[j]=color.r;this.colors[j+1]=color.g;this.colors[j+2]=color.b;this.types[n]=!p.add?0:p.kind==='streak'?2:color.r>color.b*1.5?1:3;this.rotations[n]=p.rot||0;this.alpha[n]=clamp(p.life/(p.max||1),0,1);this.sizes[n]=Math.max(.04,(p.r||2)/64)*(this.additive?4:5.5);n++;}
  this.geo.setDrawRange(0,n);if(this.software)this.geo.attributes.position.array=this.pos.subarray(0,n*3);for(const a of Object.values(this.geo.attributes))a.needsUpdate=true;this.mat.uniforms.pixelScale.value=height*dpr*1.5;
 }
}
const TINT_PUFF=new T.Color('#eef0e6');

/* ── Pools: malhas reaproveitadas a cada quadro para os efeitos ───────────────────────────── */
class Pool{
 constructor(scene,geometry,{add=false,toon=false,side=T.FrontSide,map=null}={}){this.scene=scene;this.geo=geometry;this.items=[];this.used=0;this.opts={add,toon,side,map};}
 reset(){this.used=0;}
 get(c,opacity=1){
  let m=this.items[this.used++];
  if(!m){const {add,toon,side,map}=this.opts;const mat=toon?new T.MeshToonMaterial({color:c,transparent:true,depthWrite:false}):new T.MeshBasicMaterial({color:c,map,transparent:true,depthWrite:false,blending:add?T.AdditiveBlending:T.NormalBlending,side,toneMapped:!add});m=new T.Mesh(this.geo,mat);m.frustumCulled=false;this.items.push(m);this.scene.add(m);}
  m.visible=true;m.position.set(0,0,0);m.rotation.set(0,0,0);m.scale.set(1,1,1);m.material.color.set(c);m.material.opacity=clamp(opacity,0,1);return m;
 }
 finish(){for(let i=this.used;i<this.items.length;i++)this.items[i].visible=false;}
}
// Cópias de um modelo (projéteis), por tipo e time.
class ModelPool{
 constructor(scene,make){this.scene=scene;this.make=make;this.free=new Map();this.used=[];}
 reset(){for(const [key,o] of this.used){o.visible=false;this.free.get(key).push(o);}this.used.length=0;}
 get(key){if(!this.free.has(key))this.free.set(key,[]);let o=this.free.get(key).pop();if(!o){o=this.make(key);this.scene.add(o);}o.visible=true;this.used.push([key,o]);return o;}
}
// Gradiente radial (centro forte, borda transparente) para marcas no chão e brilhos.
let softTexture=null;
function soft(){
 if(!softTexture&&typeof document!=='undefined'){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.55,'rgba(255,255,255,.65)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);softTexture=new T.CanvasTexture(c);}
 return softTexture;
}
function starGeometry(){const s=new T.Shape();for(let i=0;i<10;i++){const r=i%2?.42:1,a=i/10*TAU+Math.PI/2;s[i?'lineTo':'moveTo'](Math.cos(a)*r,Math.sin(a)*r);}const g=new T.ExtrudeGeometry(s,{depth:.25,bevelEnabled:false});g.center();return g;}

export class Arena3D{
 constructor({canvas,input,stage,onReady,onError}){
  this.canvas=canvas;this.input=input;this.stage=stage;this.entities=new Map();this.mode=0;this.yaw=0;this.polar=.30;this.last=0;this.ghostId='';this.ready=false;this.low=false;
  this.fx3=[];this.seenFields=new Set();
  try{
   const context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
   this.software=!context;
   if(context)this.renderer=new T.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'high-performance'});
   else{
    // A mesma cena, câmera e malhas 3D; só a rasterização vai para a CPU, com modelos mais simples.
    this.renderer=new Software3DRenderer();
    this.renderer.setPixelRatio=()=>{};this.renderer.getPixelRatio=()=>1;this.renderer.shadowMap={enabled:false};
    this.renderer.domElement.id='world3dSoftware';this.renderer.domElement.setAttribute('aria-label','Arena 3D em modo de compatibilidade');
    canvas.hidden=true;stage.prepend(this.renderer.domElement);
   }
  }catch(e){onError(e);return;}
  setLowDetail(this.software);
  this.renderer.setClearColor('#79c246');this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.NeutralToneMapping;this.renderer.toneMappingExposure=1.08;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.scene=new T.Scene();this.scene.background=new T.Color('#79c246');this.scene.fog=new T.Fog('#79c246',70,130);this.scene.scale.z=1.25;
  this.camera=new T.PerspectiveCamera(29,1,.1,150);this.target=new T.Vector3(0,.6,0);
  this.scene.add(this.software?new T.AmbientLight(0xffffff,.55):new T.HemisphereLight(0xffffff,0x7aa05a,1.55));
  this.sun=new T.DirectionalLight(0xfff0d8,2.5);this.sun.position.set(-10,22,10);this.sun.castShadow=true;
  this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-22,right:22,top:25,bottom:-25,near:1,far:65});this.sun.shadow.bias=-.0004;this.sun.shadow.normalBias=.05;if(this.software)this.sun.intensity=.7;this.scene.add(this.sun);
  const fill=new T.DirectionalLight(0xbfe0ff,this.software?.18:.55);fill.position.set(12,9,-13);this.scene.add(fill);
  this.makeArena();for(const o of this.scene.children)if(!o.isLight)o.userData.environment=true;
  this.raycaster=new T.Raycaster();this.plane=new T.Plane(up,0);this.pointer=new T.Vector2();
  this.labelLayer=document.createElement('div');this.labelLayer.className='worldLabels';stage.append(this.labelLayer);
  this.particles=new ParticleCloud(this.scene,true,this.software);this.smoke=new ParticleCloud(this.scene,false,this.software);
  const flat=g=>{g.rotateX(-Math.PI/2);return g;};
  this.rings=new Pool(this.scene,flat(new T.RingGeometry(.86,1,48)),{add:true,side:T.DoubleSide});
  const map=this.software?null:soft();
  this.discs=new Pool(this.scene,flat(new T.CircleGeometry(1,32)),{add:true,map});
  this.orbs=new Pool(this.scene,new T.SphereGeometry(1,16,12),{add:true});
  this.puffs=new Pool(this.scene,new T.IcosahedronGeometry(1,1),{toon:true});
  this.chunks=new Pool(this.scene,new T.DodecahedronGeometry(1,0),{toon:true});
  this.stars=new Pool(this.scene,starGeometry(),{add:true});
  this.beams=new Pool(this.scene,new T.CylinderGeometry(1,1,1,8,1,true),{add:true});
  this.decals=new Pool(this.scene,flat(new T.CircleGeometry(1,24)),{map});
  this.poolList=[this.rings,this.discs,this.orbs,this.puffs,this.chunks,this.stars,this.beams,this.decals];
  this.projectiles=new ModelPool(this.scene,key=>{const [kind,side]=key.split(':');return projectileModel(kind,side);});
  this.deployRing=new T.Mesh(flat(new T.RingGeometry(.9,1,48)),new T.MeshBasicMaterial({color:palette.ally,side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));this.deployRing.visible=false;this.scene.add(this.deployRing);
  this.zone=new T.Mesh(new T.PlaneGeometry(18,12),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.12,depthWrite:false}));this.zone.rotation.x=-Math.PI/2;this.zone.position.set(0,.06,7);this.zone.visible=false;this.scene.add(this.zone);
  this.ghostMat=new T.MeshBasicMaterial({color:0x7eeed8,transparent:true,opacity:.4,depthWrite:false});
  this.footGeo=flat(new T.RingGeometry(.74,1,40));
  this.installControls();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(stage);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.ready=false;onError(new Error('Contexto 3D interrompido'));});canvas.addEventListener('webglcontextrestored',()=>location.reload());
  this.ready=true;this.resize();onReady(this.software?'software-3d':'webgl-3d');
 }

 /* ── Arena cartoon: platô de grama no meio de um prado, rio azul e pontes de madeira ────── */
 makeArena(){
  const add=(o,order)=>{o.renderOrder=order;o.traverse(c=>{if(c.isMesh)c.receiveShadow=true;});this.scene.add(o);return o;};
  // Prado em volta (o que aparece fora da arena) e a borda de terra do platô.
  const ground=new Parts();
  ground.add(new T.PlaneGeometry(90,110),'#6fb845',0,-.6,0,1,1,1,-Math.PI/2,0,0,{outline:false});
  ground.box(0,-.48,0,19.3,.4,27.6,'#c99a5b',0,0,0,{outline:false});
  // Duas metades do platô; o canal do rio (z de -1 a 1) fica aberto entre elas.
  for(const s of [-1,1])ground.box(0,-.18,s*7.29,18.9,.34,12.5,'#9fd462',0,0,0,{outline:false});
  ground.box(0,-.34,0,18.6,.12,2.4,'#2f86c0',0,0,0,{outline:false});
  add(ground.finish(),-30);
  // Casas da arena em xadrez de dois verdes (instanciadas na GPU; na CPU viram um único bloco).
  const light='#9fdb62',dark='#91cf57';
  if(this.software){
   const g=new Parts();for(let z=0;z<26;z++)for(let x=0;x<18;x++){if(z===12||z===13)continue;g.add(new T.PlaneGeometry(1,1),(x+z)%2?dark:light,x-8.5,.012,z-12.5,1,1,1,-Math.PI/2,0,0,{outline:false});}
   add(g.finish(),-20);
  }else{
   const grass=new T.InstancedMesh(new T.PlaneGeometry(1,1).rotateX(-Math.PI/2),new T.MeshToonMaterial({color:0xffffff}),18*24);let n=0;
   for(let z=0;z<26;z++)for(let x=0;x<18;x++){if(z===12||z===13)continue;matrix.makeTranslation(x-8.5,.012,z-12.5);grass.setMatrixAt(n,matrix);color.set((x+z)%2?dark:light);grass.setColorAt(n,color);n++;}
   grass.instanceMatrix.needsUpdate=true;grass.instanceColor.needsUpdate=true;add(grass,-20);
  }
  // Caminhos de terra nas duas pistas, do rio até as torres.
  const paths=new Parts();
  for(const x of [-5.5,5.5])for(const z of [-1,1])for(let j=0;j<10;j++){const w=1.25+((j*7)%3)*.06;paths.box(x+((j*5)%3-1)*.05,.03,z*(1.55+j*1.05),w,.06,.88,j%2?'#efd69c':'#e8cb8c',0,((j*3)%5-2)*.03,0,{outline:false});}
  add(paths.finish(),-19);
  // Muro baixo de pedras arredondadas em volta da arena.
  const wall=new Parts();
  for(const x of [-9.25,9.25])for(let i=0;i<22;i++){const z=-13.1+i*1.25;wall.box(x,.2,z,.55,.42+(i%3)*.06,1.12,i%2?'#e4dccb':'#d2c8b2',0,(i%4-1.5)*.03,0);}
  for(const z of [-13.45,13.45])for(let i=0;i<15;i++){const x=-8.75+i*1.25;wall.box(x,.2,z,1.12,.42+(i%3)*.06,.55,i%2?'#d2c8b2':'#e4dccb',0,(i%4-1.5)*.03,0);}
  for(const x of [-9.25,9.25])for(const z of [-13.45,13.45])wall.box(x,.32,z,.75,.66,.75,'#c8bda6');
  add(wall.finish(),-17);
  // Rio com margens de pedra e água cartoon animada.
  const banks=new Parts();
  for(const z of [-1.08,1.08])for(let i=0;i<15;i++)banks.box(-8.4+i*1.2,.0,z,1.16,.16,.22,i%2?'#d9d0bd':'#cbc1aa',0,0,0,{outline:false});
  add(banks.finish(),-18);
  this.waterMat=new T.ShaderMaterial({uniforms:{time:{value:0}},
   vertexShader:`varying vec2 v;uniform float time;void main(){v=uv;vec3 p=position;p.z+=sin(p.x*2.1+time*1.4)*.02;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
   fragmentShader:`varying vec2 v;uniform float time;void main(){
    float y=abs(v.y-.5)*2.0;vec3 deep=vec3(.16,.58,.88),light=vec3(.38,.80,.98);
    vec3 c=mix(light,deep,smoothstep(.0,.9,1.0-y));
    float ripple=sin(v.x*46.0+time*1.8+sin(v.y*9.0+time*1.3)*2.4);c=mix(c,vec3(.72,.93,1.0),step(.86,ripple)*.55);
    float glint=step(.985,sin(v.x*130.0-time*2.5)*sin(v.y*18.0+time*1.7));c=mix(c,vec3(1.0),glint*.7);
    float foam=smoothstep(.72,.92,y)+step(.9,y)*.3;foam*=.7+.3*step(.0,sin(v.x*70.0-time*3.0));c=mix(c,vec3(.96,.99,1.0),clamp(foam,0.0,1.0));
    gl_FragColor=vec4(c,1.0);}`});
  const water=new T.Mesh(new T.PlaneGeometry(18.2,2.05,this.software?1:64,this.software?1:4),this.software?new T.MeshBasicMaterial({color:0x3fb2e8}):this.waterMat);water.rotation.x=-Math.PI/2;water.position.y=-.08;add(water,-18);
  // Pontes de madeira com postes e corda.
  for(const x of [-5.5,5.5]){
   const b=new Parts();
   b.box(x,-.02,0,2.05,.16,2.7,palette.woodDark,0,0,0,{outline:false});
   for(let i=0;i<9;i++)b.box(x+((i%3)-1)*.03,.1,-1.2+i*.3,2.1,.1,.27,i%2?'#c58a52':'#b97d48',0,((i%3)-1)*.02,0);
   for(const s of [-1,1]){for(const z of [-1.3,0,1.3]){b.cyl(x+s*1.08,.3,z,.08,.1,.6,palette.woodDark,10);b.ball(x+s*1.08,.62,z,.1,palette.wood);}
    b.capsule(x+s*1.08,.5,0,.035,2.6,'#e8d4a6',Math.PI/2,0,0);}
   add(b.finish(),-16);
  }
  // Entorno: árvores, arbustos, pedras, flores e bandeiras de cada time.
  const d=new Parts();
  const tree=(x,z,s=1)=>{d.cyl(x,.35*s,z,.16*s,.24*s,1.0*s,palette.woodDark,8);d.ball(x,1.35*s,z,.85*s,'#4fae37',1,1,1,undefined,11);d.ball(x-.5*s,1.15*s,z+.25*s,.6*s,'#5fbe40',1,1,1,undefined,9);d.ball(x+.45*s,1.25*s,z-.2*s,.62*s,'#67c847',1,1,1,undefined,9);d.ball(x+.1*s,1.85*s,z+.05*s,.55*s,'#78d453',1,1,1,undefined,9);};
  const nol={outline:false},bush=(x,z,s=1)=>{d.ball(x,.15,z,.42*s,'#4fae37',1,.8,1,undefined,9);d.ball(x+.35*s,.12,z+.1,.32*s,'#5fbe40',1,.8,1,nol,8);d.ball(x-.3*s,.1,z-.05,.3*s,'#67c847',1,.8,1,nol,8);};
  const rock=(x,z,s=1)=>{d.ball(x,.0,z,.45*s,'#bdb6a8',1.2,.7,1,undefined,8);d.ball(x+.35*s,-.05,z+.2*s,.28*s,'#d2ccc0',1,.7,1,nol,7);};
  const flowers=(x,z)=>{for(let i=0;i<5;i++){const a=i*2.4,r=.35+(i%2)*.25;d.ball(x+Math.cos(a)*r,-.15,z+Math.sin(a)*r,.09,['#ffffff','#ffd94a','#ff8fb3'][i%3],1,1,1,{outline:false},8);}};
  for(const x of [-11.4,11.4])for(const z of [-12,-6.5,-1.8,3,7.8,12.5])tree(x+(z>0?.3:-.2),z,.95+((z*3)%2+2)%2*.12);
  for(const x of [-10.3,10.3])for(const z of [-9.5,-4,5.5,10])bush(x,z,.9);
  for(const [x,z] of [[-10.4,-.2],[10.5,.4],[-10.2,13.8],[10.1,-14.1]])rock(x,z);
  for(const [x,z] of [[-10.6,-11],[10.6,-7.6],[-10.5,8.6],[10.4,12.2],[-10.6,3.6],[10.7,-2.8]])flowers(x,z);
  for(const z of [-16,16])for(let i=0;i<7;i++){const x=-9+i*3;if(i%2)tree(x,z+(i%3-1)*.6,.9);else bush(x,z-.4,1.1);}
  for(const [z,c] of [[-14.6,palette.foe],[14.6,palette.ally]])for(const x of [-3.2,3.2]){d.cyl(x,1.25,z,.05,.07,2.6,palette.woodDark,8);d.ball(x,2.6,z,.1,palette.gold);d.at(x+.42,2.1,z,0,0,0,q=>{q.box(0,0,0,.8,.55,.05,c);q.shape([[-.4,-.27],[.4,-.27],[.4,-.5],[0,-.36],[-.4,-.5]],.04,c,0,0,0);});}
  add(d.finish(),-14);
  if(this.software)this.scene.traverse(o=>{if(o.userData.outline)o.visible=false;});
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

 /* ── Tropas e torres ───────────────────────────────────────────────────────────────────── */
 addEntity(key,e){
  const isTower=e.kind==='tower',model=isTower?towerModel(e.side,e.king):unitModel(e.card.art,e.side);this.scene.add(model);
  const foot=new T.Mesh(this.footGeo,new T.MeshBasicMaterial({color:palette[e.side],transparent:true,opacity:isTower?0:.6,depthWrite:false}));this.scene.add(foot);
  const bar=this.label(key,model,e);const entry={model,foot,bar,oldX:e.x,oldY:e.y,angle:e.side==='ally'?Math.PI:0,rig:{},landed:!(e.deploy>0),alive:e.alive!==false};
  for(const name of ['leftLeg','rightLeg','leftArm','rightArm','leftWing','rightWing','head','prop','turret'])entry.rig[name]=model.getObjectByName(name);
  if(isTower){entry.turretY=entry.rig.turret?.position.y||0;entry.ruin=rubbleModel(e.king);entry.ruin.visible=false;entry.ruin.position.copy(world(e.x,e.y));this.scene.add(entry.ruin);}
  this.entities.set(key,entry);return entry;
 }
 updateEntities(G,time,dt){const seen=new Set(),battle=['battle','over'].includes(G.state);
  for(const e of [...G.towers,...G.units]){
   if(e.dead)continue;const tower=e.kind==='tower',key=tower?'t:'+e.side+':'+e.lane+':'+e.king:'u:'+e.id+':'+e.card.id+':'+e.side;seen.add(key);const n=this.entities.get(key)||this.addEntity(key,e),m=n.model;
   if(tower&&!e.alive){
    if(n.alive&&battle)this.burst(e.x,e.y,e.king?1.6:1.25,true);n.alive=false;
    m.visible=false;n.ruin.visible=true;n.bar.el.hidden=true;n.foot.visible=false;continue;
   }
   n.alive=true;m.visible=true;if(n.ruin)n.ruin.visible=false;
   const lift=tower?0:Math.max(0,(e.z||0)/64)+(e.air?.55:0);
   m.position.copy(world(e.x,e.y));m.position.y+=lift;
   if(!tower){
    animateRig(n,e,time,dt,G.state==='menu');
    // Poeira quando a tropa termina de cair do céu.
    const spawn=1-(e.deploy||0)/(e.card.deploy||1);
    if(!n.landed&&spawn>=.3&&!e.air){n.landed=true;this.dust(e.x,e.y,(e.r||24)/64);}else if(spawn>=.3)n.landed=true;
    if(e.stun>0)this.stunStars(m,time,e.id);
   }else if(n.rig.turret){n.rig.turret.rotation.y=Math.PI/2-(e.aim||0);const k=e.recoil||0;n.rig.turret.position.set(Math.cos(e.aim||0)*-k*.16,n.turretY,Math.sin(e.aim||0)*-k*.16);}
   n.oldX=e.x;n.oldY=e.y;n.foot.position.set(m.position.x-0,.05,m.position.z);const r=tower?0:(e.r||24)/64;n.foot.scale.setScalar(r*1.6);n.foot.visible=!tower&&!e.air;
   const show=tower||e.hp<e.maxHp;n.bar.el.hidden=!show;
   if(show){m.getWorldPosition(v3);v3.y+=(m.userData.height||2.5)+.17;v3.project(this.camera);n.bar.el.style.transform=`translate(${(v3.x*.5+.5)*this.w}px,${(-v3.y*.5+.5)*this.h}px) translate(-50%,-100%)`;const value=Math.ceil(Math.max(0,e.hp));if(n.bar.value!==value){n.bar.value=value;n.bar.text.textContent=tower?value:'';n.bar.fill.style.transform=`scaleX(${clamp(e.hp/e.maxHp,0,1)})`;n.bar.fill.style.background=palette[e.side];}n.bar.el.hidden=Math.abs(v3.x)>1||Math.abs(v3.y)>1;}
  }
  for(const [key,n] of this.entities)if(!seen.has(key)){
   n.bar.el.hidden=true;n.foot.visible=false;
   if(key.startsWith('u:')&&battle){if(!animateDeath(n,dt))continue;const p=n.model.position;this.poof((p.x+9)*TILE,(p.z+13)*TILE,p.y,n.model.userData.height||1.6);}
   this.scene.remove(n.model,n.foot);n.foot.material.dispose();
   // Torres são montadas na hora (não vêm do cache): libera a geometria delas.
   if(n.ruin){this.scene.remove(n.ruin);for(const o of [n.model,n.ruin])o.traverse(c=>{if(c.isMesh)c.geometry.dispose();});}n.bar.el.remove();this.entities.delete(key);
  }
 }

 /* ── Efeitos 3D próprios (puff de morte, poeira, estilhaços, clarão) ───────────────────── */
 spawn(o){if(this.fx3.length<220)this.fx3.push({t:0,...o});}
 poof(x,y,h,size){for(let i=0;i<7;i++){const a=i/7*TAU;this.spawn({kind:'puff',x,y,h:h+.3+i%3*.15,vx:Math.cos(a)*1.1,vz:Math.sin(a)*1.1,vy:.8+(i%3)*.3,r:.22*size,life:.55});}
  this.spawn({kind:'sparkle',x,y,h:h+.6,life:.45,c:'#fff6c8'});}
 dust(x,y,r){for(let i=0;i<6;i++){const a=i/6*TAU;this.spawn({kind:'puff',x:x+Math.cos(a)*r*40,y:y+Math.sin(a)*r*40,h:.1,vx:Math.cos(a)*1.4,vz:Math.sin(a)*1.4,vy:.35,r:.16+r*.15,life:.45});}
  this.spawn({kind:'shock',x,y,r0:.2,r1:r*2.6+.6,life:.35,c:'#ffffff'});}
 burst(x,y,size,tower=false){
  this.spawn({kind:'flash',x,y,h:.9*size,r:.8*size,life:.22,c:tower?'#ffe2a6':'#ffb35c'});
  this.spawn({kind:'shock',x,y,r0:.4,r1:3.2*size,life:.5,c:'#ffd27a'});
  for(let i=0;i<10;i++){const a=i/10*TAU+i;this.spawn({kind:'puff',x,y,h:.3+(i%3)*.3,vx:Math.cos(a)*2.6*size,vz:Math.sin(a)*2.6*size,vy:1.1+(i%4)*.35,r:.2*size,life:.65});}
  if(tower)for(let i=0;i<12;i++){const a=i*2.4;this.spawn({kind:'chunk',x,y,h:1.5,vx:Math.cos(a)*(2+i%3),vz:Math.sin(a)*(2+i%3),vy:4+(i%4),r:.12+(i%3)*.06,life:1.1,c:i%2?palette.stone:palette.stoneDark});}
 }
 stunStars(m,time,id){const h=m.position.y+(m.userData.height||1.6)*.98;for(let i=0;i<3;i++){const a=time*5+i*TAU/3+id;const s=this.stars.get('#ffe14d',.95);s.position.set(m.position.x+Math.cos(a)*.38,h+Math.sin(a*2)*.05,m.position.z+Math.sin(a)*.38);s.scale.setScalar(.11);s.rotation.set(0,a*2,0);}}
 updateFx3(dt){
  for(let i=this.fx3.length-1;i>=0;i--){const f=this.fx3[i];f.t+=dt;const k=f.t/f.life;if(k>=1){this.fx3.splice(i,1);continue;}
   const x=f.x/64-9,z=f.y/64-13;
   if(f.kind==='puff'){const m=this.puffs.get('#fbfbf4',.85*(1-k)*(1-k*.5));m.position.set(x+f.vx*f.t*.6,f.h+f.vy*f.t*.7,z+f.vz*f.t*.6);m.scale.setScalar(f.r*(.6+k*1.3));m.rotation.set(f.t*2,f.t*3,0);}
   else if(f.kind==='chunk'){const m=this.chunks.get(f.c,1);m.position.set(x+f.vx*f.t,Math.max(.08,f.h+f.vy*f.t-9*f.t*f.t),z+f.vz*f.t);m.scale.setScalar(f.r);m.rotation.set(f.t*7,f.t*5,0);}
   else if(f.kind==='flash'){const m=this.orbs.get(f.c,(1-k)*(1-k)*.55);m.position.set(x,f.h,z);m.scale.setScalar(f.r*(.5+k*.7));}
   else if(f.kind==='shock'){const m=this.rings.get(f.c,(1-k)*.7);m.position.set(x,.07,z);m.scale.setScalar(mix(f.r0,f.r1,1-(1-k)*(1-k)));}
   else if(f.kind==='sparkle'){for(let j=0;j<4;j++){const a=j*TAU/4+k*3,s=this.stars.get(f.c,1-k);s.position.set(x+Math.cos(a)*(.25+k*.5),f.h+k*.6,z+Math.sin(a)*(.25+k*.5));s.scale.setScalar(.08*(1-k*.5));s.rotation.set(0,a,0);}}
  }
 }

 /* ── Efeitos do engine: projéteis, feitiços, raios, decalques ──────────────────────────── */
 ring(x,y,r,c,a=1,height=.075){const m=this.rings.get(c,a);m.position.set(x/64-9,height,y/64-13);m.scale.setScalar(Math.max(.03,r));return m;}
 disc(x,y,r,c,a=1){const m=this.discs.get(c,a);m.position.set(x/64-9,.06,y/64-13);m.scale.setScalar(Math.max(.03,r));return m;}
 orb(x,y,h,r,c,a=1){const m=this.orbs.get(c,a);m.position.set(x/64-9,h,y/64-13);m.scale.setScalar(Math.max(.025,r));return m;}
 beam(a1,b,r,c,a=1){const m=this.beams.get(c,a);v4.subVectors(b,a1);const length=v4.length();m.position.copy(a1).addScaledVector(v4,.5);m.quaternion.setFromUnitVectors(up,v4.normalize());m.scale.set(r,length,r);return m;}
 effects(G,FX,time,quality,dt){this.projectiles.reset();
  // Ondas de choque no chão (anéis do engine).
  for(const r of FX.rings.slice(-32)){const k=1-clamp(r.life/(r.max||.4),0,1);const radius=mix(r.r0,r.r1,k)/64;this.ring(r.x,r.y,radius,r.col,(1-k)*.6);if(quality>.5&&radius>.5)this.disc(r.x,r.y,radius,r.col,(1-k)*.12);}
  // Projéteis com modelo 3D apontando na direção do voo (arco das bombas incluído).
  for(const p of G.projs.slice(-100)){
   const k=clamp(p.t/p.dur,0,1),lift=mix(p.lift0||45,p.lift1||25,k),h=.25+((p.z||0)+lift)/64,D=Math.max(1,Math.hypot(p.tx-p.sx,p.ty-p.sy));
   const kind=['arrow','bolt','bomb','ball'].includes(p.kind)?p.kind:null;
   if(!kind){this.orb(p.x,p.y+lift,h,(p.r||3)/64*1.6,p.col||'#ffca76');continue;}
   const m=this.projectiles.get(kind+':'+(p.side||'ally')),ang=p.ang||0;
   const slope=((PROJ_ARC[kind]||0)*Math.PI*Math.cos(k*Math.PI)*D*.5+((p.lift1||25)-(p.lift0||45)))/D;
   m.position.set(p.x/64-9,h,(p.y+lift)/64-13);
   if(kind==='bomb'||kind==='ball'){m.rotation.set(time*9,ang,0);}
   else m.rotation.set(-Math.atan(slope)*.8,Math.PI/2-ang,0,'YXZ');
   if(kind==='bolt'&&quality>.5)this.orb(p.x,p.y+lift,h,.09,'#ffe7a8',.55);
  }
  for(const d of FX.decals.slice(-28)){const m=this.decals.get(d.col,Math.min(.28,(d.a||.2)*Math.min(1,d.life/2)));m.position.set(d.x/64-9,.05,d.y/64-13);m.scale.setScalar(d.r/64);}
  // Feitiços: Bólide cai do céu com rastro; Estalo marca o chão antes dos raios.
  const live=new Set();
  for(const f of G.fields){
   if(!Number.isFinite(f.x)||!Number.isFinite(f.y))continue;live.add(f);
   const R=f.s?.raio||2,k=clamp(f.t/(f.dur||1),0,1);
   if(f.kind==='meteor'){
    this.ring(f.x,f.y,R,'#ff9a3c',.45+.25*Math.sin(time*18));this.disc(f.x,f.y,R*(1-k*.4),'#ff7a2a',.08+k*.12);
    const fall=1-k,xx=f.x-fall*160,hh=.4+fall*fall*10;
    this.orb(xx,f.y,hh,.42,'#ffe9a8',1);this.orb(xx,f.y,hh,.62,'#ff8a2e',.6);this.orb(xx,f.y,hh,.9,'#ff5a14',.22);
    for(let j=1;j<=5;j++){const b=j/5;this.orb(xx-b*60,f.y,hh+b*1.6,.5*(1-b*.7),j%2?'#ffb35c':'#ff6a1f',.5*(1-b));}
   }else if(f.kind==='zapmark'){this.ring(f.x,f.y,R,'#9fe8ff',.6+.3*Math.sin(time*40));this.disc(f.x,f.y,R,'#9fe8ff',.1);}
   else this.ring(f.x,f.y,R,f.sd==='ally'?palette.ally:palette.foe,.5);
  }
  // Quando um feitiço some, ele acabou de explodir: clarão e onda 3D.
  for(const f of this.seenFields)if(!live.has(f)){const R=(f.s?.raio||2);
   if(f.kind==='meteor'){this.burst(f.x,f.y,R*.55);for(let i=0;i<8;i++){const a=i*.8;this.spawn({kind:'chunk',x:f.x,y:f.y,h:.3,vx:Math.cos(a)*3,vz:Math.sin(a)*3,vy:3+(i%3),r:.1,life:.8,c:'#5b3d2a'});}}
   else if(f.kind==='zapmark'){this.spawn({kind:'flash',x:f.x,y:f.y,h:.8,r:R*.4,life:.18,c:'#c9f4ff'});this.spawn({kind:'shock',x:f.x,y:f.y,r0:.3,r1:R*1.2,life:.35,c:'#9fe8ff'});}}
  this.seenFields=live;
  // Raios: do céu até o chão quando vêm de cima; entre unidades quando são horizontais.
  for(const bolt of FX.bolts){const seg=bolt.seg;if(!seg?.length)continue;const fade=clamp(bolt.life/(bolt.max||1),0,1);
   const first=seg[0],last=seg[seg.length-1],sky=first.y<last.y-120;
   const pt=s=>sky?new T.Vector3(s.x/64-9,.15+(last.y-s.y)/64*1.6,last.y/64-13):new T.Vector3(s.x/64-9,.7,s.y/64-13);
   for(let j=1;j<seg.length;j++){const a=pt(seg[j-1]),b=pt(seg[j]);this.beam(a,b,.03,'#ffffff',fade);if(quality>.5)this.beam(a,b,.09,bolt.col||'#9fe8ff',fade*.4);}
  }
  this.updateFx3(dt);
  this.particles.update(FX.parts,this.h,this.renderer.getPixelRatio(),quality);this.smoke.update(FX.parts,this.h,this.renderer.getPixelRatio(),quality);
  for(const p of this.poolList)p.finish();
 }
 render({G,FX,UI,CARD,PREF,QUALITY},time){if(!this.ready)return;
  if(this.software&&this.last&&time-this.last<1/30)return;
  const dt=Math.min(.1,time-(this.last||time));this.last=time;
  if(this.low!==PREF.light){this.low=PREF.light;this.renderer.shadowMap.enabled=!this.low;this.resize();}
  // Contorno some no modo leve e quando o jogo detecta quadros atrasados (QUALITY baixo).
  const outlines=!this.low&&!this.software&&QUALITY>.45;
  if(this.outlines!==outlines){this.outlines=outlines;materials.outline.visible=outlines;}
  if(this.cameraBase){this.camera.position.copy(this.cameraBase);if(PREF.fx&&FX.shake>.5){this.camera.position.x+=Math.sin(time*49)*FX.shake*.004;this.camera.position.y+=Math.cos(time*43)*FX.shake*.003;}this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
  this.waterMat.uniforms.time.value=time;
  for(const p of this.poolList)p.reset();
  this.updateEntities(G,time,dt);this.effects(G,FX,time,QUALITY,dt);
  const show=G.state==='battle'&&UI.holding&&Number.isFinite(UI.wx)&&Number.isFinite(UI.wy);this.deployRing.visible=!!show;this.zone.visible=!!show&&CARD[UI.holding.id]?.tipo!=='feitico';
  if(this.ghost)this.ghost.visible=false;
  if(show){const card=CARD[UI.holding.id],r=card.feitico?.raio||Math.max(.65,card.raio||.5);this.deployRing.position.set(UI.wx/64-9,.08,UI.wy/64-13);this.deployRing.scale.setScalar(r);this.deployRing.material.color.set(UI.valid?'#b0ffe0':'#ff7065');
   if(card.tipo!=='feitico'){
    if(this.ghostId!==card.id){if(this.ghost)this.scene.remove(this.ghost);this.ghost=unitModel(card.art,'ally');this.ghost.traverse(o=>{if(o.userData.outline)o.visible=false;else if(o.isMesh)o.material=this.ghostMat;});this.scene.add(this.ghost);this.ghostId=card.id;}
    this.ghost.visible=true;this.ghost.position.copy(world(UI.wx,UI.wy));if(card.ar)this.ghost.position.y+=.55;this.ghost.rotation.y=Math.PI;this.ghostMat.color.set(UI.valid?'#9cf5d8':'#ff7770');
   }
  }
  this.renderer.render(this.scene,this.camera);this.framesRendered=(this.framesRendered||0)+1;
 }
}
// Arco de cada projétil (o mesmo de PROJ no engine.js) para inclinar o modelo na subida e na descida.
const PROJ_ARC={arrow:0,bolt:0,bomb:1,ball:.55};
window.createArena3D=options=>new Arena3D(options);

/* ── Retrato 3D das cartas: a mão e o baralho mostram o mesmo modelo da arena ─────────────
   Um renderizador pequeno e separado fotografa cada tropa uma vez numa pose de ação.
   Sem WebGL devolve null e o engine continua com a arte 2D. */
const portraits=new Map();let portraitKit=null;
function cardPortrait(art,side='ally'){
 const key=art+':'+side;if(portraits.has(key))return portraits.get(key);
 let out=null;
 try{
  if(!portraitKit){
   const canvas=document.createElement('canvas');canvas.width=220;canvas.height=240;
   const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
   renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1.1;renderer.setClearColor(0x000000,0);
   const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x7aa05a,1.7));const sun=new T.DirectionalLight(0xfff0d8,2.4);sun.position.set(2,4,5);scene.add(sun);
   portraitKit={renderer,scene,camera:new T.PerspectiveCamera(26,220/240,.1,50)};
  }
  const {renderer,scene,camera}=portraitKit,model=unitModel(art,side);scene.add(model);
  const rig={};for(const name of ['leftLeg','rightLeg','leftArm','rightArm','leftWing','rightWing','head','prop'])rig[name]=model.getObjectByName(name);
  // Pose de ação: meio da preparação do ataque, virado 3/4 para a câmera.
  const n={model,rig,oldX:0,oldY:0,angle:.45},e={id:3,x:0,y:0,heading:Math.PI/2-.45,ph:1.2,moving:false,card:{art,deploy:1},attackWindup:.07,attackPrep:.16,atk:0,hurt:0,deploy:0,air:art==='bat'};
  for(let i=0;i<40;i++){model.position.set(0,art==='bat'?.4:0,0);animateRig(n,e,.7,1/30);}
  const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
  const dist=Math.max(size.y*1.05,size.x*.95)/(2*Math.tan(T.MathUtils.degToRad(13)))*1.18;
  camera.position.set(center.x,center.y+size.y*.12,center.z+dist);camera.lookAt(center.x,center.y-size.y*.02,center.z);
  renderer.render(scene,camera);
  out=document.createElement('canvas');out.width=220;out.height=240;out.getContext('2d').drawImage(renderer.domElement,0,0);
  scene.remove(model);
 }catch{out=null;}
 portraits.set(key,out);return out;
}
window.cardPortrait3D=cardPortrait;
