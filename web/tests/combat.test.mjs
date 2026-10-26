import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {unitModel,towerModel,projectileModel,rubbleModel,setLowDetail} from '../src/game/models3d.js';
import {animateRig,animateDeath} from '../src/game/animation.js';
import {Vector3} from 'three';
const gradient={addColorStop(){}};
const canvas=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:()=>({width:10})},{get(o,k){return k in o?o[k]:(()=>{});}});
class El{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.dataset={};this.style={setProperty(){}};this.children=[];this.hidden=false;this.value='';this.textContent='';this.q=new Map();this.clientWidth=390;this.clientHeight=700;this.classList={add(){},remove(){},toggle(){},contains(){return false;}};}
 getContext(){return canvas;}appendChild(el){this.children.push(el);return el;}append(...els){this.children.push(...els);}replaceChildren(...els){this.children=els;}
 querySelector(q){if(!this.q.has(q))this.q.set(q,new El(q==='canvas'?'canvas':'div'));return this.q.get(q);}querySelectorAll(){return [];}addEventListener(){}setAttribute(){}getBoundingClientRect(){return {width:390,height:700,left:0,top:0};}close(){}showModal(){}remove(){}scrollIntoView(){}
}
const elements=new Map(),body=new El('body');
const document={body,createElement:t=>new El(t),getElementById:id=>{if(!elements.has(id))elements.set(id,new El(id==='cv'?'canvas':'div'));return elements.get(id);},querySelectorAll:()=>[],addEventListener(){},hidden:false};
const ctx=vm.createContext({document,window:{devicePixelRatio:1},localStorage:{getItem(){return null;},setItem(){}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'https://game.test'},getComputedStyle:()=>({display:'none'}),matchMedia:()=>({matches:false}),performance:{now:()=>1000},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame(){},addEventListener(){},console,URL,AbortController});
const run=code=>vm.runInContext(code,ctx);
for(const file of ['progress','engine','online'])run(readFileSync('public/game/'+file+'.js','utf8'));
run("showDeckPreview=()=>{};const testNormal=['cavaleiro','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos'];");
for(const [mode,sizes] of Object.entries({'1v1':[1,1],'2v1':[2,1],'2v2':[2,2],'3v1':[3,1]})){
 const members=[...Array(sizes[0]).fill(0),...Array(sizes[1]).fill(1)].map((team,id)=>({team,id,name:'P'+id,deck:['cavaleiro','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos']}));
 run(`NET.active=true;NET.role='host';NET.playerId=0;NET.team=0;NET.mode='${mode}';startMatch(testNormal,1);TEAMS.init(${JSON.stringify(members)},'${mode}');`);
 const before=run('G.players.map(p=>p.elixir)');run('TEAMS.tick(1,1)');const rates=run('G.players.map(p=>p.elixir-5)');assert.ok(Math.abs(rates.at(-1)/rates[0]-sizes[0]/sizes[1])<1e-9);
 // Every participant plays independently on their own team.
 for(const m of members){
  run(`G.players[${m.id}].hand=['cavaleiro','arqueiras','goblins','gigante'];G.players[${m.id}].elixir=10;TEAMS.sync();`);
  assert.equal(run(`TEAMS.play(${m.id},0,224,${m.team===0?1400:200},'cavaleiro')`),true);
  assert.ok(run(`G.units.find(u=>u.playerId===${m.id}&&u.card.id==='cavaleiro')`));
  // Sem elixir a jogada é recusada.
  run(`G.players[${m.id}].hand[0]='gigante';G.players[${m.id}].elixir=0;TEAMS.sync();`);
  assert.equal(run(`TEAMS.play(${m.id},0,224,${m.team===0?1400:200},'gigante')`),false);
 }
 const guestId=members.length-1,guestTeam=members[guestId].team;
 run(`NET.acks={};NET.results={};NET.inboxes.clear();G.players[${guestId}].hand=['cavaleiro','goblins','arqueiras','gigante'];G.players[${guestId}].elixir=10;TEAMS.sync();`);
 const command={seq:1,idx:0,card:'cavaleiro',x:550,y:guestTeam===0?1400:200};
 run(`NET.acceptInput(${guestId},${JSON.stringify({...command,seq:2,idx:1,card:'goblins'})});`);assert.equal(run(`NET.acks[${guestId}]||0`),0);
 run(`NET.acceptInput(${guestId},${JSON.stringify(command)});`);assert.equal(run(`NET.acks[${guestId}]`),2);
 const unitCount=run('G.units.length'),elixir=run(`G.players[${guestId}].elixir`);
 run(`NET.acceptInput(${guestId},${JSON.stringify(command)});`);assert.equal(run('G.units.length'),unitCount);assert.equal(run(`G.players[${guestId}].elixir`),elixir);
 // Snapshots mirror enemies, while teammates keep host coordinates.
 const s=run('NET.capture()');const u=s.units.find(u=>u.playerId===0);run('NET.team=0');assert.equal(run(`NET.viewObject(${JSON.stringify(u)}).y`),u.y);run('NET.team=1');assert.equal(run(`NET.viewObject(${JSON.stringify(u)}).y`),1664-u.y);
 assert.doesNotThrow(()=>JSON.stringify(s));
 run(`NET.role='guest';NET.playerId=${guestId};NET.team=${guestTeam};NET.active=false;NET.members=${JSON.stringify(members)};NET.seenState=0;NET.pending.clear();NET.apply(${JSON.stringify(s)});NET.frame(.01,1200);`);
 assert.equal(run('G.elixir.ally'),s.players[guestId].elixir);assert.equal(run('NET.inputSeq'),s.acks[guestId]);
 assert.equal(run(`G.units.find(u=>u.playerId===${guestId}).side`),'ally');
 assert.equal(run('G.hand.ally.join()'),s.players[guestId].hand.join());
 run('NET.active=false;NET.pending.clear();');
}
run("NET.active=false;NET.role=null;startMatch(testNormal,1);const attacker=spawnUnit('cavaleiro','ally',576,800,{deploy:0});const target=spawnUnit('cavaleiro','foe',576,750,{deploy:0});attacker.spawnT=target.spawnT=0;attacker.atkT=0;attacker.target=target;attacker.retarget=1;const initialHP=target.hp;stepUnit(attacker,1/60);");
assert.equal(run('target.hp'),run('initialHP'));assert.ok(run('attacker.attackWindup')>0);
run('for(let i=0;i<20;i++)stepUnit(attacker,1/60)');assert.ok(run('target.hp')<run('initialHP'));
const triangles=o=>{let t=0;o.traverse(c=>{if(c.isMesh&&!c.userData.outline)t+=(c.geometry.index?c.geometry.index.count:c.geometry.attributes.position.count)/3;});return t;};
const finite=o=>{o.traverse(c=>{for(const v of [...c.position,...c.rotation.toArray().slice(0,3),...c.scale])assert.ok(Number.isFinite(v),c.name+' tem valor inválido');});};
for(const art of ['knight','archer','goblin','giant','bomber','bat','princess']){
 const model=unitModel(art,'ally'),rig={};for(const key of ['leftLeg','rightLeg','leftArm','rightArm','leftWing','rightWing','head','prop'])rig[key]=model.getObjectByName(key);
 if(art==='bat')assert.ok(rig.leftWing&&rig.rightWing);else for(const key of ['leftLeg','rightLeg','leftArm','rightArm','head'])assert.ok(rig[key],art+' sem '+key);
 if(art==='bomber')assert.ok(rig.prop,'bombardeiro sem a bomba separada');
 assert.ok(model.userData.style&&model.userData.height>.5);
 // Orçamento do celular: cada tropa (sem o contorno) fica abaixo de 4.500 triângulos.
 assert.ok(triangles(model)<4500,art+' tem '+triangles(model)+' triângulos');
 // Uma malha por material (toon, contorno, brilho) com os grupos do rig como ossos: 2 a 3 chamadas por tropa.
 const meshes=[];model.traverse(c=>{if(c.isMesh)meshes.push(c);});
 assert.ok(meshes.length<=3&&meshes.every(c=>c.isSkinnedMesh),art+' tem '+meshes.length+' malhas');
 const limb=rig.leftArm||rig.leftWing,skin=meshes[0],bone=skin.skeleton.bones.indexOf(limb);
 assert.ok(bone>0&&meshes.every(c=>c.skeleton===skin.skeleton),art+': o membro é um osso do próprio modelo');
 let vertex=0;while(skin.geometry.attributes.skinIndex.getX(vertex)!==bone)vertex++;
 const pose=()=>{model.updateMatrixWorld(true);skin.skeleton.update();return skin.getVertexPosition(vertex,new Vector3());};
 const rest=pose();limb.rotation.x+=1;assert.ok(pose().distanceTo(rest)>.01,art+': girar o osso move a malha');limb.rotation.x-=1;
 const n={model,rig,oldX:0,oldY:0,angle:0},e={id:1,x:1,y:1,heading:.3,ph:2,moving:true,card:{art,deploy:1,proj:art==='archer'},attackWindup:.1,attackPrep:.18,atk:0,hurt:.7,deploy:.8,air:art==='bat',stun:0};
 const phases=[{attackWindup:.12},{attackWindup:0,atk:1},{atk:.4,moving:false},{stun:.5,atk:0},{stun:0,deploy:0,hurt:0}];
 for(const phase of phases){Object.assign(e,phase);for(let i=0;i<12;i++)animateRig(n,e,i/60,1/60);finite(model);}
 if(rig.prop){e.atk=1;animateRig(n,e,1,1/60);assert.ok(rig.prop.scale.x<.01,'a bomba some ao ser lançada');}
 for(let i=0;i<30;i++)animateDeath(n,1/60);assert.ok(n.deathTime>.42);assert.ok(Math.abs(model.rotation.z)>1);finite(model);
}
for(const side of ['ally','foe'])for(const king of [true,false]){const model=towerModel(side,king);assert.ok(model.getObjectByName('turret'));assert.ok(triangles(model)<7500);let meshes=0;model.traverse(c=>{if(c.isMesh)meshes++;});assert.ok(meshes<=3);}
// Duas tropas iguais não dividem esqueleto (cada uma anima sozinha).
{const a=unitModel('knight','ally'),b=unitModel('knight','ally'),bones=m=>{let s;m.traverse(c=>{if(c.isSkinnedMesh)s=c.skeleton;});return s.bones;};assert.ok(bones(a).every(x=>!bones(b).includes(x)));assert.equal(bones(a)[0],a);}
for(const kind of ['arrow','bolt','bomb'])assert.ok(triangles(projectileModel(kind,'foe'))>0);
assert.ok(triangles(rubbleModel(true))>0);
// Sem WebGL (CPU) os modelos são mais simples e não têm contorno.
const high=triangles(unitModel('knight','foe'));setLowDetail(true);const low=unitModel('knight','foe');let outline=false;low.traverse(c=>{if(c.userData.outline)outline=true;});assert.equal(outline,false);assert.ok(triangles(low)<high*.6);setLowDetail(false);
console.log('Combat: independent players, elixir rules, team mirroring, snapshot serialization, delayed attack impact and all 3D rigs passed.');
// A disconnected host preserves combat time and player balances until the link returns.
run("globalThis.CONNECTION={available:()=>false,paint(){}};NET.active=true;NET.role='host';NET.peerPaused=false;NET.remotePaused=false;G.state='battle';");
const pausedTime=run('G.timeLeft'),pausedElixir=run('G.players[0].elixir'),pausedUnits=run('G.units.length');
run('advanceSimulation(1000000)');assert.equal(run('G.timeLeft'),pausedTime);assert.equal(run('G.players[0].elixir'),pausedElixir);assert.equal(run('NET.playOwn(0,224,1400)'),false);assert.equal(run('G.units.length'),pausedUnits);
run("NET.acks[1]=0;NET.results[1]=[];NET.inboxes.clear();G.players[1].hand=['cavaleiro','arqueiras','goblins','gigante'];G.players[1].elixir=10;NET.acceptInput(1,{seq:1,idx:0,card:'cavaleiro',x:224,y:1400});");assert.equal(run('NET.acks[1]'),0);assert.equal(run('G.players[1].elixir'),10);
run("CONNECTION.available=()=>true;NET.acceptInput(1,{seq:1,idx:0,card:'cavaleiro',x:224,y:1400});");assert.equal(run('NET.acks[1]'),1);assert.equal(run('G.players[1].elixir'),7);
run("NET.acceptInput(1,{seq:1,idx:0,card:'cavaleiro',x:224,y:1400});");assert.equal(run('G.players[1].elixir'),7);
run('advanceSimulation(1000100)');assert.ok(pausedTime-run('G.timeLeft')<.2);
console.log('Network combat: disconnected input blocked, clock frozen, ordered queued input charged once and no time jump on reconnect.');
// Sons no online: o anfitrião grava os sons da partida e o convidado repete; os sons só dele ficam fora.
run("NET.active=true;NET.role='host';NET.team=0;NET.fxLog=[];NET.fxSeq=0;NET.hookSounds();NET.hookSounds();");
run("AU.unit('cavaleiro','deploy','deploy');AU.unit('cavaleiro','step','step');AU.sfx('ui');AU.sfx('full');AU.sfx('boom',1.2);");
assert.equal(run("NET.fxLog.map(e=>e[2]+':'+e[3][0]+':'+(e[3][1]??'')).join()"),'AU.unit:cavaleiro:deploy,AU.sfx:boom:1.2','só os sons da partida, uma vez cada (o genérico dentro do AU.unit não duplica)');
run("NET.fxLog=[];G.players[0].hand=['goblins','arqueiras','cavaleiro','gigante'];G.players[0].elixir=10;TEAMS.sync();TEAMS.play(0,0,300,1300,'goblins');");
assert.ok(run("NET.fxLog.some(e=>e[2]==='AU.unit'&&e[3][0]==='goblins'&&e[3][1]==='deploy')"),'jogar uma carta grava o som de entrada dela');
const sounds=run("JSON.stringify(NET.capture().fx.filter(e=>e[1].startsWith('AU.')))");
run(`NET.role='guest';NET.team=1;NET.fxSeen=0;globalThis.heard=[];AU.unit=(...a)=>heard.push('unit:'+a[0]+':'+a[1]);AU.sfx=(...a)=>heard.push('sfx:'+a[0]);
 NET.ownSounds=[{id:'goblins',at:performance.now()}];NET.replayFx(${sounds});NET.replayFx([[999999,'AU.unit',['reibombado','deploy']],[1000000,'AU.sfx',['win']],[1000001,'AU.unit',['cavaleiro','step']]]);`);
assert.equal(run('heard.join()'),'','a entrada que o convidado já tocou não repete; carta, som ou momento desconhecidos são ignorados');
run(`NET.ownSounds=[];NET.fxSeen=0;NET.replayFx(${sounds});`);assert.equal(run('heard.join()'),'unit:goblins:deploy');
console.log('Online sounds: host records match sounds once, guest replays them, own deploy not repeated, unknown sounds ignored.');

// Princesa da Bolha: a bolha automática prende só tropas terrestres inimigas, que flutuam sem andar nem
// atacar, levam o dano do estouro e o da queda e voltam ao chão; voadores e torres ficam de fora.
run(`NET.active=false;NET.role=null;startMatch(testNormal,1);G.units.length=0;G.projs.length=0;
 globalThis.pr=spawnUnit('princesa','ally',576,1100,{deploy:0});globalThis.kn=spawnUnit('cavaleiro','foe',576,900,{deploy:0});globalThis.bt=spawnUnit('morcegos','foe',640,900,{deploy:0});
 for(const u of [pr,kn,bt])u.static=true;
 globalThis.world=(s,each=()=>{})=>{for(let i=0;i<Math.round(s*60);i++){for(const u of G.units)if(!u.dead)stepUnit(u,1/60);stepProjs(1/60);each();}};`);
assert.equal(run('CARD.princesa.hp'),450);assert.equal(run('CARD.princesa.custo'),5);assert.equal(run('CARD.princesa.alvo'),'chao');
run('world(1.4)');assert.equal(run('G.projs.length'),0,'a primeira bolha espera a recarga inicial');
run(`globalThis.casted=0;globalThis.launched=0;world(1.2,()=>{if(pr.cast>0)casted++;if(G.projs.some(p=>p.kind==='bubble'))launched++;});`);
assert.ok(run('casted')>20,'ela para e conjura antes de lançar');assert.ok(run('launched')>0,'a bolha voa até o alvo');
run(`world(1.2);globalThis.start={x:kn.x,y:kn.y,hp:kn.hp};`);
assert.ok(run('kn.bolha')>0&&run('kn.z')>40,'o cavaleiro inimigo flutua preso na bolha');assert.ok(!run('bt.bolha'),'morcego voa e não é preso');
run(`globalThis.attacked=0;world(.8,()=>{if(kn.attackWindup>0||kn.atk>0)attacked++;});`);
assert.equal(run('attacked'),0,'preso não ataca');assert.equal(run('kn.x===start.x&&kn.y===start.y'),true,'preso não anda');
const snap=JSON.parse(JSON.stringify(run("netPick([kn],'unit')[0]")));assert.ok(snap.bolha>0&&snap.z>0,'o estado da bolha vai para o convidado');
for(const name of ['bubbleCast','bubblePop','bubbleLand'])assert.ok(run(`NET_FX.includes('${name}')`),name+' é repetido no convidado');
run(`globalThis.popped=0;world(3,()=>{if(!popped&&kn.caindo)popped=kn.maxHp-kn.hp;});`);
assert.equal(run('popped'),150,'o estouro tira 150');assert.equal(run('kn.maxHp-kn.hp'),250,'estouro + queda tiram 250');
assert.equal(run('kn.z'),0);assert.equal(run('!!kn.caindo'),false);assert.equal(run('bt.hp'),run('bt.maxHp'));
// Recarga: a segunda bolha só vem 7 s depois da primeira.
run(`G.units.length=0;G.projs.length=0;globalThis.pr=spawnUnit('princesa','ally',576,1100,{deploy:0});globalThis.gg=spawnUnit('gigante','foe',576,950,{deploy:0});pr.static=gg.static=true;globalThis.casts=[];
 globalThis.t=0;world(10,()=>{t+=1/60;if(pr.cast>0&&(!casts.length||t-casts.at(-1)>1))casts.push(t);});`);
assert.equal(run('casts.length'),2);assert.ok(Math.abs(run('casts[1]-casts[0]')-7)<.1,'recarga de 7 s');
// Baralho com a Princesa: oito cartas diferentes entre as nove; a IA também pode usar.
assert.equal(run(`PROGRESS.sanitize(['princesa','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos']).join()`),'princesa,arqueiras,goblins,gigante,bolide,estalo,bombardeiro,morcegos');
assert.equal(run(`PROGRESS.sanitize(['princesa','princesa','goblins','gigante','bolide','estalo','bombardeiro','morcegos'])[0]`),'cavaleiro','repetida volta ao padrão');
assert.equal(run(`PROGRESS.sanitize(['princesa','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','reibombado'])[0]`),'cavaleiro','carta removida volta ao padrão');
assert.ok(run(`FOE_DECKS.some(d=>d.includes('princesa'))&&FOE_DECKS.every(d=>PROGRESS.sanitize(d).join()===d.join())`));
console.log('Princesa da Bolha: automatic bubble after cooldown, ground enemies float without moving or attacking, 150 pop + 100 fall damage, air units spared, 7 s recharge, state and effects reach guests, 8-of-9 deck validation.');
