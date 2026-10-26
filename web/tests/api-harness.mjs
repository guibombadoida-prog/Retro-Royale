import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
export function harness({env={},fetch=globalThis.fetch,globals={}}={}){
 const database=new DatabaseSync(':memory:');for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())database.exec(readFileSync('drizzle/'+name,'utf8'));
 class Query{constructor(sql,values=[]){this.sql=sql;this.values=values;}bind(...values){return new Query(this.sql,values);}first(){return database.prepare(this.sql).get(...this.values)||null;}all(){return {results:database.prepare(this.sql).all(...this.values)};}run(){const r=database.prepare(this.sql).run(...this.values);return {meta:{changes:Number(r.changes)}};}}
 const db={prepare:s=>new Query(s),batch:queries=>{database.exec('BEGIN');try{const results=[];for(const q of queries)results.push(q.run());database.exec('COMMIT');return results;}catch(e){database.exec('ROLLBACK');throw e;}}};
 const modules=new Map();
 function load(path){if(modules.has(path))return modules.get(path);const exports={};modules.set(path,exports);const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const require=name=>{if(name==='@/db')return {getRoomDb:()=>db};if(name==='cloudflare:workers')return {env};if(name==='./player-profile'||name==='@/lib/player-profile')return load('lib/player-profile.ts');if(name==='@/lib/email-account')return load('lib/email-account.ts');throw new Error('Unknown import '+name);};
  vm.runInNewContext(code,{exports,require,Request,Response,Headers,URL,URLSearchParams,AbortSignal,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,fetch,console,...globals});return exports;
 }
 async function call(path,body,options={}){const method=body===undefined?'GET':'POST',headers={...(method==='POST'?{'Content-Type':'application/json',Origin:'https://game.test'}:{}),...(options.cookie?{Cookie:options.cookie}:{}),...options.headers};const req=new Request('https://game.test'+path,{method,headers,...(method==='POST'?{body:JSON.stringify(body)}:{})});const route=path.startsWith('/api/account/')?'app/api/account/[action]/route.ts':path.startsWith('/api/room')?'app/api/room/route.ts':'app/api/profile/route.ts';const response=await load(route)[method](req);const raw=await response.text();let data;try{data=JSON.parse(raw);}catch(e){data={html:raw};}return {status:response.status,data,headers:response.headers};}
 return {database,db,load,call};
}
