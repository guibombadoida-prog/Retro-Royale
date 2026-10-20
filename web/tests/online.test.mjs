import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {harness} from './api-harness.mjs';
const profileUtils=harness().load('lib/player-profile.ts');
const normal=['cavaleiro','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos'];
const database=new DatabaseSync(':memory:');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())database.exec(readFileSync('drizzle/'+name,'utf8'));
class Query{
 constructor(sql,values=[]){this.sql=sql;this.values=values;}
 bind(...values){return new Query(this.sql,values);}
 async first(){return database.prepare(this.sql).get(...this.values)||null;}
 async all(){return {results:database.prepare(this.sql).all(...this.values)};}
 async run(){const out=database.prepare(this.sql).run(...this.values);return {meta:{changes:Number(out.changes)}};}
}
const db={prepare:sql=>new Query(sql),batch:async queries=>{database.exec('BEGIN');try{const result=[];for(const q of queries)result.push(await q.run());database.exec('COMMIT');return result;}catch(e){database.exec('ROLLBACK');throw e;}}};
function route(path){let source=readFileSync(path,'utf8').replace("import { getRoomDb } from '@/db';","const getRoomDb=()=>DB;");const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const ctx=vm.createContext({DB:db,exports:{},require:name=>{if(name==='@/lib/player-profile')return profileUtils;throw new Error(name);},Request,Response,URL,crypto:webcrypto,TextEncoder,console});vm.runInContext(code,ctx);return ctx.exports.POST;}
const room=route('app/api/room/route.ts'),profile=route('app/api/profile/route.ts');
async function call(fn,body,origin='https://game.test'){const response=await fn(new Request('https://game.test/api',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,...await response.json()};}
let assertions=0;
const eq=(a,b)=>{assert.deepEqual(a,b);assertions++;};
for(const [mode,sizes] of Object.entries({'1v1':[1,1],'2v1':[2,1],'2v2':[2,2],'3v1':[3,1]})){
 const count=sizes[0]+sizes[1],profiles=[];for(let i=0;i<count+1;i++)profiles.push(await call(profile,{}));
 eq(profiles[0].unlocked,[]);eq(profiles[0].battles,0);
 const blocked=await call(room,{action:'create',mode,deck:['reibombado',...normal.slice(0,7)],profileToken:profiles[0].token});eq(blocked.status,403);
 const host=await call(room,{action:'create',mode,deck:normal,profileToken:profiles[0].token,name:'Host'});eq(host.status,200);
 const members=[host];
 for(let i=1;i<count;i++)members.push(await call(room,{action:'join',code:host.code,deck:normal,profileToken:profiles[i].token,team:'auto',name:'P'+i}));
 eq(members.map(m=>m.playerId),Array.from({length:count},(_,i)=>i));eq(members.map(m=>m.team),[...Array(sizes[0]).fill(0),...Array(sizes[1]).fill(1)]);
 eq((await call(room,{action:'join',code:host.code,deck:normal,profileToken:profiles[count].token})).status,409);
 eq((await call(room,{action:'sync',...host})).allReady,false);
 for(const m of members)eq((await call(room,{action:'ready',code:m.code,token:m.token})).status,200);
 const lobby=await call(room,{action:'sync',code:host.code,token:host.token});eq(lobby.allReady,true);eq(lobby.progress.unlocked,[]);
 const snapshot={seq:1,state:'battle',units:[],towers:Array(6).fill({hp:4032}),players:members.map((m,i)=>({id:i,team:m.team,hand:normal.slice(0,4),next:normal[4]}))};
 eq((await call(room,{action:'sync',code:host.code,token:host.token,snapshot})).progress.unlocked,['reibombado']);
 for(let i=0;i<count;i++){const progress=await call(profile,{token:profiles[i].token});eq(progress.battles,1);eq(progress.unlocked,['reibombado']);}
 const guest=members.at(-1);eq((await call(room,{action:'sync',code:guest.code,token:guest.token})).snapshot.seq,1);
 eq((await call(room,{action:'sync',code:guest.code,token:guest.token,snapshot:{...snapshot,seq:3}})).snapshot.seq,1);
 const input={seq:1,idx:0,card:'cavaleiro',x:200,y:200};for(let i=0;i<2;i++)eq((await call(room,{action:'input',code:guest.code,token:guest.token,input:{...input,playerId:0}})).status,200);
 const sync=await call(room,{action:'sync',code:host.code,token:host.token,after:{}});eq(sync.inputs.length,1);eq(sync.inputs[0].playerId,guest.playerId);
 eq((await call(room,{action:'input',code:guest.code,token:guest.token,input:{...input,x:'bad'}})).status,400);
 eq((await call(room,{action:'sync',code:host.code,token:'x'.repeat(72)})).status,403);
 eq((await call(room,{action:'create',mode,profileToken:profiles[0].token,deck:['reibombado','pretobranco',...normal.slice(0,6)]})).status,400);
 eq((await call(room,{action:'create',mode,profileToken:profiles[0].token,deck:['reibombado',...normal.slice(0,7)]})).status,200);
 await call(room,{action:'leave',code:guest.code,token:guest.token});eq((await call(room,{action:'sync',code:host.code,token:host.token})).status,410);
}
eq((await call(room,{action:'create',mode:'toString'})).status,400);
eq((await call(room,null)).status,400);
eq((await call(profile,{},'https://other.test')).status,403);
console.log('Online API: '+assertions+' assertions passed across all four modes, champion locks, ownership, input deduplication and migrations.');
