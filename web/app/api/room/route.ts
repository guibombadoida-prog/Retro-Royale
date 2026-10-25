import { getRoomDb } from '@/db';
import { profileFor } from '@/lib/player-profile';

const CARDS = new Set(['cavaleiro','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos']);
const ABILITIES = new Set(['bomba','imaginacao','nucleo','realizacao','esboco','rascunho','tracado','invocar']);
const MODES: Record<string, readonly [number,number]> = {'1v1':[1,1],'2v1':[2,1],'2v2':[2,2],'3v1':[3,1]};
type Room = {code:string;mode:string;status:string;expires:number;snapshot:string|null;snapshot_seq:number};
type Player = {slot:number;team:number;name:string;token_hash:string;deck:string;ready:number;seen:number;offer:string|null;answer:string|null;profile_hash:string|null};
const json = (data:unknown,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function fail(message:string,status=400):never {throw Object.assign(new Error(message),{status});}
function deck(value:unknown) {
 if(!Array.isArray(value)||value.length!==8||new Set(value).size!==8||!value.every(v=>CARDS.has(v)))fail('Escolha oito cartas diferentes.');
 return JSON.stringify(value);
}
function playerName(value:unknown) {return typeof value==='string'?value.trim().replace(/[<>\x00-\x1f]/g,'').slice(0,18)||'Jogador':'Jogador';}
async function hash(token:string) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
const token = () => crypto.randomUUID()+crypto.randomUUID();
const slotsFor = (mode:string) => [...Array(MODES[mode][0]).fill(0),...Array(MODES[mode][1]).fill(1)];
async function profileDeck(db:D1Database,request:Request,b:{profileToken?:string;deck:unknown}){
 if(typeof b.profileToken!=='string'||b.profileToken.length!==72)fail('Aguarde seu perfil carregar.');
 const {profileHash:digest}=await profileFor(request,db,b.profileToken);
 const profile=await db.prepare('SELECT token_hash FROM player_profiles WHERE token_hash=?').bind(digest).first<{token_hash:string}>();
 if(!profile)fail('Seu perfil não foi encontrado.',403);
 const cards=JSON.parse(deck(b.deck));
 return {cards:JSON.stringify(cards),profileHash:digest};
}

export async function POST(request:Request) {
 try {
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem inválida.'},403);
  const body=await request.text();if(body.length>220000)return json({error:'Mensagem muito grande.'},413);
  const b=JSON.parse(body);if(!b||typeof b!=='object'||Array.isArray(b))fail('Mensagem inválida.');
  const db=getRoomDb(),now=Date.now();
  if(b.action==='create') {
   const mode=b.mode??'1v1';if(typeof mode!=='string'||!Object.hasOwn(MODES,mode))fail('Modo inválido.');
   const {cards,profileHash}=await profileDeck(db,request,b),secret=token(),digest=await hash(secret),name=playerName(b.name);
   await db.batch([
    db.prepare('DELETE FROM team_inputs WHERE code IN (SELECT code FROM team_rooms WHERE expires<?)').bind(now),
    db.prepare('DELETE FROM room_players WHERE code IN (SELECT code FROM team_rooms WHERE expires<?)').bind(now),
    db.prepare('DELETE FROM team_rooms WHERE expires<?').bind(now),
   ]);
   const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
   for(let n=0;n<4;n++) {
    const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),x=>alphabet[x%alphabet.length]).join('');
    const result=await db.prepare("INSERT OR IGNORE INTO team_rooms (code,mode,status,created,expires,snapshot_seq) VALUES (?,?,'waiting',?,?,0)").bind(code,mode,now,now+3600000).run();
    if(!result.meta.changes)continue;
    await db.prepare('INSERT INTO room_players (code,slot,team,name,token_hash,deck,ready,seen,profile_hash) VALUES (?,0,0,?,?,?,0,?,?)').bind(code,name,digest,cards,now,profileHash).run();
    return json({code,token:secret,role:'host',playerId:0,team:0,mode});
   }
   return json({error:'Tente criar a sala novamente.'},503);
  }
  if(typeof b.code!=='string'||!/^[A-Z2-9]{6}$/.test(b.code))fail('Digite o código de 6 caracteres.');
  const room=await db.prepare('SELECT * FROM team_rooms WHERE code=? AND expires>?').bind(b.code,now).first<Room>();
  if(!room)fail('Sala inexistente ou expirada. Crie outra sala.',404);
  if(room.status==='closed')fail('A partida foi encerrada porque um jogador saiu.',410);
  if(b.action==='join') {
   if(room.status!=='waiting')fail('Esta partida já começou.',409);
   const {cards,profileHash}=await profileDeck(db,request,b),secret=token(),digest=await hash(secret),name=playerName(b.name);
   const host=await db.prepare('SELECT seen FROM room_players WHERE code=? AND slot=0').bind(b.code).first<{seen:number}>();
   if(!host||host.seen<now-90000)fail('O criador da sala está desconectado.',409);
   const desired=b.team==='auto'||b.team===undefined?null:Number(b.team);
   if(desired!==null&&desired!==0&&desired!==1)fail('Equipe inválida.');
   for(const [slot,team] of slotsFor(room.mode).entries()) {
    if(slot===0||desired!==null&&desired!==team)continue;
    const result=await db.prepare("INSERT OR IGNORE INTO room_players (code,slot,team,name,token_hash,deck,ready,seen,profile_hash) SELECT ?,?,?,?,?,?,0,?,? WHERE EXISTS (SELECT 1 FROM team_rooms WHERE code=? AND status='waiting' AND expires>?) AND NOT EXISTS (SELECT 1 FROM room_players WHERE code=? AND profile_hash=?)").bind(b.code,slot,team,name,digest,cards,now,profileHash,b.code,now,b.code,profileHash).run();
    if(result.meta.changes)return json({code:b.code,token:secret,role:'guest',playerId:slot,team,mode:room.mode});
   }
   fail('Equipe ou sala cheia. Escolha outra equipe.',409);
  }
  if(typeof b.token!=='string'||b.token.length!==72)fail('Entre novamente na sala.',401);
  const digest=await hash(b.token);
  const own=await db.prepare('SELECT * FROM room_players WHERE code=? AND token_hash=?').bind(b.code,digest).first<Player>();
  if(!own)fail('Acesso à sala recusado.',403);
  const role=own.slot===0?'host':'guest';
  if(b.action==='leave') {
   if(role==='host'||room.status==='playing')await db.prepare("UPDATE team_rooms SET status='closed',expires=? WHERE code=?").bind(now+60000,b.code).run();
   else await db.batch([db.prepare('DELETE FROM team_inputs WHERE code=? AND player_id=?').bind(b.code,own.slot),db.prepare('DELETE FROM room_players WHERE code=? AND slot=?').bind(b.code,own.slot)]);
   return json({ok:true});
  }
  if(b.action==='ready') {
   await db.prepare('UPDATE room_players SET ready=1,seen=? WHERE code=? AND slot=?').bind(now,b.code,own.slot).run();return json({ok:true});
  }
  if(b.action==='signal') {
   if(typeof b.sdp!=='string'||b.sdp.length>24000)fail('Conexão inválida.');
   const signal=JSON.parse(b.sdp);if(signal.type!==(role==='host'?'offer':'answer')||typeof signal.sdp!=='string')fail('Conexão inválida.');
   const target=role==='host'?b.target:own.slot;
   if(!Number.isInteger(target)||target<1||target>=slotsFor(room.mode).length)fail('Jogador inválido.');
   const field=role==='host'?'offer':'answer';
   await db.prepare('UPDATE room_players SET '+field+'=?'+(role==='host'?',answer=NULL':'')+' WHERE code=? AND slot=?').bind(b.sdp,b.code,target).run();return json({ok:true});
  }
  if(b.action==='input') {
   if(role!=='guest'||room.status!=='playing')fail('Ação inválida.',403);
   const p=b.input;if(!p||!Number.isInteger(p.seq)||p.seq<1||p.seq>5000)fail('Jogada inválida.');
   let command;
   if(p.kind==='ability') {
    if(!Number.isSafeInteger(p.unitId)||p.unitId<1||p.unitId>1000000||!ABILITIES.has(p.ability))fail('Habilidade inválida.');
    command={seq:p.seq,kind:'ability',unitId:p.unitId,ability:p.ability};
   }else {
    if(!Number.isInteger(p.idx)||p.idx<0||p.idx>3||!CARDS.has(p.card)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1152||p.y<0||p.y>1664)fail('Jogada inválida.');
    command={seq:p.seq,idx:p.idx,card:p.card,x:p.x,y:p.y};
   }
   await db.prepare('INSERT OR IGNORE INTO team_inputs (code,player_id,seq,payload,created) VALUES (?,?,?,?,?)').bind(b.code,own.slot,p.seq,JSON.stringify(command),now).run();return json({ok:true});
  }
  if(b.action!=='sync')fail('Ação desconhecida.');
  await db.prepare('UPDATE room_players SET seen=? WHERE code=? AND slot=?').bind(now,b.code,own.slot).run();
  const members=(await db.prepare('SELECT * FROM room_players WHERE code=? ORDER BY slot').bind(b.code).all<Player>()).results;
  const allReady=members.length===slotsFor(room.mode).length&&members.every(p=>p.ready&&p.seen>now-20000);
  if(role==='host'&&b.snapshot!==undefined) {
   const s=b.snapshot;
   if(!s||!Number.isSafeInteger(s.seq)||s.seq<1||s.seq>1000000||!Array.isArray(s.units)||s.units.length>500||!Array.isArray(s.towers)||s.towers.length!==6||!Array.isArray(s.players)||s.players.length!==slotsFor(room.mode).length)fail('Estado de partida inválido.');
   const encoded=JSON.stringify(s);if(encoded.length>200000)fail('Estado muito grande.',413);
   if(room.status==='playing'||allReady)await db.prepare("UPDATE team_rooms SET snapshot=?,snapshot_seq=?,status='playing' WHERE code=? AND snapshot_seq<?").bind(encoded,s.seq,b.code,s.seq).run();
  }
  const current=await db.prepare('SELECT * FROM team_rooms WHERE code=?').bind(b.code).first<Room>();if(!current)fail('Sala indisponível.',404);
  // An actual fully ready online match credits each profile once. Joining a lobby or playing AI never does.
  if(room.status==='waiting'&&current.status==='playing'&&allReady)for(const p of members)if(p.profile_hash){
   await db.batch([
    db.prepare('INSERT OR IGNORE INTO profile_battles (profile_hash,code) VALUES (?,?)').bind(p.profile_hash,b.code),
    db.prepare('UPDATE player_profiles SET battles=(SELECT COUNT(*) FROM profile_battles WHERE profile_hash=?),unlocked=? WHERE token_hash=?').bind(p.profile_hash,'[]',p.profile_hash),
   ]);
  }
  const progress=own.profile_hash?await db.prepare('SELECT battles,unlocked FROM player_profiles WHERE token_hash=?').bind(own.profile_hash).first<{battles:number;unlocked:string}>():null;
  const commands:{playerId:number;input:unknown}[]=[];
  if(role==='host')for(const p of members)if(p.slot!==0) {
   const after=Number.isSafeInteger(b.after?.[p.slot])?Math.max(0,b.after[p.slot]-12):0;
   const results=await db.prepare('SELECT payload FROM team_inputs WHERE code=? AND player_id=? AND seq>? ORDER BY seq LIMIT 40').bind(b.code,p.slot,after).all<{payload:string}>();
   commands.push(...results.results.map(q=>({playerId:p.slot,input:JSON.parse(q.payload)})));
  }
  return json({code:current.code,mode:current.mode,role,playerId:own.slot,team:own.team,status:current.status,allReady,capacity:slotsFor(room.mode).length,
   players:members.map(p=>({id:p.slot,team:p.team,name:p.name,ready:!!p.ready,seen:p.seen,deck:role==='host'?JSON.parse(p.deck):undefined,offer:role==='guest'&&p.slot===own.slot?p.offer:undefined,answer:role==='host'?p.answer:undefined})),
   snapshot:role==='guest'&&current.snapshot&&current.snapshot_seq>(Number(b.since)||0)?JSON.parse(current.snapshot):null,inputs:commands,progress:progress?{battles:progress.battles,unlocked:JSON.parse(progress.unlocked)}:null,serverTime:now});
 } catch(error) {
  const e=error as Error&{status?:number};if(e.status)return json({error:e.message},e.status);
  if(e instanceof SyntaxError)return json({error:'Mensagem inválida.'},400);
  console.error('room_api',e.message);return json({error:'Não foi possível conectar à sala. Tente novamente.'},503);
 }
}
