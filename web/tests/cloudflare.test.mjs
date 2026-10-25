import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {ensureDatabase,serverUrl,withDatabaseId,workersSubdomain} from '../../tools/cloudflare.mjs';
const token='t',account='acc',calls=[];let databases=[],subdomain='gui',health={ok:true,service:'retro-royale'};
const fetch=async(url,options={})=>{
 calls.push((options.method||'GET')+' '+url.replace('https://api.cloudflare.com/client/v4',''));
 if(url.endsWith('/api/health'))return health?Response.json(health):Response.json({},{status:404});
 assert.equal(options.headers.Authorization,'Bearer t');
 if(url.endsWith('/workers/subdomain'))return subdomain?Response.json({success:true,result:{subdomain}}):Response.json({success:false,errors:[{code:10007,message:'not found'}]},{status:404});
 if(url.includes('/d1/database?name='))return Response.json({success:true,result:databases});
 if(url.endsWith('/d1/database')&&options.method==='POST'){const db={uuid:'11111111-2222-3333-4444-555555555555',name:JSON.parse(options.body).name};databases.push(db);return Response.json({success:true,result:db});}
 return Response.json({success:false,errors:[{message:'unexpected'}]},{status:400});
};
// Banco: cria na primeira vez, reaproveita depois.
assert.deepEqual(await ensureDatabase({token,account,fetch}),{id:'11111111-2222-3333-4444-555555555555',created:true});
assert.deepEqual(await ensureDatabase({token,account,fetch}),{id:'11111111-2222-3333-4444-555555555555',created:false});
assert.equal(calls.filter(c=>c.startsWith('POST')).length,1);
// O database_id entra no wrangler.jsonc real sem quebrar o resto.
const config=readFileSync('wrangler.jsonc','utf8'),patched=withDatabaseId(config,'11111111-2222-3333-4444-555555555555');
assert.match(patched,/"database_name": "retro-royale", "database_id": "11111111-2222-3333-4444-555555555555"/);
assert.equal(patched.replace(', "database_id": "11111111-2222-3333-4444-555555555555"',''),config);
assert.throws(()=>withDatabaseId(config,'nao-e-uuid'));assert.throws(()=>withDatabaseId(config.replace('"database_name": "retro-royale"','"database_name": "outro"'),'11111111-2222-3333-4444-555555555555'));
// Endereço: workers.dev da conta, só quando o servidor responde como o jogo.
assert.equal(await workersSubdomain({token,account,fetch}),'gui');
assert.equal(await serverUrl({token,account,fetch}),'https://retro-royale.gui.workers.dev/');
health={ok:true,service:'outro'};assert.equal(await serverUrl({token,account,fetch}),'');
health=null;assert.equal(await serverUrl({token,account,fetch}),'');
health={ok:true,service:'retro-royale'};assert.equal(await serverUrl({token:'',account:'',fetch}),'');
assert.equal(await serverUrl({override:'https://jogo.exemplo.com',fetch}),'https://jogo.exemplo.com/');
subdomain='';await assert.rejects(()=>serverUrl({token,account,fetch}),/workers\.dev/);
console.log('Cloudflare helper: D1 database created once and reused, database_id patched into wrangler.jsonc, server URL only when the game health check answers, missing workers.dev subdomain explained.');
