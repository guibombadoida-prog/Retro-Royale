import { getRoomDb } from '@/db';
import { CODE_TTL,RESEND_DELAY,emailConfig,normalizeEmail,newCode,sendLoginCode,linkEmail } from '@/lib/email-account';
import { apiError,assertOrigin,accountFor,hashToken,newToken,validToken,cookie,sessionCookie } from '@/lib/player-profile';

const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200,extra:Record<string,string>={})=>Response.json(data,{status,headers:{...headers,...extra}});
const hour=3600000;
async function assertOutsideRoom(db:D1Database,profileHash:string,now:number){
 if(await db.prepare("SELECT 1 FROM room_players p JOIN team_rooms r ON r.code=p.code WHERE p.profile_hash=? AND r.status IN ('waiting','playing') AND r.expires>? AND p.seen>?").bind(profileHash,now,now-30000).first())apiError('Saia da sala antes de entrar na conta.',409);
}
export async function GET(request:Request){
 if(new URL(request.url).pathname.split('/').pop()==='config')return json({emailReady:emailConfig().ready,provider:'email-code',digits:6});
 return json({error:'Rota não encontrada.'},404);
}
export async function POST(request:Request){
 try{
  assertOrigin(request);const text=await request.text();if(text.length>1024)apiError('Mensagem inválida.',413);
  let b;try{b=JSON.parse(text);}catch{apiError('Mensagem inválida.');}
  if(!b||typeof b!=='object'||Array.isArray(b))apiError('Mensagem inválida.');
  const action=new URL(request.url).pathname.split('/').pop(),db=getRoomDb(),now=Date.now();
  if(action==='logout'){
   const raw=cookie(request,'rr_session');if(validToken(raw))await db.prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(await hashToken(raw)).run();
   return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
  }
  if(!['request-code','verify-code'].includes(action||''))return json({error:'Rota não encontrada.'},404);
  if(!emailConfig().ready)return json({error:'O envio de códigos ainda não foi ativado no jogo.',configured:false},503);
  if(await accountFor(request,db))apiError('Você já está conectado. Saia da conta para usar outro e-mail.',409);
  if(!validToken(b.profileToken))apiError('Seu perfil ainda está carregando.');
  const guestHash=await hashToken(b.profileToken);
  if(!await db.prepare('SELECT token_hash FROM player_profiles WHERE token_hash=?').bind(guestHash).first())apiError('Perfil indisponível.',403);
  await assertOutsideRoom(db,guestHash,now);
  if(action==='request-code'){
   const email=normalizeEmail(b.email),challenge=newToken(),challengeHash=await hashToken(challenge),code=newCode();
   // Cloudflare supplies this header. Other runtimes use the device profile as the source limit.
   const ip=request.headers.get('cf-connecting-ip'),sourceHash=ip?await hashToken('ip:'+ip):guestHash;
   await db.batch([
    db.prepare('DELETE FROM email_login_codes WHERE created<?').bind(now-24*hour),
    db.prepare('DELETE FROM account_sessions WHERE expires<?').bind(now)
   ]);
   // One conditional statement reserves a send and enforces limits even for concurrent requests.
   const reserved=await db.prepare(`INSERT INTO email_login_codes (challenge_hash,email,guest_hash,source_hash,code_hash,created,expires)
    SELECT ?,?,?,?,?,?,? WHERE
    NOT EXISTS (SELECT 1 FROM email_login_codes WHERE email=? AND created>?) AND
    (SELECT COUNT(*) FROM email_login_codes WHERE email=? AND created>?)<5 AND
    (SELECT COUNT(*) FROM email_login_codes WHERE guest_hash=? AND created>?)<10 AND
    (SELECT COUNT(*) FROM email_login_codes WHERE source_hash=? AND created>?)<20`)
    .bind(challengeHash,email,guestHash,sourceHash,await hashToken(challenge+'.'+code),now,now+CODE_TTL,email,now-RESEND_DELAY,email,now-hour,guestHash,now-hour,sourceHash,now-hour).run();
   if(!reserved.meta.changes){
    const rows=await db.prepare('SELECT email,guest_hash,source_hash,created FROM email_login_codes WHERE created>? AND (email=? OR guest_hash=? OR source_hash=?) ORDER BY created').bind(now-hour,email,guestHash,sourceHash).all<{email:string;guest_hash:string;source_hash:string;created:number}>();
    const sameEmail=rows.results.filter(r=>r.email===email),sameGuest=rows.results.filter(r=>r.guest_hash===guestHash),sameSource=rows.results.filter(r=>r.source_hash===sourceHash);
    const waits=[1,(sameEmail.at(-1)?.created||0)+RESEND_DELAY-now];
    for(const [list,limit] of [[sameEmail,5],[sameGuest,10],[sameSource,20]] as const)if(list.length>=limit)waits.push(list[list.length-limit].created+hour-now);
    const retryAfter=Math.max(1,Math.ceil(Math.max(...waits)/1000));
    return json({error:'Aguarde antes de pedir outro código.',retryAfter},429,{'Retry-After':String(retryAfter)});
   }
   try{await sendLoginCode(email,code,challengeHash);}catch(error){await db.prepare("UPDATE email_login_codes SET status='failed' WHERE challenge_hash=?").bind(challengeHash).run();throw error;}
   await db.batch([
    db.prepare("UPDATE email_login_codes SET status='superseded' WHERE email=? AND guest_hash=? AND challenge_hash<>? AND status='sent' AND created<=?").bind(email,guestHash,challengeHash,now),
    db.prepare("UPDATE email_login_codes SET status='sent' WHERE challenge_hash=? AND status='sending'").bind(challengeHash)
   ]);
   return json({challenge,email,expires:now+CODE_TTL,resendAfter:RESEND_DELAY/1000},202);
  }
  if(!validToken(b.challenge)||typeof b.code!=='string'||!/^\d{6}$/.test(b.code))apiError('Digite o código de 6 dígitos recebido no e-mail.');
  const challengeHash=await hashToken(b.challenge);
  // Claim a correct code once; wrong attempts are counted in the same atomic update.
  const claimed=await db.prepare(`UPDATE email_login_codes SET attempts=attempts+1,
   status=CASE WHEN code_hash=? THEN 'consumed' WHEN attempts+1>=5 THEN 'locked' ELSE status END
   WHERE challenge_hash=? AND guest_hash=? AND status='sent' AND attempts<5 AND expires>?
   RETURNING email,status`).bind(await hashToken(b.challenge+'.'+b.code),challengeHash,guestHash,now).first<{email:string;status:string}>();
  if(!claimed)apiError('Código expirado ou indisponível. Peça um novo código.',410);
  if(claimed.status!=='consumed')return json({error:claimed.status==='locked'?'Limite de tentativas atingido. Peça um novo código.':'Código incorreto. Confira o e-mail e tente novamente.',locked:claimed.status==='locked'},401);
  const account=await linkEmail(db,claimed.email,guestHash),session=newToken();
  await db.prepare('INSERT INTO account_sessions (token_hash,account_id,expires) VALUES (?,?,?)').bind(await hashToken(session),account.id,now+30*24*hour).run();
  return json({ok:true,account:{id:account.id,name:account.name,email:account.email}},200,{'Set-Cookie':sessionCookie(session)});
 }catch(error){const e=error as Error&{status?:number};return json({error:e.status?e.message:'Não foi possível acessar sua conta. Tente novamente.'},e.status||503);}
}
