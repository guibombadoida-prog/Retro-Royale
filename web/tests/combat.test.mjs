import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {unitModel,towerModel,projectileModel,rubbleModel,setLowDetail} from '../src/game/models3d.js';
import {animateRig,animateDeath} from '../src/game/animation.js';
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
for(const art of ['knight','archer','goblin','giant','bomber','bat']){
 const model=unitModel(art,'ally'),rig={};for(const key of ['leftLeg','rightLeg','leftArm','rightArm','leftWing','rightWing','head','prop'])rig[key]=model.getObjectByName(key);
 if(art==='bat')assert.ok(rig.leftWing&&rig.rightWing);else for(const key of ['leftLeg','rightLeg','leftArm','rightArm','head'])assert.ok(rig[key],art+' sem '+key);
 if(art==='bomber')assert.ok(rig.prop,'bombardeiro sem a bomba separada');
 assert.ok(model.userData.style&&model.userData.height>.5);
 // Orçamento do celular: cada tropa (sem o contorno) fica abaixo de 4.500 triângulos.
 assert.ok(triangles(model)<4500,art+' tem '+triangles(model)+' triângulos');
 const n={model,rig,oldX:0,oldY:0,angle:0},e={id:1,x:1,y:1,heading:.3,ph:2,moving:true,card:{art,deploy:1,proj:art==='archer'},attackWindup:.1,attackPrep:.18,atk:0,hurt:.7,deploy:.8,air:art==='bat',stun:0};
 const phases=[{attackWindup:.12},{attackWindup:0,atk:1},{atk:.4,moving:false},{stun:.5,atk:0},{stun:0,deploy:0,hurt:0}];
 for(const phase of phases){Object.assign(e,phase);for(let i=0;i<12;i++)animateRig(n,e,i/60,1/60);finite(model);}
 if(rig.prop){e.atk=1;animateRig(n,e,1,1/60);assert.ok(rig.prop.scale.x<.01,'a bomba some ao ser lançada');}
 for(let i=0;i<30;i++)animateDeath(n,1/60);assert.ok(n.deathTime>.42);assert.ok(Math.abs(model.rotation.z)>1);finite(model);
}
for(const side of ['ally','foe'])for(const king of [true,false]){const model=towerModel(side,king);assert.ok(model.getObjectByName('turret'));assert.ok(triangles(model)<7500);}
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
