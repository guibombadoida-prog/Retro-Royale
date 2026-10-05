'use strict';
// Kenney Impact Sounds, CC0. Existing synthesized sounds remain the instant fallback.
(() => {
 const files=['impactMetal_light_000','impactMetal_light_001','impactGeneric_light_000','impactWood_heavy_000','impactPlate_heavy_000','impactBell_heavy_000','footstep_grass_000','footstep_grass_001'];
 const sounds={sword:[0,1],punch:[2],cannon:[3],boom:[4],tower:[4],bell:[5],die:[2],deploy:[3],step:[6,7]};
 const buffers=new Map(),last=new Map();let loading=false,voices=0,stepAt=0;
 const baseInit=AU.init.bind(AU),baseSfx=AU.sfx.bind(AU);
 AU.init=function(){
  baseInit();if(!this.ctx)return;if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
  if(loading)return;loading=true;
  for(const name of files)fetch('/game/assets/sfx/'+name+'.ogg').then(r=>{if(!r.ok)throw new Error('sfx');return r.arrayBuffer();}).then(b=>this.ctx.decodeAudioData(b)).then(b=>buffers.set(name,b)).catch(()=>{});
 };
 AU.sfx=function(name,volume=1){
  const choices=sounds[name],ready=choices?.map(i=>buffers.get(files[i])).filter(Boolean);
  if(!this.ctx||!this.on)return;
  if(!ready?.length){baseSfx(name,volume);return;}
  const now=this.ctx.currentTime,minGap=name==='step'?.17:.035;
  if(voices>=12||now-(last.get(name)??-1)<minGap)return;last.set(name,now);
  const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=ready[Math.floor(Math.random()*ready.length)];source.playbackRate.value=.91+Math.random()*.18;
  gain.gain.value=Math.min(.65,Math.max(0,volume))*(name==='step'?.23:.65);source.connect(gain);gain.connect(this.master);voices++;
  source.onended=()=>{voices--;source.disconnect();gain.disconnect();};source.start();
  if(name==='boom'||name==='tower')baseSfx(name,volume*.45);
 };
 AU.stepSfx=function(game){
  if(game.state!=='battle'||!this.ctx||!this.on)return;
  const now=this.ctx.currentTime;if(now-stepAt<.25)return;
  if(game.units.some(u=>u.moving&&!u.air&&!u.dead&&u.deploy<=0&&u.side==='ally'&&(!NET.active||u.playerId===NET.playerId))){stepAt=now;this.sfx('step',.3);}
 };
})();
