'use strict';
const GAME_MODES={'1v1':[1,1],'2v1':[2,1],'2v2':[2,2],'3v1':[3,1]};
// Each human has an independent card cycle and elixir account. Combat remains team based.
const TEAMS={
 acting:false,
 init(members,mode){
  const sizes=GAME_MODES[mode],max=Math.max(...sizes);
  G.players=members.map(m=>{const bag=shuffle(m.deck.slice());return {id:m.id,team:m.team,name:m.name,deck:m.deck.slice(),hand:bag.slice(0,4),next:bag[4],cycle:bag.slice(5),elixir:5,rate:max/sizes[m.team]};});
  this.sync();
 },
 sync(){
  if(!G.players)return;
  const own=G.players.find(p=>p.id===NET.playerId),enemy=G.players.find(p=>p.team!==own?.team);
  if(!own)return;
  for(const [p,sd] of [[own,'ally'],[enemy,'foe']])if(p){for(const k of ['deck','hand','next','cycle'])G[k][sd]=p[k];G.elixir[sd]=p.elixir;}
 },
 tick(dt,mult){for(const p of G.players||[])p.elixir=Math.min(10,p.elixir+G.rate*p.rate*mult*dt);this.sync();},
 run(playerId,fn){
  const p=G.players?.find(p=>p.id===playerId);if(!p||this.acting)return false;
  const sd=p.team===0?'ally':'foe',saved={actor:G.actorId};
  for(const k of ['deck','hand','next','cycle','elixir']){saved[k]=G[k][sd];G[k][sd]=p[k];}
  this.acting=true;G.actorId=p.id;
  try{return fn(sd,p);}
  finally{
   for(const k of ['deck','hand','next','cycle','elixir']){p[k]=G[k][sd];G[k][sd]=saved[k];}
   G.actorId=saved.actor;this.acting=false;this.sync();
  }
 },
 play(playerId,idx,x,y,card){return this.run(playerId,(sd,p)=>!card||p.hand[idx]===card?play(sd,idx,x,y):false);},
 ability(playerId,unitId,id){
  const u=G.units.find(u=>u.id===unitId&&!u.dead);
  if(!u||u.playerId!==playerId)return false;
  return this.run(playerId,sd=>activateChampionAbility(sd,unitId,id));
 }
};
// O pacote do online leva só o que o convidado usa para desenhar e jogar (antes ia o objeto inteiro).
const NET_KEYS={
 unit:['kind','id','card','side','playerId','x','y','z','hp','maxHp','r','air','dead','deploy','stun','hurt','atk','ph','moving','heading','attackWindup','attackPrep','abilityCD','bolha','caindo','cast'],
 tower:['kind','side','lane','king','x','y','z','hp','maxHp','r','alive','active','dead','aim','recoil','hurt'],
 proj:['kind','x','y','z','sx','sy','tx','ty','side','col','r','arc','t','dur','lift0','lift1','ang']
};
// Valor igual ao padrão não viaja; o convidado completa com NET_DEFAULTS ao receber.
const NET_DEFAULTS={
 unit:{kind:'unit',z:0,air:false,dead:false,deploy:0,stun:0,hurt:0,atk:0,moving:false,attackWindup:0,bolha:0,caindo:false,cast:0},
 tower:{kind:'tower',z:0,dead:false,recoil:0,hurt:0},
 proj:{z:0}
};
// Posição com 1 casa decimal (1/640 de casa do campo), o resto com 3.
const netRound=(k,v)=>typeof v!=='number'?v:/^(x|y|z|sx|sy|tx|ty|hp)$/.test(k)?Math.round(v*10)/10:Math.round(v*1000)/1000;
function netPick(list,type){
 const keys=NET_KEYS[type],base=NET_DEFAULTS[type];
 return list.map(o=>{const n={};for(const k of keys){
  const v=k==='card'?(o.card?.id||o.card):k==='abilityCD'?(o[k]&&Object.keys(o[k]).length?{...o[k]}:undefined):netRound(k,o[k]);
  if(v!==undefined&&v!==base[k])n[k]=v;}return n;});
}
const netFill=(type,o)=>({...NET_DEFAULTS[type],abilityCD:{},...o});
// Efeitos: as partículas não viajam mais. O anfitrião registra as chamadas de efeito (faíscas, explosão,
// número de dano...) e o convidado repete as mesmas chamadas, com o limite de partículas do próprio aparelho.
// Os contínuos (poeira do passo, rastros) o convidado gera sozinho no NET.frame a partir do estado.
const NET_FX=['ring','bolt','dmgText','decal','sparks','smoke','embers','shards','flingShards','hitSpark','explode','deployBurst','shakeIt','flashIt','bubbleCast','bubblePop','bubbleLand'];
const fxOriginal={};let fxDepth=0,sfxDepth=0;
// Sons da partida (tropas, torres, feitiços) vão do mesmo jeito; os só do próprio jogador (botões,
// elixir cheio, vitória, passos das suas tropas) ficam fora.
const NET_SFX=['deploy','sword','punch','arrow','bow','cannon','zap','fire','boom','magic','wind','die','tower','crown','pop'];
const NET_UNIT_EVENTS=['deploy','swing','attack','hit','impact','die','cast'];
for(const name of NET_FX){
 const f=globalThis[name];if(typeof f!=='function')continue;fxOriginal[name]=f;
 // Só a chamada de fora é registrada: explode() já gera as faíscas e a fumaça dela no convidado.
 globalThis[name]=function(...args){
  if(fxDepth===0&&NET.active&&NET.role==='host'){NET.fxLog.push([++NET.fxSeq,performance.now(),name,args]);if(NET.fxLog.length>240)NET.fxLog.shift();}
  fxDepth++;try{return f.apply(this,args);}finally{fxDepth--;}
 };
}
const NET={
 peerPaused:false,remotePaused:false,fxLog:[],fxSeq:0,fxSeen:0,ownDeploys:[],ownSounds:[],
 live:null,liveSlots:new Set(),livePing:null,liveRtt:{},liveRetry:0,liveTimer:null,
 room:null,role:null,playerId:0,team:0,mode:'1v1',active:false,peers:new Map(),members:[],
 pending:new Map(),inboxes:new Map(),acks:{},results:{},inputSeq:0,snapshotSeq:0,seenState:0,
 timer:null,polling:false,generation:0,lastPacket:0,lastSnapshot:0,lastSend:0,lastPing:0,
 ownReady:false,apiChain:Promise.resolve(),ping:null,clock:null,
 async api(action,body={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
  try{
   const response=await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...this.room,...body}),signal:controller.signal});
   const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Falha de conexão'),{status:response.status});return data;
  }finally{clearTimeout(timer);}
 },
 async enter(action,code){
  if(typeof CONNECTION!=='undefined'&&!CONNECTION.available())throw new Error('Conecte à internet para jogar online.');
  if(deckSel.length!==8)throw new Error('Escolha oito cartas primeiro.');
  if(!PROGRESS.loaded)await PROGRESS.init();
  if(!PROGRESS.loaded)throw new Error('Não foi possível carregar seu progresso. Tente novamente.');
  this.close(false);const gen=this.generation;
  const data=await this.api(action,{code,deck:deckSel,profileToken:PROGRESS.token,mode:$('matchMode').value,team:$('joinTeam').value,name:$('playerName').value});
  if(gen!==this.generation)return;
  this.room={code:data.code,token:data.token};this.role=data.role;this.playerId=data.playerId;this.team=data.team;this.mode=data.mode;
  this.lastPacket=performance.now();this.inputSeq=0;this.snapshotSeq=0;this.seenState=0;this.ownReady=false;this.acks={};this.results={};
  this.fxLog=[];this.fxSeq=0;this.fxSeen=0;this.ownDeploys=[];this.ownSounds=[];this.liveRetry=0;
  try{sessionStorage.setItem('retro-room',JSON.stringify({...this.room,role:this.role,playerId:this.playerId,team:this.team,mode:this.mode}));}catch(e){}
  this.showLobby();this.poll();this.openLive();
 },
 showLobby(){
  $('roomEntry').hidden=true;$('roomLobby').hidden=false;$('lobbyCode').textContent=this.room.code;
  $('lobbyMode').textContent=this.mode+' · Equipe '+(this.team===0?'azul':'vermelha');
  $('readyBtn').disabled=this.ownReady;$('roomStatus').textContent='Aguardando todos os jogadores confirmarem.';
 },
 renderLobby(data){
  const root=$('lobbyPlayers');root.replaceChildren();
  const sizes=GAME_MODES[this.mode];let slot=0;
  for(let team=0;team<2;team++)for(let j=0;j<sizes[team];j++,slot++){
   const p=data.players.find(p=>p.id===slot),row=document.createElement('div'),name=document.createElement('span'),state=document.createElement('b');
   row.className='playerRow team'+team;name.textContent=p?(p.id===this.playerId?'Você · ':'')+p.name:'Vaga · equipe '+(team===0?'azul':'vermelha');
   state.textContent=p?(p.ready?'Pronto ✓':'Preparando…'):'Aguardando…';row.append(name,state);root.append(row);
  }
  $('roomStatus').textContent=data.allReady?'Todos prontos! Entrando na arena…':data.players.length+' / '+data.capacity+' jogadores · '+this.mode;
 },
 async ready(){await this.api('ready');this.ownReady=true;$('readyBtn').disabled=true;},
 async gather(pc){
  if(pc.iceGatheringState==='complete')return;
  await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',on);resolve();};const on=()=>{if(pc.iceGatheringState==='complete')done();};pc.addEventListener('icegatheringstatechange',on);timer=setTimeout(done,2200);});
 },
 async connect(id,offer){
  if(!window.RTCPeerConnection||this.peers.has(id))return;
  const gen=this.generation,peer={id,dc:null,sc:null,pc:null,ping:null,exchangeId:null,offer,offerPosted:false};
  try{
   peer.pc=new RTCPeerConnection({iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]});this.peers.set(id,peer);
   peer.pc.ondatachannel=e=>this.wire(peer,e.channel);
   if(this.role==='host'){
    peer.exchangeId=crypto.randomUUID();
    this.wire(peer,peer.pc.createDataChannel('commands',{ordered:true}));
    this.wire(peer,peer.pc.createDataChannel('state',{ordered:false,maxRetransmits:0}));
    await peer.pc.setLocalDescription(await peer.pc.createOffer());await this.gather(peer.pc);
    if(gen!==this.generation)return;
    await this.api('signal',{target:id,sdp:JSON.stringify({...peer.pc.localDescription.toJSON(),exchangeId:peer.exchangeId})});peer.offerPosted=true;
   }else{
    peer.exchangeId=JSON.parse(offer).exchangeId;await peer.pc.setRemoteDescription(JSON.parse(offer));
    await peer.pc.setLocalDescription(await peer.pc.createAnswer());await this.gather(peer.pc);
    if(gen!==this.generation)return;
    await this.api('signal',{sdp:JSON.stringify({...peer.pc.localDescription.toJSON(),exchangeId:peer.exchangeId})});
   }
  }catch(e){/* Authenticated HTTPS relay carries the same commands if RTC is blocked. */}
 },
 async signal(data){
  for(const p of data.players){
   if(this.role==='host'&&p.id!==0){
    if(!this.peers.has(p.id))this.connect(p.id);
    const peer=this.peers.get(p.id);
    if(p.answer&&peer?.pc&&peer.offerPosted&&JSON.parse(p.answer).exchangeId===peer.exchangeId&&!peer.pc.remoteDescription&&!peer.signaling){
     peer.signaling=true;try{await peer.pc.setRemoteDescription(JSON.parse(p.answer));}catch(e){}finally{peer.signaling=false;}
    }
   }else if(this.role==='guest'&&p.id===this.playerId&&p.offer){const old=this.peers.get(0);if(old&&old.offer!==p.offer){old.pc?.close();this.peers.delete(0);}if(!this.peers.has(0))this.connect(0,p.offer);}
  }
 },
 wire(peer,ch){
  if(ch.label==='commands')peer.dc=ch;else if(ch.label==='state')peer.sc=ch;else return;
  ch.onmessage=e=>{try{if(e.data.length>220000)return;this.receive(JSON.parse(e.data),peer.id,m=>ch.send(JSON.stringify(m)),ms=>{peer.ping=ms;});}catch{}};
  ch.onopen=()=>{this.lastPacket=performance.now();};
 },
 // Mensagem da partida, venha ela pelo WebRTC ou pela sala ao vivo. `from` é quem mandou (o anfitrião é 0).
 receive(data,from,reply,setPing){
  if(!data||typeof data!=='object')return;this.lastPacket=performance.now();
  if(data.type==='input'&&this.role==='host')this.acceptInput(from,data.input);
  if(data.type==='snapshot'&&this.role==='guest')this.apply(data.state);
  if(data.type==='ping')reply({type:'pong',at:data.at});
  if(data.type==='pong'&&Number.isFinite(data.at))setPing(Math.round(performance.now()-data.at));
 },
 direct(peer){return !!peer&&peer.dc?.readyState==='open'&&peer.sc?.readyState==='open';},
 // Sala ao vivo: WebSocket com o Durable Object da sala (lib/live-room.ts no servidor). Leva a partida
 // quando o WebRTC não abre (rede móvel costuma bloquear), no lugar das consultas HTTPS ao banco.
 openLive(){
  if(!this.room||this.live||typeof WebSocket!=='function'||(typeof RR_SITE!=='undefined'&&RR_SITE.estatico))return;
  const gen=this.generation;let ws;
  // O token da sala vai no cabeçalho do protocolo, não na URL (que pode aparecer em registros).
  try{ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/live?code='+this.room.code,['rr-live',this.room.token]);}catch{return;}
  this.live=ws;
  ws.onopen=()=>{this.liveRetry=0;this.lastPacket=performance.now();};
  ws.onmessage=e=>{
   if(gen!==this.generation||typeof e.data!=='string'||e.data.length>220000)return;let data;try{data=JSON.parse(e.data);}catch{return;}
   if(data?.type==='roster'){this.liveSlots=new Set(Array.isArray(data.slots)?data.slots:[]);return;}
   if(this.role==='host'){const from=data?.from;if(Number.isInteger(from)&&from>0)this.receive(data,from,m=>this.sendLive({to:from,...m}),ms=>{this.liveRtt[from]=ms;});}
   else this.receive(data,0,m=>this.sendLive(m),ms=>{this.livePing=ms;});
  };
  ws.onclose=()=>{
   if(this.live!==ws)return;this.live=null;this.liveSlots=new Set();
   if(gen===this.generation&&this.room){clearTimeout(this.liveTimer);this.liveTimer=setTimeout(()=>this.openLive(),Math.min(8000,1000*2**this.liveRetry++));}
  };
 },
 liveOpen(){return this.live?.readyState===1;},
 sendLive(msg){if(!this.liveOpen())return false;try{this.live.send(typeof msg==='string'?msg:JSON.stringify(msg));return true;}catch(e){return false;}},
 // Jogador ligado ao anfitrião por um caminho rápido (direto ou ao vivo).
 linked(id){return this.direct(this.peers.get(this.role==='host'?id:0))||(this.liveOpen()&&this.liveSlots.has(this.role==='host'?id:0));},
 async poll(){
  if(!this.room||this.polling)return;this.polling=true;const gen=this.generation,start=performance.now();
  try{
   const body={after:this.acks,since:this.seenState};
   if(this.active&&this.role==='host')body.snapshot=this.capture();
   const data=await this.api('sync',body);if(gen!==this.generation)return;
   this.ping=Math.round(performance.now()-start);this.members=data.players;
   if(data.progress)PROGRESS.apply(data.progress);
   if(!this.active)this.renderLobby(data);
   this.signal(data);
   if(data.allReady&&!this.active&&this.role==='host')this.begin(data.players);
   if(data.snapshot&&this.role==='guest')this.apply(data.snapshot);
   for(const p of data.inputs||[])this.acceptInput(p.playerId,p.input);
   const host=data.players.find(p=>p.id===0);
   if(this.role==='host'||host?.seen>Date.now()-8000)this.lastPacket=performance.now();
   if(this.active){
    const absent=data.players.filter(p=>p.id!==this.playerId&&p.seen<Date.now()-12000);
    this.peerPaused=this.role==='host'&&absent.length>0;if(absent.length)$('netBadge').textContent='RECONECTANDO · '+absent.length;if(typeof CONNECTION!=='undefined')CONNECTION.paint();
    if(absent.some(p=>p.seen<Date.now()-90000)){this.disconnect('Um jogador perdeu a conexão. Crie outra sala.');return;}
   }
  }catch(e){
   if(gen!==this.generation)return;
   if([401,403,404,410].includes(e.status)){this.disconnect(e.message);return;}
   $('roomStatus').textContent=e.message+' Tentando reconectar…';
   if(this.active&&performance.now()-this.lastPacket>90000){this.disconnect('Conexão perdida. Crie outra sala.');return;}
  }finally{
   if(gen===this.generation){this.polling=false;if(this.room){
    // Com todos ligados direto ou ao vivo, o HTTPS vira só batimento (1,1 s); sem isso ele leva a partida.
    const allLinked=this.role==='host'?this.members.filter(p=>p.id!==0).every(p=>this.linked(p.id)):this.linked(0);
    this.timer=setTimeout(()=>this.poll(),typeof CONNECTION!=='undefined'&&!CONNECTION.available()?2000:this.active?(allLinked?1100:160):600);
   }}
  }
 },
 startView(){
  launch();$('onlineDialog').close();$('againBtn').textContent='Nova sala';$('pauseBtn').disabled=true;$('menuBtn').textContent='×';
  $('foeName').textContent=this.members.filter(p=>p.team!==this.team).map(p=>p.name).join(' + ')||'Equipe rival';
  $('battleMode').textContent=this.mode;document.body.dataset.mode=this.mode;
 },
 begin(members){
  if(members.length!==GAME_MODES[this.mode].reduce((a,b)=>a+b,0))return;
  this.active=true;this.startView();TEAMS.init(members,this.mode);this.hookSounds();
  for(const p of members){this.acks[p.id]=0;this.results[p.id]=[];}
  try{this.clock=new Worker('clock.js');this.clock.onmessage=()=>{if(document.hidden&&this.active){const now=performance.now();advanceSimulation(now);this.frame(1/30,now);}};}catch(e){}
 },
 // O anfitrião grava os sons da partida para o convidado repetir. Liga na primeira partida, quando o
 // sfx.js já trocou AU.sfx/AU.unit pelos sons gravados (ele carrega depois deste arquivo).
 hookSounds(){
  if(AU.netHooked)return;AU.netHooked=true;
  for(const method of ['sfx','unit']){
   const f=AU[method];
   AU[method]=function(...args){
    if(sfxDepth===0&&NET.active&&NET.role==='host'&&(method==='unit'?NET_UNIT_EVENTS.includes(args[1]):NET_SFX.includes(args[0]))){NET.fxLog.push([++NET.fxSeq,performance.now(),'AU.'+method,args]);if(NET.fxLog.length>240)NET.fxLog.shift();}
    sfxDepth++;try{return f.apply(this,args);}finally{sfxDepth--;}
   };
  }
 },
 replaySound(name,raw){
  if(name==='AU.sfx'){if(NET_SFX.includes(raw[0]))AU.sfx(raw[0],clamp(+raw[1]||1,0,2));return;}
  const [id,event,fallback,volume]=raw;if(!CARD[id]||!NET_UNIT_EVENTS.includes(event))return;
  if(event==='deploy'){const now=performance.now(),own=this.ownSounds.findIndex(s=>s.id===id&&now-s.at<2500);if(own>=0){this.ownSounds.splice(own,1);return;}}
  AU.unit(id,event,NET_SFX.includes(fallback)?fallback:null,clamp(+volume||1,0,2));
 },
 playOwn(idx,x,y){if(this.isPaused())return false;return this.role==='guest'?this.input(idx,x,y):TEAMS.play(this.playerId,idx,x,y);},
 abilityOwn(unitId,id){
  if(this.isPaused())return false;
  if(this.role==='host')return TEAMS.ability(this.playerId,unitId,id);
  const u=G.units.find(v=>v.id===unitId&&v.playerId===this.playerId&&!v.dead),state=championAbilityState(u,id);
  return state.ready?this.ability(unitId,id,state.spec):false;
 },
 input(idx,x,y){
  if(!this.active||this.isPaused()||G.state!=='battle'||this.pending.size>=8)return false;
  const card=G.hand.ally[idx],c=CARD[card];
  if(!c||G.elixir.ally<c.custo||cartaTravada('ally',idx)||c.tipo!=='feitico'&&!canDeploy('ally',x,y))return false;
  const p={seq:++this.inputSeq,idx,card,x,y:this.team===1?WH-y:y},now=performance.now();
  this.pending.set(p.seq,{input:p,at:now});
  // O próprio convidado já desenhou a entrada; o efeito igual que volta do anfitrião é ignorado.
  this.ownDeploys=this.ownDeploys.filter(d=>now-d.at<3000);this.ownDeploys.push({x:p.x,y:p.y,at:now});
  G.elixir.ally-=c.custo;cycleCard('ally',idx);deployBurst(x,y,T.ally);AU.unit(card,'deploy','deploy',.5);
  // O som de entrada que volta do anfitrião para esta carta não toca de novo.
  if(c.tipo!=='feitico'){this.ownSounds=this.ownSounds.filter(s=>now-s.at<2500);this.ownSounds.push({id:card,at:now});}
  this.sendInput(p);return true;
 },
 ability(unitId,ability,spec){
  if(!this.active||this.isPaused()||G.state!=='battle'||this.pending.size>=8)return false;
  const u=G.units.find(v=>v.id===unitId&&v.playerId===this.playerId&&!v.dead);
  if(!u||!championAbilityState(u,ability).ready)return false;
  const p={seq:++this.inputSeq,kind:'ability',unitId,ability};
  this.pending.set(p.seq,{input:p,at:performance.now()});G.elixir.ally-=spec.cost;u.abilityCD[ability]=spec.cd;
  AU.sfx('magic',.35);this.sendInput(p);return true;
 },
 sendInput(p,force=false){
  const peer=this.peers.get(0);
  if(!force&&peer?.dc?.readyState==='open'&&peer.dc.bufferedAmount<100000){try{peer.dc.send(JSON.stringify({type:'input',input:p}));return;}catch(e){}}
  if(!force&&this.liveSlots.has(0)&&this.live?.bufferedAmount<64000&&this.sendLive({type:'input',input:p}))return;
  this.apiChain=this.apiChain.catch(()=>{}).then(()=>this.room?this.api('input',{input:p}):null).catch(()=>{});
 },
 acceptInput(playerId,p){
  if(this.role!=='host'||!this.active||!G.players?.some(v=>v.id===playerId)||playerId===0||!p||!Number.isInteger(p.seq))return;
  const ack=this.acks[playerId]||0;if(p.seq<=ack||p.seq>ack+16)return;
  if(p.kind==='ability'){
   if(!Number.isSafeInteger(p.unitId)||!Object.values(CHAMP_ABILITIES).some(a=>a.some(s=>s.id===p.ability)))return;
  }else if(!Number.isInteger(p.idx)||p.idx<0||p.idx>3||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
  let inbox=this.inboxes.get(playerId);if(!inbox){inbox=new Map();this.inboxes.set(playerId,inbox);}inbox.set(p.seq,p);
  while(!this.isPaused()&&inbox.has((this.acks[playerId]||0)+1)){
   const seq=(this.acks[playerId]||0)+1,q=inbox.get(seq);inbox.delete(seq);this.acks[playerId]=seq;
   const ok=q.kind==='ability'?TEAMS.ability(playerId,q.unitId,q.ability):TEAMS.play(playerId,q.idx,q.x,q.y,q.card);
   (this.results[playerId]||=[]).push({seq,ok,reason:ok?'':q.kind==='ability'?'Habilidade indisponível':'Jogada recusada'});this.results[playerId]=this.results[playerId].slice(-16);
  }
 },
 capture(){
  const clean=v=>JSON.parse(JSON.stringify(v,(k,x)=>['target','attackTarget','owner','from','bwCD','pet','filhos'].includes(k)?undefined:k==='card'?(x?.id||x):typeof x==='number'?Math.round(x*1000)/1000:x));
  // Efeitos dos últimos 300 ms: cobre alguns pacotes perdidos; o convidado ignora os que já repetiu.
  const now=performance.now();while(this.fxLog.length&&now-this.fxLog[0][1]>300)this.fxLog.shift();
  return {seq:++this.snapshotSeq,acks:{...this.acks},results:this.results,mode:this.mode,players:clean(G.players),
   networkPaused:this.isPaused(),state:G.state,t:G.t,timeLeft:G.timeLeft,overtime:G.overtime,ended:G.ended,
   units:netPick(G.units,'unit'),towers:netPick(G.towers,'tower'),projs:netPick(G.projs,'proj'),fields:clean(G.fields),
   crowns:G.crowns,open:G.open,stats:G.stats,allyLog:G.allyLog,foeLog:G.foeLog,
   fx:this.fxLog.map(([seq,,name,args])=>[seq,name,clean(args)])};
 },
 // Repete no convidado os efeitos que o anfitrião registrou (espelhados para quem joga em cima).
 replayFx(list){
  if(!Array.isArray(list))return;
  const flip=this.team===1,Y=v=>flip&&typeof v==='number'?WH-v:v,A=v=>flip&&typeof v==='number'?-v:v;
  for(const e of list){
   if(!Array.isArray(e)||!Number.isSafeInteger(e[0])||e[0]<=this.fxSeen)continue;this.fxSeen=e[0];
   const [,name,raw]=e;if(!Array.isArray(raw)||raw.length>8)continue;
   if(name==='AU.sfx'||name==='AU.unit'){try{this.replaySound(name,raw);}catch{}continue;}
   const f=fxOriginal[name];if(!f)continue;
   const a=raw.map(v=>typeof v==='number'&&!Number.isFinite(v)?0:v);
   if(name==='ring'){if(!a[0]||typeof a[0]!=='object')continue;a[0]=this.viewObject(a[0]);}
   else if(name==='bolt'){a[1]=Y(a[1]);a[3]=Y(a[3]);if(a[4]&&typeof a[4]==='object')a[4]={...a[4],n:clamp(a[4].n||7,1,20)};}
   else if(name!=='shakeIt'&&name!=='flashIt'){
    // Só a primeira (a da entrada); a do pouso, no fim do deploy, aparece normalmente.
    if(name==='deployBurst'){const own=this.ownDeploys.findIndex(d=>Math.abs(d.x-a[0])<3&&Math.abs(d.y-a[1])<3);if(own>=0){this.ownDeploys.splice(own,1);continue;}}
    a[1]=Y(a[1]);
    if(['sparks','smoke','embers','shards'].includes(name))a[2]=clamp(+a[2]||0,0,60);
    if(name==='sparks'&&a[5]&&typeof a[5]==='object'&&typeof a[5].a==='number')a[5]={...a[5],a:A(a[5].a)};
    if(name==='hitSpark'||name==='flingShards')a[name==='hitSpark'?3:2]=A(a[name==='hitSpark'?3:2]);
    if(name.startsWith('bubble'))a[2]=clamp(+a[2]||0,0,name==='bubbleCast'?320:160);
   }
   try{f(...a);}catch{}
  }
 },
 viewObject(o,kind='normal'){
  if(!o||typeof o!=='object')return o;const n={...o},flip=this.team===1;
  if(flip){
   for(const k of ['y','sy','ty','y2'])if(typeof n[k]==='number')n[k]=WH-n[k];
   if(kind==='field'&&typeof n.py==='number')n.py=WH-n.py;
   for(const k of ['vy','dy','ang','aim','heading'])if(typeof n[k]==='number')n[k]=-n[k];
   if(n.side)n.side=other(n.side);if(n.sd)n.sd=other(n.sd);
   if(n.hist)n.hist=n.hist.map((v,i)=>i%2?WH-v:v);
  }
  if(n.card)n.card=CARD[n.card];
  if(n.u)n.u=this.viewObject(n.u);if(n.alvo&&typeof n.alvo==='object')n.alvo=this.viewObject(n.alvo);
  if(n.seg)n.seg=n.seg.map(v=>this.viewObject(v));return n;
 },
 apply(s){
  if(this.role!=='guest'||!s||!Number.isSafeInteger(s.seq)||s.seq<=this.seenState||!Array.isArray(s.units)||s.units.length>500||!Array.isArray(s.towers)||s.towers.length!==6||!Array.isArray(s.players))return;
  this.remotePaused=s.networkPaused===true;
  const own=s.players.find(p=>p.id===this.playerId);
  if(!own||own.team!==this.team||own.hand?.length!==4||!own.hand.every(id=>CARD[id])||!CARD[own.next])return;
  if(!this.active){this.active=true;this.startView();}
  const previous=new Map(G.units.map(u=>[u.id,u])),now=performance.now(),wasEnded=G.ended;
  this.seenState=s.seq;this.inputSeq=Math.max(this.inputSeq,s.acks?.[this.playerId]||0);this.lastSnapshot=now;this.lastPacket=now;G.players=s.players;
  G.units=s.units.filter(u=>CARD[u.card]).map(u=>{
   const v=this.viewObject(netFill('unit',u)),old=previous.get(v.id);v.netX=v.x;v.netY=v.y;v.netZ=v.z;v.fromX=old?.x??v.x;v.fromY=old?.y??v.y;v.fromZ=old?.z??v.z;v.x=v.fromX;v.y=v.fromY;v.z=v.fromZ;return v;
  });
  G.towers=s.towers.map(u=>this.viewObject(netFill('tower',u)));G.projs=(s.projs||[]).map(u=>this.viewObject(netFill('proj',u)));G.fields=(s.fields||[]).map(u=>this.viewObject(u,'field'));
  for(const k of ['t','timeLeft','overtime','ended'])G[k]=s[k];
  for(const k of ['crowns','open'])G[k]=this.team===1?{ally:s[k].foe,foe:s[k].ally}:s[k];
  G.stats=this.team===1?{played:{ally:s.stats.played.foe,foe:s.stats.played.ally},dmg:{ally:s.stats.dmg.foe,foe:s.stats.dmg.ally}}:s.stats;
  G.foeLog=(this.team===1?s.allyLog:s.foeLog)||[];
  for(const k of ['deck','hand','next','cycle'])G[k].ally=own[k].slice?own[k].slice():own[k];G.elixir.ally=own.elixir;
  G.state=s.state==='over'?'over':'battle';
  for(const [seq] of this.pending)if(seq<=(s.acks?.[this.playerId]||0)){
   const result=s.results?.[this.playerId]?.find(r=>r.seq===seq);if(result&&!result.ok)toast(result.reason,T.gold);this.pending.delete(seq);
  }
  for(const {input:p} of this.pending.values()){
   if(p.kind==='ability'){
    const u=G.units.find(v=>v.id===p.unitId&&v.playerId===this.playerId&&!v.dead),spec=CHAMP_ABILITIES[u?.card?.id]?.find(a=>a.id===p.ability);
    if(u&&spec){G.elixir.ally=Math.max(0,G.elixir.ally-spec.cost);u.abilityCD||={};u.abilityCD[p.ability]=spec.cd;}
   }else if(G.hand.ally[p.idx]===p.card){G.elixir.ally=Math.max(0,G.elixir.ally-CARD[p.card].custo);cycleCard('ally',p.idx);}
  }
  this.replayFx(s.fx);
  $('app').dataset.phase=G.overtime?'overtime':'normal';$('dock').classList.toggle('x2',G.overtime||G.timeLeft<=60);
  if(!wasEnded&&G.ended)setTimeout(showResult,1000);
 },
 frame(dt,now){
  if(!this.active)return;
  if(typeof CONNECTION!=='undefined')CONNECTION.paint();
  if(this.role==='guest'){
   const a=clamp((now-this.lastSnapshot)/(this.linked(0)?80:190),0,1);
   for(const u of G.units){u.x=lerp(u.fromX,u.netX,a);u.y=lerp(u.fromY,u.netY,a);u.z=lerp(u.fromZ,u.netZ,a);u.ph+=dt*(u.moving?9:2);u.atk=Math.max(0,u.atk-dt*3.6);u.hurt=Math.max(0,u.hurt-dt*4.5);if(!this.isPaused()&&u.deploy<=0&&u.stun<=0)for(const k in u.abilityCD)u.abilityCD[k]=Math.max(0,u.abilityCD[k]-dt);
    if(u.moving&&!u.air&&!u.dead&&Math.random()<dt*7)walkDust(u.x,u.y);}
   // Rastros na mesma taxa da simulação do anfitrião (que roda em passos de 1/60 s).
   if(!this.isPaused()){for(const p of G.projs)projTrail(p,dt*60);for(const f of G.fields)if(f.kind==='meteor'&&f.t<f.dur)meteorTrail(f,Math.round(3*dt*60));}
   for(const p of this.pending.values())if(!this.isPaused()&&now-p.at>700){p.at=now;this.sendInput(p.input,true);}
  }else if(now-this.lastSend>=66){
   this.lastSend=now;let state=null,relay=false;const snapshot=()=>state||=JSON.stringify({type:'snapshot',state:this.capture()});
   // Se a rede ainda não entregou o pacote anterior, pula este: fila no celular vira atraso (ping alto).
   for(const p of this.members){if(p.id===0)continue;const peer=this.peers.get(p.id);
    if(peer?.sc?.readyState==='open'){if(peer.sc.bufferedAmount<16000)try{peer.sc.send(snapshot());}catch{}}else if(this.liveSlots.has(p.id))relay=true;}
   // Quem não tem o canal direto recebe pela sala ao vivo (uma cópia só; o servidor repassa a todos).
   if(relay&&this.liveOpen()&&this.live.bufferedAmount<32000)this.sendLive(snapshot());
  }
  if(now-this.lastPing>1500){
   this.lastPing=now;
   for(const peer of this.peers.values())if(peer.dc?.readyState==='open')try{peer.dc.send(JSON.stringify({type:'ping',at:now}));}catch{}
   this.sendLive({type:'ping',at:now});
   // Selo da conexão: DIRETO (WebRTC), AO VIVO (sala ao vivo) ou ONLINE (HTTPS); o ping mostrado é o pior caminho.
   const ids=this.role==='host'?this.members.filter(p=>p.id!==0).map(p=>p.id):[0];let kind=2,latency=null;
   for(const id of ids){const peer=this.peers.get(id);let k=0,ms=null;
    const relayMs=this.role==='host'?this.liveRtt[id]:this.livePing;
    if(this.direct(peer)){k=2;ms=peer.ping??relayMs??this.ping;}else if(this.linked(id)){k=1;ms=relayMs??this.ping;}else ms=this.ping;
    kind=Math.min(kind,k);if(ms!=null)latency=Math.max(latency??0,ms);}
   $('netBadge').textContent=this.mode+' · '+['ONLINE','AO VIVO','DIRETO'][kind]+(latency!==null?' '+latency+' ms':'');
  }
 },
 stale(){return this.active&&this.role==='guest'&&performance.now()-this.lastPacket>5000;},
 isPaused(){return this.active&&((typeof CONNECTION!=='undefined'&&!CONNECTION.available())||this.peerPaused||this.remotePaused||this.stale());},
 connectionLost(){if(this.active){acc=0;lastSimulation=performance.now();}},
 reconnect(){if(!this.room)return;for(const peer of this.peers.values())peer.pc?.close();this.peers.clear();this.lastPacket=performance.now();this.remotePaused=false;clearTimeout(this.timer);if(!this.polling)this.poll();
  this.liveRetry=0;if(!this.liveOpen()){clearTimeout(this.liveTimer);const ws=this.live;this.live=null;try{ws?.close();}catch{}this.openLive();}},
 restore(){
  try{const saved=JSON.parse(sessionStorage.getItem('retro-room'));if(!saved||!saved.code||saved.token?.length!==72||!Object.hasOwn(GAME_MODES,saved.mode))return;this.room={code:saved.code,token:saved.token};this.role=saved.role;this.playerId=saved.playerId;this.team=saved.team;this.mode=saved.mode;
   if(this.role==='host'){this.close();toast('A sala foi encerrada ao recarregar. Crie outra sala.',T.gold);return;}
   this.showLobby();openOnline();this.lastPacket=performance.now();this.poll();this.openLive();}catch{}
 },
 disconnect(message){this.close();openMenu();openOnline();$('roomStatus').textContent=message;},
 leave(){this.close();},
 close(notify=true){
  if(this.room&&notify)this.api('leave').catch(()=>{});
  this.peerPaused=false;this.remotePaused=false;this.generation++;clearTimeout(this.timer);this.room=null;this.active=false;this.polling=false;
  clearTimeout(this.liveTimer);const live=this.live;this.live=null;try{live?.close(1000);}catch{}this.liveSlots=new Set();this.livePing=null;this.liveRtt={};
  this.clock?.terminate();this.clock=null;for(const p of this.peers.values())p.pc?.close();this.peers.clear();this.members=[];this.pending.clear();this.inboxes.clear();this.role=null;G.players=null;G.actorId=undefined;
  try{sessionStorage.removeItem('retro-room');}catch(e){}
  $('netBadge').textContent='TREINO';$('menuBtn').textContent='×';$('pauseBtn').disabled=false;$('againBtn').textContent='Revanche';
 }
};
window.NET=NET;
