// Ajuda os workflows a falar com a conta Cloudflare do dono (API v4, só fetch, sem dependências).
//   node tools/cloudflare.mjs banco     garante que o banco D1 "retro-royale" existe e grava o database_id
//                                       em web/wrangler.jsonc (só na máquina do CI; não é commitado)
//   node tools/cloudflare.mjs endereco  escreve "url=<endereço do servidor>" (ou "url=" se ele não estiver no ar)
// Usa os segredos CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID. ONLINE_URL (variável do repositório) troca o
// endereço automático do workers.dev por um domínio próprio.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const WORKER='retro-royale',DATABASE='retro-royale';
const API='https://api.cloudflare.com/client/v4';
const WRANGLER_CONFIG=fileURLToPath(new URL('../web/wrangler.jsonc',import.meta.url));

async function cf(path,{token,fetch=globalThis.fetch,method='GET',body}={}){
 const r=await fetch(API+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||data.success===false){
  const detail=(data.errors||[]).map(e=>e.message).join('; ')||'HTTP '+r.status;
  throw new Error(`Cloudflare recusou ${method} ${path}: ${detail}`);
 }
 return data.result;
}

export async function workersSubdomain({token,account,fetch}){
 let result;
 try{result=await cf(`/accounts/${account}/workers/subdomain`,{token,fetch});}catch(e){result=null;}
 if(!result?.subdomain)throw new Error('Sua conta Cloudflare ainda não tem um endereço workers.dev. Abra "Workers e Pages" no painel da Cloudflare uma vez, escolha o nome do subdomínio e rode o workflow de novo.');
 return result.subdomain;
}

export async function ensureDatabase({token,account,fetch}){
 const found=(await cf(`/accounts/${account}/d1/database?name=${DATABASE}`,{token,fetch})||[]).find(db=>db.name===DATABASE);
 if(found)return {id:found.uuid,created:false};
 const db=await cf(`/accounts/${account}/d1/database`,{token,fetch,method:'POST',body:{name:DATABASE}});
 return {id:db.uuid,created:true};
}

export function withDatabaseId(config,id){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('database_id inválido: '+id);
 const from=`"database_name": "${DATABASE}"`;
 if(config.split(from).length!==2)throw new Error(`esperava "${from}" uma vez em web/wrangler.jsonc`);
 return config.replace(from,`${from}, "database_id": "${id}"`);
}

// Só devolve o endereço se o servidor responder como o jogo (mesma checagem do connection.js).
export async function serverUrl({token,account,override,fetch=globalThis.fetch}){
 let url=override?.trim();
 if(!url&&token&&account)url=`https://${WORKER}.${await workersSubdomain({token,account,fetch})}.workers.dev/`;
 if(!url)return '';
 if(!url.endsWith('/'))url+='/';
 try{
  const r=await fetch(url+'api/health',{signal:AbortSignal.timeout(10000)}),d=await r.json();
  return r.ok&&d.ok===true&&d.service==='retro-royale'?url:'';
 }catch(e){return '';}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const token=process.env.CLOUDFLARE_API_TOKEN?.trim(),account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
 try{
  if(process.argv[2]==='banco'){
   if(!token||!account)throw new Error('Faltam os segredos CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID.');
   await workersSubdomain({token,account});
   const db=await ensureDatabase({token,account});
   writeFileSync(WRANGLER_CONFIG,withDatabaseId(readFileSync(WRANGLER_CONFIG,'utf8'),db.id));
   console.log(`Banco D1 "${DATABASE}" ${db.created?'criado':'encontrado'} (${db.id}).`);
  }else if(process.argv[2]==='endereco'){
   let url='';
   try{url=await serverUrl({token,account,override:process.env.ONLINE_URL});}catch(e){console.error(e.message);}
   console.error(url?'Servidor online no ar: '+url:'Servidor online ainda não está no ar; o site e o APK ficam só com o treino.');
   console.log('url='+url);
  }else throw new Error('Use: node tools/cloudflare.mjs banco | endereco');
 }catch(e){console.error('cloudflare: '+e.message);process.exit(1);}
}
