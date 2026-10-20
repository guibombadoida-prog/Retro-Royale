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
const NET={
 peerPaused:false,remotePaused:false,
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
  try{sessionStorage.setItem('retro-room',JSON.stringify({...this.room,role:this.role,playerId:this.playerId,team:this.team,mode:this.mode}));}catch(e){}
  this.showLobby();this.poll();
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
  ch.onmessage=e=>{try{
   const data=JSON.parse(e.data);if(e.data.length>220000)return;this.lastPacket=performance.now();
   if(data.type==='input'&&this.role==='host')this.acceptInput(peer.id,data.input);
   if(data.type==='snapshot'&&this.role==='guest')this.apply(data.state);
   if(data.type==='ping')ch.send(JSON.stringify({type:'pong',at:data.at}));
   if(data.type==='pong')peer.ping=Math.round(performance.now()-data.at);
  }catch(e){}};
  ch.onopen=()=>{this.lastPacket=performance.now();};
 },
 direct(peer){return !!peer&&peer.dc?.readyState==='open'&&peer.sc?.readyState==='open';},
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
    const allDirect=this.role==='host'?this.members.filter(p=>p.id!==0).every(p=>this.direct(this.peers.get(p.id))):this.direct(this.peers.get(0));
    this.timer=setTimeout(()=>this.poll(),typeof CONNECTION!=='undefined'&&!CONNECTION.available()?2000:this.active?(allDirect?1100:160):600);
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
  this.active=true;this.startView();TEAMS.init(members,this.mode);
  for(const p of members){this.acks[p.id]=0;this.results[p.id]=[];}
  try{this.clock=new Worker('/game/clock.js');this.clock.onmessage=()=>{if(document.hidden&&this.active){const now=performance.now();advanceSimulation(now);this.frame(1/30,now);}};}catch(e){}
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
  const p={seq:++this.inputSeq,idx,card,x,y:this.team===1?WH-y:y};
  this.pending.set(p.seq,{input:p,at:performance.now()});
  G.elixir.ally-=c.custo;cycleCard('ally',idx);deployBurst(x,y,T.ally);AU.sfx('deploy',.5);
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
  return {seq:++this.snapshotSeq,acks:{...this.acks},results:this.results,mode:this.mode,players:clean(G.players),
   networkPaused:this.isPaused(),state:G.state,t:G.t,timeLeft:G.timeLeft,overtime:G.overtime,ended:G.ended,
   units:clean(G.units),towers:clean(G.towers),projs:clean(G.projs),fields:clean(G.fields),
   crowns:G.crowns,open:G.open,stats:G.stats,allyLog:G.allyLog,foeLog:G.foeLog,
   fx:clean({parts:FX.parts.slice(-180),rings:FX.rings.slice(-24),bolts:FX.bolts.slice(-16),decals:FX.decals.slice(-28),texts:FX.texts.slice(-16),trails:[],shake:FX.shake,flash:FX.flash,flashColor:FX.flashColor})};
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
   const v=this.viewObject(u),old=previous.get(v.id);v.netX=v.x;v.netY=v.y;v.netZ=v.z;v.fromX=old?.x??v.x;v.fromY=old?.y??v.y;v.fromZ=old?.z??v.z;v.x=v.fromX;v.y=v.fromY;v.z=v.fromZ;return v;
  });
  G.towers=s.towers.map(u=>this.viewObject(u));G.projs=(s.projs||[]).map(u=>this.viewObject(u));G.fields=(s.fields||[]).map(u=>this.viewObject(u,'field'));
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
  if(s.fx){for(const k of ['parts','rings','bolts','decals','texts','trails'])FX[k]=(s.fx[k]||[]).map(v=>this.viewObject(v));FX.shake=PREF.fx?s.fx.shake:0;FX.flash=PREF.fx?s.fx.flash:0;FX.flashColor=s.fx.flashColor;}
  if(previous.size<G.units.length)AU.sfx('deploy',.35);
  if(G.units.some(u=>u.hurt>.8&&(previous.get(u.id)?.hurt||0)<.3))AU.sfx('punch',.25);
  $('app').dataset.phase=G.overtime?'overtime':'normal';$('dock').classList.toggle('x2',G.overtime||G.timeLeft<=60);
  if(!wasEnded&&G.ended)setTimeout(showResult,1000);
 },
 frame(dt,now){
  if(!this.active)return;
  if(typeof CONNECTION!=='undefined')CONNECTION.paint();
  if(this.role==='guest'){
   const a=clamp((now-this.lastSnapshot)/(this.direct(this.peers.get(0))?80:190),0,1);
   for(const u of G.units){u.x=lerp(u.fromX,u.netX,a);u.y=lerp(u.fromY,u.netY,a);u.z=lerp(u.fromZ,u.netZ,a);u.ph+=dt*(u.moving?9:2);u.atk=Math.max(0,u.atk-dt*3.6);u.hurt=Math.max(0,u.hurt-dt*4.5);if(!this.isPaused()&&u.deploy<=0&&u.stun<=0)for(const k in u.abilityCD)u.abilityCD[k]=Math.max(0,u.abilityCD[k]-dt);}
   for(const p of this.pending.values())if(!this.isPaused()&&now-p.at>700){p.at=now;this.sendInput(p.input,true);}
  }else if(now-this.lastSend>=66){
   this.lastSend=now;let state=null;
   for(const peer of this.peers.values())if(peer.sc?.readyState==='open'&&peer.sc.bufferedAmount<150000){
    state||=JSON.stringify({type:'snapshot',state:this.capture()});try{peer.sc.send(state);}catch(e){}
   }
  }
  if(now-this.lastPing>1500){
   this.lastPing=now;let direct=0,latency=this.ping;
   for(const peer of this.peers.values()){if(this.direct(peer)){direct++;latency=peer.ping??latency;}if(peer.dc?.readyState==='open')try{peer.dc.send(JSON.stringify({type:'ping',at:now}));}catch(e){}}
   $('netBadge').textContent=this.mode+' · '+(direct?'DIRETO':'ONLINE')+(latency!==null?' '+latency+' ms':'');
  }
 },
 stale(){return this.active&&this.role==='guest'&&performance.now()-this.lastPacket>5000;},
 isPaused(){return this.active&&((typeof CONNECTION!=='undefined'&&!CONNECTION.available())||this.peerPaused||this.remotePaused||this.stale());},
 connectionLost(){if(this.active){acc=0;lastSimulation=performance.now();}},
 reconnect(){if(!this.room)return;for(const peer of this.peers.values())peer.pc?.close();this.peers.clear();this.lastPacket=performance.now();this.remotePaused=false;clearTimeout(this.timer);if(!this.polling)this.poll();},
 restore(){
  try{const saved=JSON.parse(sessionStorage.getItem('retro-room'));if(!saved||!saved.code||saved.token?.length!==72||!Object.hasOwn(GAME_MODES,saved.mode))return;this.room={code:saved.code,token:saved.token};this.role=saved.role;this.playerId=saved.playerId;this.team=saved.team;this.mode=saved.mode;
   if(this.role==='host'){this.close();toast('A sala foi encerrada ao recarregar. Crie outra sala.',T.gold);return;}
   this.showLobby();openOnline();this.lastPacket=performance.now();this.poll();}catch(e){}
 },
 disconnect(message){this.close();openMenu();openOnline();$('roomStatus').textContent=message;},
 leave(){this.close();},
 close(notify=true){
  if(this.room&&notify)this.api('leave').catch(()=>{});
  this.peerPaused=false;this.remotePaused=false;this.generation++;clearTimeout(this.timer);this.room=null;this.active=false;this.polling=false;
  this.clock?.terminate();this.clock=null;for(const p of this.peers.values())p.pc?.close();this.peers.clear();this.members=[];this.pending.clear();this.inboxes.clear();this.role=null;G.players=null;G.actorId=undefined;
  try{sessionStorage.removeItem('retro-room');}catch(e){}
  $('netBadge').textContent='TREINO';$('menuBtn').textContent='×';$('pauseBtn').disabled=false;$('againBtn').textContent='Revanche';
 }
};
window.NET=NET;
