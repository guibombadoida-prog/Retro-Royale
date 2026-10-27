'use strict';
const CHAMP_UI={key:'',buttons:[]};
function abilityIcon(id){
 const shapes={chuva:'<circle cx="17" cy="29" r="9" fill="#bff1ff"/><circle cx="31" cy="20" r="7" fill="#dff8ff"/><circle cx="31" cy="35" r="5" fill="#bff1ff"/><path d="M13 25a5 5 0 0 1 5-4" stroke="#fff"/><path d="M24 6l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="#ffd84d" stroke="#8a5a00" stroke-width="2"/>',bomba:'<circle cx="24" cy="28" r="12" fill="#37485e"/><path d="M29 16l3-7 6 1"/><path d="M39 6l2-3m-4 4l-4-3" stroke="#ffd462"/>',imaginacao:'<path d="M10 28l14-17 14 17-14 12z" fill="#c080ee"/><path d="M24 7v-4M9 15l-3-3m33 3l3-3"/>',nucleo:'<circle cx="24" cy="24" r="11" fill="#e8f9ff"/><path d="M8 24h32M24 8v32" stroke="#ffca4f"/>',realizacao:'<path d="M20 7h8v13h13v8H28v13h-8V28H7v-8h13z" fill="#fff3ce"/>',rascunho:'<path d="M10 12h28v27H10z" fill="#fff4df"/><path d="M15 19h18m-18 6h14m-14 6h18" stroke="#46527a"/>',esboco:'<path d="M12 12h25v26H12z" fill="#fff4df"/><path d="M17 31l4-10L34 8l6 6-14 13z" fill="#ffce65"/>',tracado:'<path d="M7 28l35-16-9 28-10-9z" fill="#fff4df"/><path d="M23 31l19-19M8 37l9-3"/>',altar:'<path d="M13 38h23l-5-16-7-11-7 11z" fill="#db99eb"/><circle cx="24" cy="17" r="6" fill="#dbfcff"/><path d="M7 25l10-3m14 0l10 3"/>'};
 return '<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="#16486b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'+(shapes[id==='invocar'?'altar':id]||shapes.bomba)+'</svg>';
}
function syncChampionButtons(){
 const champions=G.units.filter(u=>u.side==='ally'&&!u.dead&&(u.card.campeao||u.heroi)&&(!NET.active||u.playerId===NET.playerId));
 const panel=$('championPanel'),root=$('championButtons');
 panel.hidden=!champions.length||!['battle','paused'].includes(G.state);
 if(panel.hidden)return;
 const position=document.body.dataset.abilityPosition||'right';
 const key=position+':'+champions.map(u=>u.id+':'+u.card.id).join(',');
 if(key!==CHAMP_UI.key){
  CHAMP_UI.key=key;CHAMP_UI.buttons=[];root.replaceChildren();
  for(const controlSide of position==='both'?['left','right']:[position])for(const u of champions){
   const card=document.createElement('article'),name=document.createElement('h3'),row=document.createElement('div');
   card.className='championControls';card.dataset.controlSide=controlSide;name.textContent=u.card.nome;row.className='abilityGrid';card.append(name,row);root.append(card);
   for(const spec of (CHAMP_ABILITIES[u.card.id]||[]).filter(s=>!s.heroi||u.heroi)){
    const button=document.createElement('button'),title=document.createElement('span'),cost=document.createElement('b'),status=document.createElement('small');
    button.type='button';button.className='abilityButton'+(spec.heroi?' heroAbility':'');button.dataset.unitId=u.id;button.dataset.ability=spec.id;
    title.textContent=spec.name;cost.textContent=spec.cost;cost.className='abilityCost';status.className='abilityState';button.innerHTML=abilityIcon(spec.id);button.append(title,cost,status);
    button.setAttribute('aria-label','Ativar '+spec.name+' de '+u.card.nome);button.title=spec.description+' Custo: '+spec.cost+' elixir. Recarga: '+spec.cd+' segundos.';
    button.addEventListener('pointerdown',e=>{e.stopPropagation();UI.holding=null;});
    button.onclick=()=>{UI.holding=null;if(activateChampionAbility('ally',u.id,spec.id))syncHUD();};
    row.append(button);CHAMP_UI.buttons.push({unitId:u.id,spec,button,status});
   }
  }
 }
 for(const view of CHAMP_UI.buttons){
  const u=champions.find(u=>u.id===view.unitId),state=championAbilityState(u,view.spec.id);
  view.button.disabled=!state.ready;view.button.classList.toggle('abilityReady',state.ready);
  view.status.textContent=state.cd>0?Math.ceil(state.cd)+'s':state.ready?'':state.reason==='Elixir insuficiente'?'Elixir':state.reason;
  view.button.style.setProperty('--cooldown',state.cd/view.spec.cd);
  view.button.setAttribute('aria-description',state.reason||'Pronta para ativar. '+view.spec.description);
 }
}
const originalSyncHUD=syncHUD;
syncHUD=function(){originalSyncHUD();syncChampionButtons();$('allyScore').textContent=G.crowns.ally;$('foeScore').textContent=G.crowns.foe;};
// Baralho como na referência do dono: 8 espaços em 4×2; o 1º é de Evolução (roxo), o 2º de Herói (dourado)
// e o 3º Curinga (os dois). Toque numa carta e depois em outro espaço para trocar de lugar; com um espaço
// escolhido, tocar numa carta da coleção põe ela ali (buildPool no engine.js).
const SLOT_KIND=i=>SLOT_EVO.includes(i)?(SLOT_HEROI.includes(i)?'curinga':'evo'):SLOT_HEROI.includes(i)?'heroi':'';
const SLOT_NAME={evo:'Evolução',heroi:'Herói',curinga:'Curinga'};
function showDeckPreview(){
 const el=$('deckPreview');el.replaceChildren();
 for(let i=0;i<8;i++){
  const id=deckSel[i],c=CARD[id],kind=SLOT_KIND(i),slot=document.createElement('button');
  slot.type='button';slot.className='deckSlot'+(DECK_PICK===i?' pick':'');if(kind)slot.dataset.especial=kind;
  const where=(i+1)+'º espaço'+(kind?' ('+SLOT_NAME[kind]+')':'');
  if(c){
   const versao=ehHeroi(id,deckSel)?'heroi':'';
   slot.innerHTML=`<span class="deckCard" data-rar="${c.raridade||'comum'}" data-versao="${versao}"><canvas></canvas><b class="dropCost">${c.custo}</b>${cardMarks(c,versao)}</span>`;
   slot.setAttribute('aria-label',`${where}: ${c.nome}${versao?' Herói':''}, ${c.custo} de elixir`);
   paintCard(slot.querySelector('canvas'),c,'ally',versao);
  }else{
   slot.innerHTML=`<span class="slotBack">${kind?`<i class="gemTab big ${kind}" aria-hidden="true"></i>`:''}</span>`;
   slot.setAttribute('aria-label',where+': vazio');
  }
  slot.setAttribute('aria-pressed',DECK_PICK===i);
  slot.onclick=()=>{
   AU.init();AU.sfx('ui');
   if(DECK_PICK===null){if(c)DECK_PICK=i;}
   else if(DECK_PICK===i)DECK_PICK=null;
   else{
    const a=deckSel.slice(),from=DECK_PICK;DECK_PICK=null;
    if(i<a.length)[a[from],a[i]]=[a[i],a[from]];else a.push(a.splice(from,1)[0]);
    deckSel=a;syncDeck();return;
   }
   showDeckPreview();
  };
  el.append(slot);
 }
 const tip=$('deckTip'),semHeroi=deckSel.includes('princesa')&&!ehHeroi('princesa',deckSel);
 if(tip)tip.textContent=DECK_PICK!==null?'Toque em outro espaço para trocar, ou numa carta da coleção para pôr no lugar.':semHeroi?'Ponha a Princesa no espaço dourado para jogar com o Herói!':'Toque em duas cartas para trocar de lugar.';
}
// Detalhes da carta (referência do dono): raridade, tipo, atributos e, se houver, a aba da versão Herói.
const fmtNum=v=>String(v).replace('.',',');
const STAT_ICON={
 sword:'<path d="M5 19 17 7l2-4-4 2L3 17zM4 14l6 6M3 21l3-3" />',heart:'<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" fill="#ff5d73"/>',
 clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
 boot:'<path d="M6 4h6v8l6 3v4H6z" fill="#c9d6e8"/>',bow:'<path d="M6 3q12 9 0 18" /><path d="M6 3v18M4 12h16l-3-3m3 3-3 3"/>',
 group:'<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c1-4 9-4 10 0m-2 0c1-4 9-4 10 0"/>',
 bubble:'<circle cx="11" cy="13" r="7" fill="#bff1ff"/><circle cx="18" cy="6" r="3" fill="#dff8ff"/><path d="M7 11a4 4 0 0 1 3-3" stroke="#fff"/>',
 boom:'<path d="M12 2l2 6 6-2-3 5 5 3-6 1 1 6-5-4-5 4 1-6-6-1 5-3-3-5 6 2z" fill="#ffb347"/>',area:'<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2" fill="#fff"/>',
 stun:'<path d="M13 2 5 13h6l-1 9 8-12h-6z" fill="#cff3ff"/>',push:'<path d="M3 12h13m-4-5 5 5-5 5M20 5v14"/>'
};
const statIcon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STAT_ICON[k]}</svg>`;
function cardStats(c){
 const out=[],S=(icon,label,value)=>out.push({icon,label,value});
 if(c.tipo==='feitico'){const f=c.feitico;S('boom','Dano',f.dmg);S('area','Raio',fmtNum(f.raio));if(f.atordoa)S('stun','Atordoamento',fmtNum(f.atordoa)+'s');if(f.empurra)S('push','Empurrão',fmtNum(f.empurra));return out;}
 S('sword','Dano'+(c.splash?' em área':''),c.dmg);S('heart','Pontos de vida',c.hp);S('clock','Velocidade de ataque',fmtNum(c.hit)+'s');
 S('target','Alvos',{chao:'Terrestre',ambos:'Aéreo/terrestre',construcoes:'Construções'}[c.alvo]||'Terrestre');
 S('boot','Velocidade',c.speed>=1.25?'Muito rápida':c.speed>=1?'Rápida':c.speed>=.7?'Média':'Lenta');
 S('bow','Alcance',c.range<=1.2?'Corpo a corpo':fmtNum(c.range));
 if((c.n||1)>1)S('group','Quantidade','×'+c.n);
 if(c.bolha){S('bubble','Bolha a cada',fmtNum(c.bolha.recarga)+'s');S('bubble','Estouro + queda',c.bolha.estouro+' + '+c.bolha.queda);}
 return out;
}
function openCardInfo(id,versao=''){
 const c=CARD[id],d=$('cardDialog');if(!c||!d)return;
 if(!c.heroi)versao='';
 const h=versao==='heroi'?c.heroi:null,rar=c.raridade||'comum';
 const stats=cardStats(c).map(s=>`<div class="ciStat${['Dano','Pontos de vida'].some(k=>s.label.startsWith(k))?' good':''}">${statIcon(s.icon)}<span><small>${s.label}</small><b>${s.value}</b></span></div>`).join('');
 const ability=h?`<div class="ciAbility"><div class="abilityButton heroAbility abilityReady" aria-hidden="true">${abilityIcon(h.id)}<b class="abilityCost">${h.custo}</b></div><div><h3>${h.nome}</h3><p>${h.descricao}</p><small>Custa ${h.custo} de elixir · recarga ${fmtNum(h.recarga)}s · raio ${fmtNum(h.raio)}</small></div></div><p class="ciNote">Para jogar com o Herói, ponha a carta no espaço dourado ou no curinga do baralho e toque no botão da habilidade durante a batalha.</p>`:'';
 $('ciContent').innerHTML=`<div class="ciHead"><span class="deckCard ciCard" data-rar="${rar}" data-versao="${versao}"><canvas></canvas><b class="dropCost">${c.custo}</b>${cardMarks(c,versao)}</span>
  <div class="ciTitle"><h2 id="ciName">${c.nome}</h2><p class="ciSub" data-rar="${rar}" data-versao="${versao}">${h?'Herói':RARIDADES[rar]}</p>
  <div class="ciPills"><span><small>Raridade</small><b>${RARIDADES[rar]}</b></span><span><small>Tipo</small><b>${{tropa:'Tropa',feitico:'Feitiço',construcao:'Construção'}[c.tipo]||c.tipo}</b></span></div></div></div>
  <p class="ciRole">${c.papel}</p>${h?ability:`<div class="ciGrid">${stats}</div>`}
  ${c.heroi?`<div class="ciTabs" role="tablist"><button type="button" role="tab" data-v="" aria-selected="${!h}">♛ Normal</button><button type="button" role="tab" data-v="heroi" aria-selected="${!!h}">◆ Herói</button></div>`:''}`;
 paintCard(d.querySelector('.ciCard canvas'),c,'ally',versao);
 for(const b of d.querySelectorAll('.ciTabs button'))b.onclick=()=>{AU.sfx('ui');openCardInfo(id,b.dataset.v);};
 if(!d.open)d.showModal();
}

function togglePause(){
 if(NET.active){toast('Online não tem pausa',T.gold);return;}
 if(G.state!=='battle'&&G.state!=='paused')return;
 const paused=G.state==='battle';G.state=paused?'paused':'battle';$('pauseOverlay').hidden=!paused;$('pauseBtn').textContent=paused?'▶':'Ⅱ';
}
function openOnline(){
 if(typeof RR_SITE!=='undefined'&&RR_SITE.estatico){if(RR_SITE.online)window.open(RR_SITE.online,'_blank','noopener');else $('startHint').textContent='O modo online precisa do servidor do jogo.';return;}
 if(deckSel.length!==8){$('startHint').textContent='Escolha oito cartas para jogar online.';return;}
 $('roomEntry').hidden=!!NET.room;$('roomLobby').hidden=!NET.room;$('roomStatus').textContent='';
 if(!$('onlineDialog').open)$('onlineDialog').showModal();
}
async function roomAction(action){
 const buttons=[$('createRoom'),$('joinRoom')];buttons.forEach(b=>b.disabled=true);
 $('roomStatus').textContent='Conectando…';
 try{await NET.enter(action,$('roomCode').value.trim().toUpperCase());}catch(e){$('roomStatus').textContent=e.message||'Não foi possível conectar.';}
 finally{buttons.forEach(b=>b.disabled=false);}
}
function setupArena(){
 try{
  ARENA3D=window.createArena3D({canvas:$('world3d'),input:cv,stage:$('stage'),
   onReady:mode=>{$('webglError').hidden=true;document.body.dataset.renderer=mode;},
   onError:()=>{$('webglError').hidden=false;$('fps').textContent='3D indisponível';}
  });
 }catch(e){$('webglError').hidden=false;console.error('Arena 3D',e);}
 $('retry3d').onclick=()=>location.reload();
 $('viewBtn').onclick=()=>{if(ARENA3D?.ready){const view=ARENA3D.cycleView();$('viewBtn').setAttribute('title','Câmera: '+view);$('viewBtn').setAttribute('aria-label','Mudar vista da câmera 3D: '+view);}};

 $('soundBtn').onclick=()=>{AU.init();AU.on=!AU.on;if(AU.ctx?.state==='suspended')AU.ctx.resume();$('soundBtn').setAttribute('aria-pressed',AU.on);$('soundBtn').textContent=AU.on?'♪ Som':'♪ Mudo';PROGRESS.changed();};
 $('fxBtn').setAttribute('aria-pressed',PREF.fx);
 $('fxBtn').onclick=()=>{PREF.fx=!PREF.fx;FX.shake=0;FX.flash=0;FX.reduced=!PREF.fx;$('fxBtn').setAttribute('aria-pressed',PREF.fx);PROGRESS.changed();};
 $('lightBtn').onclick=()=>{PREF.light=!PREF.light;$('lightBtn').setAttribute('aria-pressed',PREF.light);resize();PROGRESS.changed();};
 $('pauseBtn').onclick=togglePause;$('resumeBtn').onclick=togglePause;
 $('settingsBtn').onclick=()=>$('settingsDialog').showModal();$('closeSettings').onclick=()=>$('settingsDialog').close();
 const choosePosition=position=>{document.body.dataset.abilityPosition=position;for(const b of document.querySelectorAll('[data-ability-position]'))if(b.tagName==='BUTTON'){b.classList.toggle('gold',b.dataset.abilityPosition===position);b.setAttribute('aria-pressed',b.dataset.abilityPosition===position);}CHAMP_UI.key='';if(PROGRESS.loaded)PROGRESS.changed();try{localStorage.setItem('retro-ability-position',position);}catch(e){}syncChampionButtons();};
 let position='right';try{const p=localStorage.getItem('retro-ability-position');if(['left','right','both'].includes(p))position=p;}catch(e){}choosePosition(position);
 for(const b of document.querySelectorAll('button[data-ability-position]'))b.onclick=()=>choosePosition(b.dataset.abilityPosition);
 const chooseMode=mode=>{$('matchMode').value=mode;for(const b of document.querySelectorAll('[data-mode]'))if(b.tagName==='BUTTON'){b.classList.toggle('on',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);}};
 for(const b of document.querySelectorAll('button[data-mode]'))b.onclick=()=>chooseMode(b.dataset.mode);$('matchMode').onchange=()=>chooseMode($('matchMode').value);
 $('deckTab').onclick=()=>{$('deckDetails').open=false;$('deckTab').classList.add('on');$('collectionTab').classList.remove('on');};
 $('collectionTab').onclick=()=>{$('deckDetails').open=true;$('collectionTab').classList.add('on');$('deckTab').classList.remove('on');$('deckDetails').scrollIntoView({block:'nearest'});};
 $('onlineBtn').onclick=openOnline;if(typeof RR_SITE!=='undefined'&&RR_SITE.estatico&&RR_SITE.online)$('onlineBtn').textContent='Batalhar online ↗';
 $('closeOnline').onclick=()=>{if(NET.room)NET.close();$('onlineDialog').close();};
 $('onlineDialog').addEventListener('cancel',()=>{if(NET.room)NET.close();});
 $('createRoom').onclick=()=>roomAction('create');$('joinRoom').onclick=()=>roomAction('join');
 $('roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')roomAction('join');});
 $('readyBtn').onclick=async()=>{try{await NET.ready();}catch(e){$('roomStatus').textContent=e.message;}};
 $('leaveRoom').onclick=()=>{NET.close();$('roomEntry').hidden=false;$('roomLobby').hidden=true;$('roomStatus').textContent='Você saiu da sala.';};
 $('copyInvite').onclick=async()=>{
  if(!NET.room)return;
  const url=new URL('/',location.origin);url.searchParams.set('sala',NET.room.code);
  try{await navigator.clipboard.writeText(url.href);$('roomStatus').textContent='Convite copiado. Compartilhe com os jogadores.';}catch(e){$('roomStatus').textContent='Compartilhe o código '+NET.room.code;}
 };
 $('deckDetails').addEventListener('toggle',()=>{if($('deckDetails').open)for(const el of $('pool').children)paintCard(el.querySelector('canvas'),CARD[el.dataset.id]);});
 // The opening screen shows the actual arena with a few of the deck's units.
 startMatch(deckSel,diffSel);G.state='menu';$('toast').classList.remove('show');
 for(const [id,sd,x,y] of [['gigante','ally',6,18.5],['arqueiras','ally',10,20],['cavaleiro','foe',4,9],['morcegos','foe',13,8.5]]){
  const u=spawnUnit(id,sd,x*TILE,y*TILE,{deploy:0});u.spawnT=0;
 }
 FX.clear();$('foeName').textContent='Guardião do Vale';$('phase').textContent='Preparação';
 let lastDrawn=ARENA3D?.framesRendered||0,lastFPS=performance.now();
 const oldFrame=frame;
 frame=function(now){if(now-lastFPS>=1000){const drawn=ARENA3D?.framesRendered||0;$('fps').textContent=ARENA3D?.ready?'3D · '+Math.round((drawn-lastDrawn)*1000/(now-lastFPS))+' FPS':'3D indisponível';lastFPS=now;lastDrawn=drawn;}
  if(G.state==='menu')for(const u of G.units)u.ph+=.012;
  oldFrame(now);AU.stepSfx?.(G);AU.ambience?.(G);
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!NET.active&&G.state==='battle')togglePause();});
 // Links land at /; the same-origin parent passes the room code into the game.
 try{const q=new URL(parent.location.href).searchParams.get('sala');if(q&&/^[A-Z2-9]{6}$/i.test(q)){setTimeout(()=>{$('roomCode').value=q.toUpperCase();openOnline();},80);}}catch(e){}
 const context=document.modelContext;
 if(context?.registerTool){
  const lifecycle=new AbortController();
  for(const tool of [
   {name:'read_arena_state',title:'Ler a arena',description:'Lê o estado da partida, as cartas e o elixir.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({mode:NET.active?'online':'treino',state:G.state,time:G.timeLeft,elixir:G.elixir.ally,crowns:G.crowns,hand:G.hand.ally})},
   {name:'start_training_match',title:'Iniciar treino',description:'Inicia uma partida contra IA com o baralho selecionado. Falha se uma partida ou sala estiver aberta.',inputSchema:{type:'object',properties:{difficulty:{type:'integer',minimum:0,maximum:2}},required:['difficulty'],additionalProperties:false},annotations:{readOnlyHint:false},execute:({difficulty})=>{if(!Number.isInteger(difficulty)||difficulty<0||difficulty>2)throw new Error('Nível inválido');if(NET.room||G.state==='battle')throw new Error('Já existe uma partida ou sala');diffSel=difficulty;launch();return {state:G.state,difficulty:DIFF[diffSel].nome};}},
  ])try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch(e){}
  addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 }
 PROGRESS.init().then(()=>NET.restore());ACCOUNT.init();CONNECTION.init();
 $('copyRecovery').onclick=()=>ACCOUNT.copyRecovery();$('restoreRecovery').onclick=()=>ACCOUNT.restoreRecovery();$('emailLoginForm').onsubmit=e=>{e.preventDefault();ACCOUNT.requestCode();};$('codeLoginForm').onsubmit=e=>{e.preventDefault();ACCOUNT.verifyCode();};$('resendCodeBtn').onclick=()=>ACCOUNT.requestCode(true);$('changeEmailBtn').onclick=()=>ACCOUNT.changeEmail();$('loginCode').addEventListener('input',e=>{e.target.value=e.target.value.replace(/[^0-9]/g,'').slice(0,6);});$('logoutBtn').onclick=()=>ACCOUNT.logout();$('playerName').addEventListener('change',()=>PROGRESS.changed());
}
setupArena();resize();openMenu();requestAnimationFrame(frame);
