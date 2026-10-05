import { Color, Vector3 } from 'three';
import { Projector, RenderableFace, RenderableLine, RenderableSprite } from 'three/addons/renderers/Projector.js';

// CPU rasterization of the same 3D triangle meshes. The environment is cached
// until the perspective camera moves; animation and raycasting stay in 3D.
export class Software3DRenderer {
 constructor(){
  this.domElement=document.createElement('canvas');this.ctx=this.domElement.getContext('2d',{alpha:false});
  this.back=document.createElement('canvas');this.bg=this.back.getContext('2d',{alpha:false});
  this.projector=new Projector();this.shadowMap={enabled:false};this.tint=new Color();this.sun=new Vector3(-12,23,9).normalize();this.cacheKey='';
 }
 setPixelRatio(){} getPixelRatio(){return 1;}
 setClearColor(c){this.background=new Color(c);}
 setSize(w,h){this.w=w;this.h=h;this.domElement.width=this.back.width=w;this.domElement.height=this.back.height=h;this.cacheKey='';}
 draw(ctx,elements){const w=this.w/2,h=this.h/2,c=this.tint;
  for(const e of elements){const m=e.material;if(!m||m.opacity===0)continue;ctx.globalAlpha=m.opacity??1;
   if(e instanceof RenderableFace){
    const a=e.v1.positionScreen,b=e.v2.positionScreen,d=e.v3.positionScreen;
    if(a.z < -1||a.z>1||b.z < -1||b.z>1||d.z < -1||d.z>1)continue;
    c.copy(m.color||this.background);if(m.vertexColors)c.multiply(e.color);
    if(!m.isMeshBasicMaterial)c.multiplyScalar(.48+Math.max(0,e.normalModel.dot(this.sun))*.72);
    ctx.fillStyle=c.getStyle();ctx.beginPath();ctx.moveTo(w+a.x*w,h-a.y*h);ctx.lineTo(w+b.x*w,h-b.y*h);ctx.lineTo(w+d.x*w,h-d.y*h);ctx.closePath();ctx.fill();
   }else if(e instanceof RenderableLine){
    const a=e.v1.positionScreen,b=e.v2.positionScreen;c.copy(m.color);if(m.vertexColors)c.multiply(e.vertexColors[0]);ctx.strokeStyle=c.getStyle();ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(w+a.x*w,h-a.y*h);ctx.lineTo(w+b.x*w,h-b.y*h);ctx.stroke();
   }else if(e instanceof RenderableSprite){
    ctx.fillStyle=m.color.getStyle();const r=Math.max(.6,(m.size||.1)*e.scale.x*w*.5);ctx.beginPath();ctx.arc(w+e.x*w,h-e.y*h,r,0,Math.PI*2);ctx.fill();
   }
  }ctx.globalAlpha=1;
 }
 render(scene,camera){
  scene.updateMatrixWorld();camera.updateMatrixWorld();const key=camera.matrixWorld.elements.join(',')+camera.projectionMatrix.elements.join(',');
  const environment=scene.children.filter(o=>o.userData.environment&&o.visible);
  const dynamic=scene.children.filter(o=>!o.userData.environment&&!o.isLight&&o.visible);
  if(this.cacheKey!==key){
   for(const o of dynamic)o.visible=false;this.bg.fillStyle=(scene.background||this.background).getStyle();this.bg.fillRect(0,0,this.w,this.h);
   this.draw(this.bg,this.projector.projectScene(scene,camera,true,true).elements);for(const o of dynamic)o.visible=true;this.cacheKey=key;
  }
  this.ctx.drawImage(this.back,0,0);for(const o of environment)o.visible=false;
  this.draw(this.ctx,this.projector.projectScene(scene,camera,true,true).elements);for(const o of environment)o.visible=true;
 }
}
