import { getRoomDb } from '@/db';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function hash(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function POST(request:Request){
 try{
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem inválida.'},403);
  const text=await request.text();if(text.length>512)return json({error:'Mensagem inválida.'},413);
  const b=JSON.parse(text);if(!b||typeof b!=='object'||Array.isArray(b))return json({error:'Mensagem inválida.'},400);
  const db=getRoomDb();
  let secret=typeof b.token==='string'&&b.token.length===72?b.token:null;
  if(!secret){secret=crypto.randomUUID()+crypto.randomUUID();await db.prepare('INSERT INTO player_profiles (token_hash,battles,unlocked,created) VALUES (?,0,?,?)').bind(await hash(secret),'[]',Date.now()).run();}
  const profile=await db.prepare('SELECT battles,unlocked FROM player_profiles WHERE token_hash=?').bind(await hash(secret)).first<{battles:number;unlocked:string}>();
  if(!profile)return json({error:'Perfil indisponível. Tente novamente.'},404);
  return json({token:secret,battles:profile.battles,unlocked:JSON.parse(profile.unlocked)});
 }catch(e){console.error('profile_api',e instanceof Error?e.message:'Falha de perfil');return json({error:'Não foi possível carregar seu progresso.'},503);}
}
