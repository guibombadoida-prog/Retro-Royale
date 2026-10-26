import assert from 'node:assert/strict';
import {harness} from './api-harness.mjs';

// Login com código enviado pela conta Gmail do jogo (SMTP com senha de app), com um servidor SMTP falso.
let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;},ok=(v,m)=>{assert.ok(v,m);count++;};
function fakeSmtp({authReply='235 2.7.0 Accepted',greeting='220 smtp.test ESMTP ready'}={}){
 const log={connections:[],commands:[],data:'',closed:0};
 const connect=(address,options)=>{
  log.connections.push(JSON.parse(JSON.stringify({address,options})));
  const encoder=new TextEncoder(),decoder=new TextDecoder();let controller,inData=false,pending='';
  const readable=new ReadableStream({start(c){controller=c;}});
  const send=text=>{try{controller.enqueue(encoder.encode(text));}catch{}};
  send(greeting+'\r\n');
  const writable=new WritableStream({write(chunk){
   pending+=decoder.decode(chunk);let at;
   while((at=pending.indexOf('\r\n'))>=0){
    const line=pending.slice(0,at);pending=pending.slice(at+2);
    if(inData){if(line==='.'){inData=false;send('250 2.0.0 OK queued\r\n');}else log.data+=line+'\r\n';continue;}
    log.commands.push(line);
    if(line.startsWith('EHLO'))send('250-smtp.test at your service\r\n250-AUTH LOGIN PLAIN\r\n250 SMTPUTF8\r\n');
    else if(line.startsWith('AUTH '))send(authReply+'\r\n');
    else if(line.startsWith('MAIL FROM')||line.startsWith('RCPT TO'))send('250 2.1.0 OK\r\n');
    else if(line==='DATA'){inData=true;send('354 Go ahead\r\n');}
    else if(line==='QUIT'){send('221 2.0.0 closing\r\n');}
   }
  }});
  return {readable,writable,close:async()=>{log.closed++;try{controller.close();}catch{}}};
 };
 return {connect,log};
}
// Lê a parte text/plain (base64) da mensagem enviada.
const plainText=data=>Buffer.from(data.split('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('--rr-')[0].replace(/\s+/g,''),'base64').toString('utf8');

const env={GMAIL_USER:' Jogo.Retro@Gmail.com ',GMAIL_APP_PASSWORD:'abcd efgh ijkl mnop',RESEND_API_KEY:'nao-deve-ser-usada',LOGIN_EMAIL_FROM:'x <y@z.test>'};
const smtp=fakeSmtp();let fetched=0;
const h=harness({env,sockets:{connect:smtp.connect},fetch:async()=>{fetched++;return Response.json({});}});
eq((await h.call('/api/account/config')).data,{emailReady:true,provider:'email-code',digits:6},'com a senha de app o login fica ativo');
const profile=(await h.call('/api/profile',{})).data;
const start=await h.call('/api/account/request-code',{profileToken:profile.token,email:'Player@GMail.com'});eq(start.status,202);
eq(fetched,0,'com Gmail configurado o Resend não é chamado');
eq(smtp.log.connections[0],{address:{hostname:'smtp.gmail.com',port:465},options:{secureTransport:'on',allowHalfOpen:false}},'TLS direto na porta 465 do Gmail');
const auth=Buffer.from(smtp.log.commands[1].slice('AUTH PLAIN '.length),'base64').toString();
eq(smtp.log.commands,['EHLO retro-royale',smtp.log.commands[1],'MAIL FROM:<jogo.retro@gmail.com>','RCPT TO:<player@gmail.com>','DATA','QUIT']);
eq(auth,'\0jogo.retro@gmail.com\0abcdefghijklmnop','usuário em minúsculas e senha de app sem os espaços');
ok(smtp.log.data.includes('From: Retro Royale <jogo.retro@gmail.com>\r\n'));ok(smtp.log.data.includes('To: <player@gmail.com>\r\n'));
ok(smtp.log.data.includes('Subject: =?UTF-8?B?'+Buffer.from('Seu código de acesso — Retro Royale').toString('base64')+'?='),'assunto com acento codificado');
ok(!smtp.log.data.split('\r\n').some(line=>line.startsWith('.')),'nenhuma linha começa com ponto');
const code=plainText(smtp.log.data).match(/é: (\d{6})/)[1];eq(smtp.log.closed,1,'a conexão é fechada');
const verified=await h.call('/api/account/verify-code',{profileToken:profile.token,challenge:start.data.challenge,code});
eq(verified.status,200,'o código que chegou pelo Gmail entra na conta');ok(verified.headers.get('set-cookie')?.startsWith('rr_session='));

// Senha de app recusada (535): o jogador vê o erro de envio e nada de senha vai para o registro.
const logs=[],original=console.error;console.error=(...a)=>logs.push(a.join(' '));
const refused=fakeSmtp({authReply:'535 5.7.8 Username and Password not accepted'});
const h2=harness({env,sockets:{connect:refused.connect}});const p2=(await h2.call('/api/profile',{})).data;
const failed=await h2.call('/api/account/request-code',{profileToken:p2.token,email:'outro@gmail.com'});
console.error=original;
eq(failed.status,503);ok(/Não foi possível enviar o código/.test(failed.data.error));
eq(refused.log.commands.includes('DATA'),false,'nada é enviado sem login aceito');
ok(logs.some(l=>l.includes('login_email_failed gmail 535'))&&!logs.some(l=>l.includes('abcdefghijklmnop')),'registro só com o código SMTP');
// Servidor mudo: desiste no tempo limite em vez de travar a rota.
const {sendMail}=h.load('lib/smtp.ts');
await assert.rejects(sendMail({from:'a <a@b.c>',user:'a@b.c',password:'x',to:'d@e.f',subject:'s',text:'t',html:'h'},{timeout:50,open:()=>({readable:new ReadableStream(),writable:new WritableStream(),close:async()=>{}})}),/sem resposta/);count++;
// Quebra de linha no destinatário é recusada (não deixa injetar cabeçalho).
await assert.rejects(sendMail({from:'a <a@b.c>',user:'a@b.c',password:'x',to:'d@e.f\r\nBcc: x@y.z',subject:'s',text:'t',html:'h'},{open:fakeSmtp().connect}),/inválido/);count++;
// Sem a senha de app, volta para o Resend (ou "em breve" se nada estiver configurado).
eq((await harness({env:{GMAIL_USER:'jogo@gmail.com'}}).call('/api/account/config')).data.emailReady,false);
console.log(`Gmail login: ${count} assertions passed (TLS 465, AUTH PLAIN with the app password, message headers and base64 body, code verified, refused password, timeout, header injection).`);
