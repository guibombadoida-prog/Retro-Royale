import assert from 'node:assert/strict';
import {harness} from './api-harness.mjs';

// Sala ao vivo (lib/live-room.ts): quem pode entrar e como o Durable Object repassa as mensagens.
class FakeSocket{
 constructor(){this.sent=[];this.closed=null;this.attachment=null;this.tags=[];}
 send(m){if(this.closed)throw new Error('fechado');this.sent.push(m);}
 close(code,reason){this.closed=[code,reason];}
 serializeAttachment(v){this.attachment=JSON.parse(JSON.stringify(v));}
 deserializeAttachment(){return this.attachment;}
 last(){return JSON.parse(this.sent.at(-1));}
}
class WebSocketPair{constructor(){this[0]=new FakeSocket();this[1]=new FakeSocket();}}
// O Response do Node não aceita 101 (troca de protocolo); este guarda o status e o socket do cliente.
class LiveResponse extends Response{constructor(body,init={}){super(body,{...init,status:init.status===101?200:init.status});this.realStatus=init.status??200;this.webSocket=init.webSocket;}}
const h=harness({globals:{WebSocketPair,Response:LiveResponse}});
const {openLiveRoom,RoomLive,LIVE_PROTOCOL}=h.load('lib/live-room.ts');
const deck=['cavaleiro','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos'];
let assertions=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);assertions++;};

const profiles=[];for(let i=0;i<3;i++)profiles.push((await h.call('/api/profile',{})).data.token);
const host=(await h.call('/api/room',{action:'create',mode:'2v1',deck,profileToken:profiles[0],name:'Anfitrião'})).data;
const guest=(await h.call('/api/room',{action:'join',code:host.code,team:'0',deck,profileToken:profiles[1],name:'Convidado'})).data;
eq([host.playerId,guest.playerId],[0,1]);

// Namespace falso: registra para qual sala e com qual lugar (slot) o Worker entregou a conexão.
const delivered=[];
const LIVE={idFromName:name=>'id:'+name,get:id=>({fetch:async request=>{delivered.push({id,slot:request.headers.get('X-Live-Slot')});return new LiveResponse('ok');}})};
const ask=(token,{code=host.code,origin='https://game.test',upgrade='websocket',protocol=LIVE_PROTOCOL,slot}={})=>{
 const headers={Upgrade:upgrade,Origin:origin,'Sec-WebSocket-Protocol':protocol+', '+token};if(slot!==undefined)headers['X-Live-Slot']=slot;
 return openLiveRoom(new Request('https://game.test/api/live?code='+code,{headers}),LIVE);
};
eq((await openLiveRoom(new Request('https://game.test/api/live?code='+host.code),undefined)).status,503,'sem o Durable Object configurado');
eq((await ask(host.token,{upgrade:''})).status,426,'precisa ser WebSocket');
eq((await ask(host.token,{origin:'https://outro.site'})).status,403,'outra origem');
eq((await ask(host.token,{protocol:'outro'})).status,401,'protocolo errado');
eq((await ask('x'.repeat(72))).status,401,'token com formato inválido');
eq((await ask(crypto.randomUUID()+crypto.randomUUID())).status,403,'token que não é da sala');
eq((await ask(guest.token,{code:'ZZZZZZ'})).status,403,'token de outra sala');
eq((await ask(host.token)).status,200);eq(delivered.at(-1),{id:'id:'+host.code,slot:'0'});
// O lugar vem do banco, nunca do cliente.
eq((await ask(guest.token,{slot:'0'})).status,200);eq(delivered.at(-1).slot,'1','o convidado não vira anfitrião');
// Sala encerrada (o anfitrião saiu) não aceita mais ninguém.
eq((await h.call('/api/room',{action:'leave',code:host.code,token:host.token})).status,200);
eq((await ask(guest.token)).status,403,'sala encerrada');

// Durable Object: aceita, repassa e avisa quem está conectado.
const sockets=[];
const state={acceptWebSocket(ws,tags){ws.tags=tags;sockets.push(ws);},getWebSockets(tag){return sockets.filter(ws=>!ws.closed&&(tag===undefined||ws.tags.includes(tag)));}};
const room=new RoomLive(state);
const join=async slot=>{const r=await room.fetch(new Request('https://do/',{headers:{'X-Live-Slot':String(slot)}}));eq(r.realStatus,101);eq(r.headers.get('Sec-WebSocket-Protocol'),LIVE_PROTOCOL);return sockets.at(-1);};
eq((await room.fetch(new Request('https://do/',{headers:{'X-Live-Slot':'9'}}))).status,400,'lugar inválido');
const h0=await join(0),g1=await join(1),g2=await join(2);
eq(g2.last(),{type:'roster',slots:[0,1,2]});eq(h0.last(),{type:'roster',slots:[0,1,2]});
// Anfitrião → todos os convidados (sem eco para ele mesmo).
const before=h0.sent.length;room.webSocketMessage(h0,'{"type":"snapshot","state":{"seq":1}}');
eq(g1.last(),{type:'snapshot',state:{seq:1}});eq(g2.last(),{type:'snapshot',state:{seq:1}});eq(h0.sent.length,before);
// Mensagem com "to" vai só para aquele jogador.
room.webSocketMessage(h0,'{"to":2,"type":"pong","at":5}');eq(g2.last(),{to:2,type:'pong',at:5});eq(g1.last().type,'snapshot');
// Convidado → só o anfitrião, com o remetente carimbado pelo servidor (não dá para se passar por outro).
room.webSocketMessage(g1,JSON.stringify({type:'input',input:{seq:1},from:0}));
eq(h0.last(),{type:'input',input:{seq:1},from:1});eq(g2.last().type,'pong');
const count=h0.sent.length;
room.webSocketMessage(g1,'isto não é json');room.webSocketMessage(g1,'[1,2]');room.webSocketMessage(g1,JSON.stringify({type:'input',x:'a'.repeat(3000)}));
eq(h0.sent.length,count,'mensagem inválida ou grande demais é descartada');
// Limite por segundo contra inundação.
for(let i=0;i<40;i++)room.webSocketMessage(g2,JSON.stringify({type:'ping',at:i}));
eq(h0.sent.length-count,20,'no máximo 20 mensagens por segundo de um convidado');
// Reconexão do mesmo lugar fecha a anterior; saída atualiza a lista.
const g1b=await join(1);eq(g1.closed?.[0],4001);eq(g1b.last(),{type:'roster',slots:[0,2,1]});
g2.closed=[1000,''];room.webSocketClose(g2);eq(h0.last(),{type:'roster',slots:[0,1]});
console.log(`Live room: ${assertions} assertions passed (token in the protocol header, slot from D1, host broadcast, targeted pong, sender stamped, size and rate limits, reconnect).`);
