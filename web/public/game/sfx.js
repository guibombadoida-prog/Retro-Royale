'use strict';
// Sons gravados: Kenney Impact Sounds (CC0) nos efeitos gerais e o pacote de sons das tropas do dono
// (assets/sfx/tropas, só efeitos, sem as músicas). O som sintetizado do engine continua como reserva
// instantânea enquanto os arquivos carregam ou se algum falhar.
(() => {
 const files=['impactMetal_light_000','impactMetal_light_001','impactGeneric_light_000','impactWood_heavy_000','impactPlate_heavy_000','impactBell_heavy_000','footstep_grass_000','footstep_grass_001'];
 const sounds={sword:[0,1],punch:[2],cannon:[3],boom:[4],tower:[4],bell:[5],die:[2],deploy:[3],step:[6,7]};
 // Som de cada carta por momento (AU.unit no engine.js): um arquivo da lista é sorteado.
 const DIE=['comum/npc_die_02'],seq=(base,from,to,end='')=>Array.from({length:to-from+1},(_,i)=>base+String(from+i).padStart(2,'0')+end);
 const TROOPS={
  cavaleiro:{deploy:['cavaleiro/knight_deploy_31111'],swing:seq('cavaleiro/knight_attack_start_',1,5),hit:['cavaleiro/knight_hit_01'],die:['cavaleiro/knight_death_01'],step:seq('cavaleiro/knight_footstep_',1,4)},
  arqueiras:{deploy:['arqueiras/clash_archer_deploy_01'],attack:['arqueiras/archer_attack_07'],impact:['arqueiras/arrow_hit_13'],die:DIE,step:['arqueiras/archer_step_06']},
  goblins:{deploy:['goblins/goblin_deploy_14'],swing:seq('goblins/gob_attack_',1,3,'v2'),hit:seq('goblins/footman_attack_hit_',1,4),die:DIE,step:[1,2,3,4,5].map(n=>'goblins/gob_step_01_v'+n)},
  gigante:{deploy:['gigante/giant_deploy_01'],swing:seq('gigante/giant_attack_swing_',1,3),hit:['gigante/giant_hit_01'],die:DIE,step:['gigante/demon_step_01']},
  bombardeiro:{deploy:['bombardeiro/skeleton_deploy_03'],attack:['bombardeiro/skeleton_atk_03'],die:DIE,step:['bombardeiro/skeleton_step_02']},
  morcegos:{deploy:['morcegos/bat_deploy_01'],hit:['morcegos/bat_atk_01'],die:DIE,step:['morcegos/bat_fly_01']},
  estalo:{cast:['estalo/zap_02']}
 };
 // Volume de cada momento (o pacote já vem nivelado perto de 0 dB).
 const GAIN={deploy:.5,swing:.32,attack:.4,hit:.42,impact:.3,die:.4,cast:.6,step:.16};
 const troopFiles=[...new Set(Object.values(TROOPS).flatMap(t=>Object.values(t).flat()))];
 const buffers=new Map(),last=new Map();let loading=false,voices=0,stepAt=0;
 const baseInit=AU.init.bind(AU),baseSfx=AU.sfx.bind(AU),baseUnit=AU.unit.bind(AU);
 const load=(key,url)=>fetch(url).then(r=>{if(!r.ok)throw new Error('sfx');return r.arrayBuffer();}).then(b=>AU.ctx.decodeAudioData(b)).then(b=>buffers.set(key,b)).catch(()=>{});
 // Toca um dos arquivos com leve variação de altura; limita vozes simultâneas e repetição do mesmo som.
 function play(list,volume,key,minGap){
  const now=AU.ctx.currentTime;
  if(voices>=12||now-(last.get(key)??-1)<minGap)return;last.set(key,now);
  const source=AU.ctx.createBufferSource(),gain=AU.ctx.createGain();source.buffer=list[Math.floor(Math.random()*list.length)];source.playbackRate.value=.94+Math.random()*.12;
  gain.gain.value=volume;source.connect(gain);gain.connect(AU.master);voices++;
  source.onended=()=>{voices--;source.disconnect();gain.disconnect();};source.start();
 }
 AU.init=function(){
  baseInit();if(!this.ctx)return;if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
  if(loading)return;loading=true;
  for(const name of files)load(name,'assets/sfx/'+name+'.ogg');
  for(const name of troopFiles)load(name,'assets/sfx/tropas/'+name+'.ogg');
 };
 AU.sfx=function(name,volume=1){
  const choices=sounds[name],ready=choices?.map(i=>buffers.get(files[i])).filter(Boolean);
  if(!this.ctx||!this.on)return;
  if(!ready?.length){baseSfx(name,volume);return;}
  play(ready,Math.min(.65,Math.max(0,volume))*(name==='step'?.23:.65),name,name==='step'?.17:.035);
  if(name==='boom'||name==='tower')baseSfx(name,volume*.45);
 };
 AU.unit=function(id,event,fallback,volume=1){
  if(!this.ctx||!this.on)return;
  const ready=TROOPS[id]?.[event]?.map(f=>buffers.get(f)).filter(Boolean);
  if(!ready?.length){baseUnit(id,event,fallback,volume);return;}
  play(ready,GAIN[event]??.4,id+':'+event,event==='step'?.12:.05);
 };
 // Passos (ou bater de asas) de uma tropa sua andando, no máximo a cada 0,25 s.
 AU.stepSfx=function(game){
  if(game.state!=='battle'||!this.ctx||!this.on)return;
  const now=this.ctx.currentTime;if(now-stepAt<.25)return;
  const mine=game.units.filter(u=>u.moving&&!u.dead&&u.deploy<=0&&u.side==='ally'&&(!NET.active||u.playerId===NET.playerId));
  if(!mine.length)return;stepAt=now;
  const u=mine[Math.floor(Math.random()*mine.length)];this.unit(u.card?.id,'step',u.air?null:'step',.3);
 };
})();
