import { getRoomDb } from '@/db';
import { googleConfig,challenge,googleIdentity,linkGoogle } from '@/lib/google-account';
import { apiError,assertOrigin,accountFor,hashToken,newToken,validToken,cookie,sessionCookie,stateCookie } from '@/lib/player-profile';
type Flow={flow_hash:string;poll_hash:string;guest_hash:string;state_hash:string;nonce:string;verifier:string;status:string;account_id:string;expires:number};
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200,extra:Record<string,string>={})=>Response.json(data,{status,headers:{...headers,...extra}});
function page(success:boolean,message:string,status=200){return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Retro Royale — Conta Google</title><link rel="icon" href="/favicon.svg"><style>body{background:#103d72;color:#fff;font:18px system-ui;text-align:center;margin:12vh 24px}img{width:96px;height:96px;object-fit:contain}main{max-width:420px;margin:auto}h1{font-size:26px}p{line-height:1.5;color:#dae9ff}a{color:#ffe177}</style><main><img src="/favicon.svg" alt="Retro Royale"><h1>${success?'Conta conectada!':'Login não concluído'}</h1><p>${message}</p><p>Volte à aba ou ao aplicativo em que você iniciou o login.</p><a href="/">Abrir Retro Royale</a></main></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'Set-Cookie':stateCookie('',0)}});}
export async function GET(request:Request){
 const url=new URL(request.url),action=url.pathname.split('/').pop(),config=googleConfig();
 try{
  if(action==='config')return json({googleReady:config.ready,provider:'google'});
  if(!config.ready)return page(false,'O login Google ainda não foi ativado pelo responsável pelo jogo.',503);
  const db=getRoomDb(),redirectUri=url.origin+'/api/account/callback',now=Date.now();
  if(action==='authorize'){
   const raw=url.searchParams.get('flow');if(!validToken(raw))apiError('Link de login inválido.');
   const flowHash=await hashToken(raw),state=newToken(),nonce=newToken(),verifier=newToken().replace(/-/g,'');
   const update=await db.prepare("UPDATE google_login_flows SET state_hash=?,nonce=?,verifier=?,status='authorizing' WHERE flow_hash=? AND status='pending' AND expires>?").bind(await hashToken(state),nonce,verifier,flowHash,now).run();
   if(!update.meta.changes)apiError('Este link expirou ou já foi utilizado. Inicie o login novamente.',410);
   const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');for(const [key,value] of Object.entries({client_id:config.clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid email profile',state,nonce,prompt:'select_account',code_challenge:await challenge(verifier),code_challenge_method:'S256'}))target.searchParams.set(key,value);
   return new Response(null,{status:302,headers:{...headers,Location:target.href,'Set-Cookie':stateCookie(state)}});
  }
  if(action==='callback'){
   const state=url.searchParams.get('state');if(!validToken(state)||cookie(request,'rr_oauth_state')!==state)apiError('O login não corresponde a este navegador. Inicie novamente.',403);
   const flow=await db.prepare("SELECT * FROM google_login_flows WHERE state_hash=? AND status='authorizing' AND expires>?").bind(await hashToken(state),now).first<Flow>();if(!flow)apiError('O login expirou ou já foi utilizado.',410);
   if(url.searchParams.has('error')){await db.prepare("UPDATE google_login_flows SET status='cancelled',verifier=NULL WHERE flow_hash=? AND status='authorizing'").bind(flow.flow_hash).run();return page(false,'Você cancelou a conexão com o Google. Seu progresso anterior foi mantido.');}
   const code=url.searchParams.get('code');if(!code||code.length>4096)apiError('Resposta de login inválida.');
   const claimed=await db.prepare("UPDATE google_login_flows SET status='processing' WHERE flow_hash=? AND status='authorizing'").bind(flow.flow_hash).run();if(!claimed.meta.changes)apiError('Login já utilizado.',410);
   try{
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,code,redirect_uri:redirectUri,grant_type:'authorization_code',code_verifier:flow.verifier}),signal:AbortSignal.timeout(7000)});
    const tokens=await response.json() as {id_token?:string};if(!response.ok||typeof tokens.id_token!=='string')apiError('O Google não concluiu o login.',401);
    const identity=await googleIdentity(tokens.id_token,config.clientId,flow.nonce),account=await linkGoogle(db,identity,flow.guest_hash);
    await db.prepare("UPDATE google_login_flows SET status='complete',account_id=?,verifier=NULL,nonce=NULL WHERE flow_hash=? AND status='processing'").bind(account.id,flow.flow_hash).run();return page(true,'Seu progresso está vinculado à sua conta Google.');
   }catch(error){await db.prepare("UPDATE google_login_flows SET status='cancelled',verifier=NULL,nonce=NULL WHERE flow_hash=?").bind(flow.flow_hash).run();throw error;}
  }
  return json({error:'Rota não encontrada.'},404);
 }catch(error){const e=error as Error&{status?:number};return page(false,e.status?e.message:'Não foi possível concluir o login. Tente novamente.',e.status||503);}
}
export async function POST(request:Request){
 try{
  assertOrigin(request);const text=await request.text();if(text.length>1024)apiError('Mensagem inválida.',413);const b=JSON.parse(text);if(!b||typeof b!=='object'||Array.isArray(b))apiError('Mensagem inválida.');const action=new URL(request.url).pathname.split('/').pop(),db=getRoomDb(),now=Date.now();
  if(action==='logout'){const raw=cookie(request,'rr_session');if(validToken(raw))await db.prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(await hashToken(raw)).run();return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});}
  if(action==='login'){
   if(!googleConfig().ready)return json({error:'O login Google ainda não foi ativado pelo responsável pelo jogo.',configured:false},503);if(!validToken(b.profileToken))apiError('Seu perfil ainda está carregando.');
   const guestHash=await hashToken(b.profileToken);if(!await db.prepare('SELECT token_hash FROM player_profiles WHERE token_hash=?').bind(guestHash).first())apiError('Perfil indisponível.',403);
   if(await db.prepare("SELECT 1 FROM room_players p JOIN team_rooms r ON r.code=p.code WHERE p.profile_hash=? AND r.status IN ('waiting','playing') AND r.expires>? AND p.seen>?").bind((await accountFor(request,db))?.profile_hash||guestHash,now,now-30000).first())apiError('Saia da sala antes de trocar de conta.',409);
   const flow=newToken(),pollToken=newToken();await db.batch([db.prepare('DELETE FROM google_login_flows WHERE expires<?').bind(now),db.prepare('DELETE FROM account_sessions WHERE expires<?').bind(now),db.prepare("INSERT INTO google_login_flows (flow_hash,poll_hash,guest_hash,status,created,expires) VALUES (?,?,?,'pending',?,?)").bind(await hashToken(flow),await hashToken(pollToken),guestHash,now,now+600000)]);
   return json({flow,pollToken,authorizeUrl:'/api/account/authorize?flow='+flow,expires:now+600000});
  }
  if(action==='poll'){
   if(!validToken(b.flow)||!validToken(b.pollToken))apiError('Login inválido.',403);const flow=await db.prepare('SELECT * FROM google_login_flows WHERE flow_hash=? AND poll_hash=? AND expires>?').bind(await hashToken(b.flow),await hashToken(b.pollToken),now).first<Flow>();if(!flow)apiError('O login expirou. Tente novamente.',410);if(flow.status!=='complete')return json({status:flow.status});
   const claimed=await db.prepare("UPDATE google_login_flows SET status='consumed' WHERE flow_hash=? AND poll_hash=? AND status='complete'").bind(flow.flow_hash,flow.poll_hash).run();if(!claimed.meta.changes)return json({status:'consumed'});
   const session=newToken();try{await db.prepare('INSERT INTO account_sessions (token_hash,account_id,expires) VALUES (?,?,?)').bind(await hashToken(session),flow.account_id,now+2592000000).run();}catch(e){await db.prepare("UPDATE google_login_flows SET status='complete' WHERE flow_hash=? AND status='consumed'").bind(flow.flow_hash).run();throw e;}
   return json({status:'complete'},200,{'Set-Cookie':sessionCookie(session)});
  }
  return json({error:'Rota não encontrada.'},404);
 }catch(error){const e=error as Error&{status?:number};if(e.status)return json({error:e.message},e.status);return json({error:'Não foi possível acessar sua conta. Tente novamente.'},503);}
}
