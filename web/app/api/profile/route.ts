import { getRoomDb } from '@/db';
import { accountFor,assertOrigin,apiError,hashToken,newToken,validToken,validDeck,validSettings,profileData,type Profile } from '@/lib/player-profile';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 try{
  assertOrigin(request);const text=await request.text();if(text.length>4096)apiError('Mensagem inválida.',413);const b=JSON.parse(text);if(!b||typeof b!=='object'||Array.isArray(b))apiError('Mensagem inválida.');
  const db=getRoomDb(),account=await accountFor(request,db);let secret=validToken(b.token)?b.token:null;
  if(!secret){secret=newToken();await db.prepare('INSERT INTO player_profiles (token_hash,battles,unlocked,created) VALUES (?,0,?,?)').bind(await hashToken(secret),'[]',Date.now()).run();}
  const profileHash=account?.profile_hash||await hashToken(secret);let profile=await db.prepare('SELECT * FROM player_profiles WHERE token_hash=?').bind(profileHash).first<Profile>();if(!profile)apiError('Perfil indisponível. Tente novamente.',404);
  if(b.save===true){
   if(!Number.isSafeInteger(b.revision)||b.revision<0)apiError('Versão de progresso inválida.');const deck=validDeck(b.deck,JSON.parse(profile.unlocked)),settings=validSettings(b.settings);
   const update=await db.prepare('UPDATE player_profiles SET deck=?,settings=?,revision=revision+1 WHERE token_hash=? AND revision=?').bind(JSON.stringify(deck),JSON.stringify(settings),profileHash,b.revision).run();
   profile=(await db.prepare('SELECT * FROM player_profiles WHERE token_hash=?').bind(profileHash).first<Profile>())!;
   if(!update.meta.changes)return json({error:'Seu progresso mudou em outro dispositivo.',conflict:true,...profileData(profile,account)},409);
  }
  return json({token:secret,...profileData(profile,account)});
 }catch(e){const error=e as Error&{status?:number};if(error.status)return json({error:error.message},error.status);if(e instanceof SyntaxError)return json({error:'Mensagem inválida.'},400);console.error('profile_api',error.message);return json({error:'Não foi possível carregar seu progresso.'},503);}
}
