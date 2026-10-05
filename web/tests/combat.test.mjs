import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {unitModel,towerModel} from '../src/game/models3d.js';
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
 const members=[...Array(sizes[0]).fill(0),...Array(sizes[1]).fill(1)].map((team,id)=>({team,id,name:'P'+id,deck:['reibombado','cavaleiro','arqueiras','goblins','gigante','bolide','estalo','morcegos']}));
 run(`NET.active=true;NET.role='host';NET.playerId=0;NET.team=0;NET.mode='${mode}';startMatch(testNormal,1);TEAMS.init(${JSON.stringify(members)},'${mode}');`);
 const before=run('G.players.map(p=>p.elixir)');run('TEAMS.tick(1,1)');const rates=run('G.players.map(p=>p.elixir-5)');assert.ok(Math.abs(rates.at(-1)/rates[0]-sizes[0]/sizes[1])<1e-9);
 // Every participant plays independently on their own team.
 for(const m of members){
  run(`G.players[${m.id}].hand=['reibombado','cavaleiro','arqueiras','goblins'];G.players[${m.id}].elixir=10;TEAMS.sync();`);
  assert.equal(run(`TEAMS.play(${m.id},0,224,${m.team===0?1400:200},'reibombado')`),true);
  const champ=run(`G.units.find(u=>u.playerId===${m.id}&&u.card.id==='reibombado')`);assert.ok(champ);
  run(`G.players[${m.id}].hand[0]='reibombado';G.players[${m.id}].elixir=10;TEAMS.sync();`);
  assert.equal(run(`TEAMS.play(${m.id},0,224,${m.team===0?1400:200},'reibombado')`),false);
  const wrong=(m.id+1)%members.length;assert.equal(run(`TEAMS.ability(${wrong},${champ.id},'bomba')`),false);
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
for(const art of ['knight','archer','goblin','skeleton','giant','colossus','mage','bomber','bat','drake','ram','cannon','coil','bombking','bwchamp','dollaltar','hologram']){
 const model=unitModel(art,'ally'),rig={};for(const key of ['leftLeg','rightLeg','leftArm','rightArm','leftWing','rightWing'])rig[key]=model.getObjectByName(key);
 const n={model,rig,oldX:0,oldY:0,angle:0},e={id:1,x:1,y:1,heading:.3,ph:2,moving:true,card:{art,deploy:1,proj:art==='archer'},attackWindup:.1,attackPrep:.18,atk:.5,hurt:.7,deploy:0};
 for(let i=0;i<30;i++)animateRig(n,e,i/60,1/60);for(const v of [...model.position,...model.rotation.toArray().slice(0,3),...model.scale])assert.ok(Number.isFinite(v));
 for(let i=0;i<30;i++)animateDeath(n,1/60);assert.ok(n.deathTime>.42);assert.ok(model.rotation.z>1);
}
for(const side of ['ally','foe'])for(const king of [true,false]){const model=towerModel(side,king);assert.ok(model.getObjectByName('turret'));}
console.log('Combat: independent players, one champion, ability ownership, team mirroring, snapshot serialization, delayed attack impact and all 3D rigs passed.');
// The two touch buttons operate the same champion and never expose a teammate's ability.
run(readFileSync('public/game/ui.js','utf8').split('const originalSyncHUD')[0]);
run("NET.active=true;NET.role='host';NET.playerId=0;NET.team=0;startMatch(testNormal,1);TEAMS.init([{id:0,team:0,name:'Own',deck:testNormal},{id:1,team:0,name:'Mate',deck:testNormal},{id:2,team:1,name:'Enemy',deck:testNormal}],'2v1');G.players[0].elixir=10;TEAMS.sync();const owned=spawnUnit('reibombado','ally',576,900,{deploy:0,playerId:0});owned.spawnT=0;const teammate=spawnUnit('reibombado','ally',620,900,{deploy:0,playerId:1});teammate.spawnT=0;const enemy=spawnUnit('cavaleiro','foe',576,840,{deploy:0,playerId:2});enemy.spawnT=0;owned.target=enemy;document.body.dataset.abilityPosition='both';syncChampionButtons();");
assert.equal(run("$('championButtons').children.length"),2);
assert.equal(run("$('championButtons').children[0].dataset.controlSide"),'left');assert.equal(run("$('championButtons').children[1].dataset.controlSide"),'right');
assert.equal(run('CHAMP_UI.buttons.length'),2);assert.equal(run('CHAMP_UI.buttons.every(v=>v.unitId===owned.id)'),true);
assert.equal(run('G.fields.length'),0);run('CHAMP_UI.buttons[0].button.onclick()');assert.equal(run('G.fields.length'),1);assert.equal(run('G.players[0].elixir'),8);
run('CHAMP_UI.buttons[1].button.onclick()');assert.equal(run('G.fields.length'),1);assert.equal(run('G.players[0].elixir'),8);
console.log('Champion touch UI: left/right copies share ownership, manual activation, elixir cost and cooldown.');
