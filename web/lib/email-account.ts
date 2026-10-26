import { env } from 'cloudflare:workers';
import { apiError,hashToken,newToken,type Account } from './player-profile';
import { sendMail,SmtpError } from './smtp';

export const CODE_TTL=600000,RESEND_DELAY=60000;
// Quem envia o código: a conta Gmail do jogo (GMAIL_USER + GMAIL_APP_PASSWORD, senha de app do Google)
// ou, para quem tiver domínio próprio, o Resend (RESEND_API_KEY + LOGIN_EMAIL_FROM). O Gmail tem prioridade.
export function emailConfig(){
 const e=env as unknown as Record<string,unknown>,text=(key:string)=>typeof e[key]==='string'?(e[key] as string).trim():'';
 const user=text('GMAIL_USER').toLowerCase(),password=text('GMAIL_APP_PASSWORD').replace(/\s+/g,'');
 if(user&&password&&/^[^\s@<>]+@[^\s@<>]+$/.test(user))return {provider:'gmail' as const,user,password,apiKey:'',from:'Retro Royale <'+user+'>',ready:true};
 const apiKey=text('RESEND_API_KEY'),from=text('LOGIN_EMAIL_FROM');
 return {provider:'resend' as const,user:'',password:'',apiKey,from,ready:!!apiKey&&!!from};
}
export function normalizeEmail(value:unknown){
 if(typeof value!=='string')apiError('Digite um Gmail ou e-mail válido.');
 const email=value.trim().toLowerCase();
 if(email.length>254||!email.match(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/))apiError('Digite um Gmail ou e-mail válido.');
 let [local,domain]=email.split('@');
 if(local.length>64||local.startsWith('.')||local.endsWith('.')||local.includes('..'))apiError('Digite um Gmail ou e-mail válido.');
 // Gmail aliases identify the same mailbox and share account and sending limits.
 if(domain==='gmail.com'||domain==='googlemail.com'){
  local=local.split('+')[0].replace(/\./g,'');domain='gmail.com';
  if(!/^[a-z0-9]+$/.test(local))apiError('Digite um Gmail válido.');
 }
 return local+'@'+domain;
}
export function newCode(){
 const value=new Uint32Array(1);
 do{crypto.getRandomValues(value);}while(value[0]>=4294000000);
 return String(value[0]%1000000).padStart(6,'0');
}
export async function sendLoginCode(email:string,code:string,requestId:string){
 const config=emailConfig();if(!config.ready)apiError('O envio de códigos ainda não foi ativado no jogo.',503);
 const message={subject:'Seu código de acesso — Retro Royale',text:`Seu código de acesso ao Retro Royale é: ${code}\n\nEle vale por 10 minutos e pode ser usado uma única vez. Digite o código no jogo para salvar e recuperar seu progresso.\n\nSe você não pediu este código, ignore este e-mail.`,html:`<div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;padding:24px;color:#16385c"><h1 style="font-size:24px">Retro Royale</h1><p>Use este código para entrar no jogo:</p><p style="font-size:36px;font-weight:bold;letter-spacing:8px">${code}</p><p>Válido por 10 minutos e para um único uso.</p><p>Se você não pediu este código, ignore este e-mail.</p></div>`};
 try{
  if(config.provider==='gmail'){await sendMail({from:config.from,user:config.user,password:config.password,to:email,...message});return;}
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json','Idempotency-Key':'retro-login/'+requestId},
   body:JSON.stringify({from:config.from,to:[email],...message}),
   signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)throw new Error('Email transport failed');
 }catch(error){
  // Para o dono descobrir o motivo nos registros do Worker (535 = senha de app recusada pelo Google);
  // só o código SMTP ou o tipo do erro, nunca a senha.
  console.error('login_email_failed',config.provider,error instanceof SmtpError?error.code:String((error as Error)?.message||error).slice(0,120));
  apiError('Não foi possível enviar o código. Aguarde um minuto e tente novamente.',503);
 }
}
export async function linkEmail(db:D1Database,email:string,guestHash:string){
 const guest=await db.prepare('SELECT settings FROM player_profiles WHERE token_hash=?').bind(guestHash).first<{settings:string|null}>();
 let name='Jogador';try{const nickname=JSON.parse(guest?.settings||'{}').nickname;if(typeof nickname==='string'&&nickname.trim())name=nickname.slice(0,18);}catch{}
 const id=crypto.randomUUID(),profileHash=await hashToken(newToken()),now=Date.now();
 await db.batch([
  db.prepare("INSERT INTO player_profiles (token_hash,battles,unlocked,created) VALUES (?,0,'[]',?)").bind(profileHash,now),
  db.prepare('INSERT OR IGNORE INTO email_accounts (id,email,name,profile_hash,created) VALUES (?,?,?,?,?)').bind(id,email,name,profileHash,now)
 ]);
 const account=(await db.prepare('SELECT id,email,name,profile_hash FROM email_accounts WHERE email=?').bind(email).first<Account>())!;
 await db.batch([
  db.prepare('DELETE FROM player_profiles WHERE token_hash=? AND NOT EXISTS (SELECT 1 FROM email_accounts WHERE profile_hash=?)').bind(profileHash,profileHash),
  db.prepare('INSERT OR IGNORE INTO profile_battles (profile_hash,code) SELECT ?,code FROM profile_battles WHERE profile_hash=?').bind(account.profile_hash,guestHash),
  db.prepare(`UPDATE player_profiles SET battles=MAX(battles,COALESCE((SELECT battles FROM player_profiles WHERE token_hash=?),0),(SELECT COUNT(*) FROM profile_battles WHERE profile_hash=?)),unlocked=(SELECT json_group_array(value) FROM (SELECT DISTINCT value FROM json_each(player_profiles.unlocked) UNION SELECT value FROM json_each(COALESCE((SELECT unlocked FROM player_profiles WHERE token_hash=?),'[]')))),deck=COALESCE(deck,(SELECT deck FROM player_profiles WHERE token_hash=?)),settings=COALESCE(settings,(SELECT settings FROM player_profiles WHERE token_hash=?)),revision=revision+1 WHERE token_hash=?`).bind(guestHash,account.profile_hash,guestHash,guestHash,guestHash,account.profile_hash)
 ]);
 return account;
}
