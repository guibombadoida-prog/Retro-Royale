'use strict';
const ACCOUNT={
 ready:false,user:null,pending:null,busy:'',timer:0,cooldownUntil:0,restored:false,
 paint(){
  const el=id=>document.getElementById(id),name=el('accountName');if(!name)return;
  const wait=Math.max(0,Math.ceil((this.cooldownUntil-Date.now())/1000)),expired=this.pending&&this.pending.expires<=Date.now();
  name.textContent=this.user?this.user.name:'Salve seu progresso';
  el('accountStatus').textContent=this.user?this.user.email:this.ready?'Entre com um código recebido no seu e-mail.':'O envio de códigos será liberado em breve. Você pode continuar como visitante.';
  el('emailLoginForm').hidden=!!this.user||!!this.pending;el('codeLoginForm').hidden=!!this.user||!this.pending;el('logoutBtn').hidden=!this.user;
  el('loginEmail').disabled=!!this.busy;el('loginCode').disabled=!!this.busy;
  el('sendCodeBtn').disabled=!this.ready||!!this.busy||wait>0;
  el('sendCodeBtn').textContent=this.busy==='send'?'Enviando…':wait?'Enviar em '+wait+'s':'Enviar código';
  el('verifyCodeBtn').disabled=!this.ready||!!this.busy||!this.pending||expired;
  el('verifyCodeBtn').textContent=this.busy==='verify'?'Entrando…':'Confirmar e entrar';
  el('resendCodeBtn').disabled=!this.ready||!!this.busy||wait>0;
  el('resendCodeBtn').textContent=wait?'Reenviar em '+wait+'s':'Reenviar código';el('changeEmailBtn').disabled=!!this.busy;el('logoutBtn').disabled=!!this.busy;
  if(this.pending){el('codeDestination').textContent='Código enviado para '+this.pending.email;el('codeExpiry').textContent=expired?'Código expirado. Peça outro para continuar.':'Válido por mais '+Math.max(1,Math.ceil((this.pending.expires-Date.now())/60000))+' min · confira também o spam';}
  clearTimeout(this.timer);if(!this.user&&(wait>0||this.pending&&!expired))this.timer=setTimeout(()=>this.paint(),1000);
 },
 message(text){document.getElementById('cloudStatus').textContent=text;},
 persist(){try{if(this.pending)sessionStorage.setItem('retro-email-login',JSON.stringify(this.pending));else sessionStorage.removeItem('retro-email-login');}catch(e){}},
 clearPending(){this.pending=null;this.persist();document.getElementById('loginCode').value='';this.paint();},
 setUser(user){this.user=user||null;if(this.user)this.clearPending();this.paint();},
 async init(){
  if(!this.restored){this.restored=true;try{const p=JSON.parse(sessionStorage.getItem('retro-email-login'));if(!this.user&&p&&/^[a-f0-9-]{72}$/.test(p.challenge)&&/^[a-f0-9-]{72}$/.test(p.profileToken)&&p.expires>Date.now()&&typeof p.email==='string'){this.pending=p;this.cooldownUntil=Number(p.resendAt)||0;}else sessionStorage.removeItem('retro-email-login');}catch(e){}}
  try{const r=await fetch('/api/account/config',{cache:'no-store',signal:AbortSignal.timeout(5000)}),d=await r.json();if(r.ok)this.ready=d.emailReady===true;}catch(e){}
  this.paint();
 },
 canEnter(){if(NET.room){this.message('Saia da sala antes de entrar na conta.');return false;}if(typeof CONNECTION!=='undefined'&&!CONNECTION.available()){this.message('Conecte à internet para receber e confirmar o código.');return false;}return !this.user;},
 async requestCode(resend=false){
  if(this.busy||!this.ready||this.cooldownUntil>Date.now()||!this.canEnter())return;
  const input=document.getElementById('loginEmail'),email=resend&&this.pending?this.pending.email:input.value.trim();
  if(!email||!resend&&!input.checkValidity()){this.message('Digite um Gmail ou e-mail válido.');input.focus();return;}
  this.busy='send';this.paint();this.message('Enviando seu código…');
  try{
   if(!PROGRESS.loaded)await PROGRESS.init();
   if(!await PROGRESS.saveNow(true))throw new Error('Não foi possível salvar antes de entrar. Verifique sua conexão e tente novamente.');
   const r=await fetch('/api/account/request-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,profileToken:PROGRESS.token}),signal:AbortSignal.timeout(12000)}),d=await r.json();
   if(!r.ok){if(d.retryAfter){this.cooldownUntil=Date.now()+d.retryAfter*1000;if(this.pending){this.pending.resendAt=this.cooldownUntil;this.persist();}}if(d.configured===false)this.ready=false;throw new Error(d.error||'Não foi possível enviar o código.');}
   this.cooldownUntil=Date.now()+d.resendAfter*1000;this.pending={challenge:d.challenge,email:d.email,expires:d.expires,profileToken:PROGRESS.token,resendAt:this.cooldownUntil};this.persist();input.value=d.email;document.getElementById('loginCode').value='';this.message('Código enviado. Abra seu e-mail e digite os 6 números aqui.');
  }catch(e){this.message(e.name==='TimeoutError'||e.name==='TypeError'?'Não conseguimos confirmar o envio. Verifique sua conexão antes de tentar novamente.':e.message||'Não foi possível enviar o código.');}
  finally{this.busy='';this.paint();if(this.pending)document.getElementById('loginCode').focus();}
 },
 changeEmail(){if(this.busy)return;if(this.pending)document.getElementById('loginEmail').value=this.pending.email;this.clearPending();this.message('Digite o e-mail que receberá seu código.');document.getElementById('loginEmail').focus();},
 async verifyCode(){
  if(this.busy||!this.pending||!this.canEnter())return;
  const code=document.getElementById('loginCode').value.trim();if(!/^\d{6}$/.test(code)){this.message('Digite os 6 números recebidos no e-mail.');return;}
  if(this.pending.profileToken!==PROGRESS.token){this.clearPending();this.message('O perfil mudou. Peça um novo código para continuar.');return;}
  this.busy='verify';this.paint();this.message('Confirmando seu código…');
  try{
   if(!PROGRESS.loaded)await PROGRESS.init();if(this.user){this.message('Conta conectada · progresso sincronizado ✓');return;}
   if(!await PROGRESS.saveNow(true))throw new Error('Não foi possível salvar antes de entrar. Verifique sua conexão e tente novamente.');
   const r=await fetch('/api/account/verify-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge:this.pending.challenge,code,profileToken:PROGRESS.token}),signal:AbortSignal.timeout(10000)}),d=await r.json();
   if(!r.ok){if(r.status===410||d.locked){this.pending.expires=0;this.persist();}throw new Error(d.error||'Não foi possível confirmar o código.');}
   this.setUser(d.account);PROGRESS.dirty=false;PROGRESS.loaded=false;PROGRESS.cloud=null;try{localStorage.removeItem('retro-cloud-pending');}catch(e){}
   await PROGRESS.init();PROGRESS.applyCloud();this.message(PROGRESS.loaded?'Conta conectada · progresso sincronizado ✓':'Conta conectada. Seu progresso será carregado quando a conexão voltar.');toast('Conta conectada',T.gold);
  }catch(e){if(e.name==='TimeoutError'||e.name==='TypeError')PROGRESS.loaded=false;this.message(e.name==='TimeoutError'||e.name==='TypeError'?'Conexão interrompida. Tente confirmar novamente.':e.message||'Não foi possível confirmar o código.');}
  finally{this.busy='';this.paint();}
 },
 async copyRecovery(){
  if(this.user){document.getElementById('recoveryStatus').textContent='Entre com o código enviado ao seu e-mail para recuperar o progresso da conta.';return;}
  if(!PROGRESS.token){document.getElementById('recoveryStatus').textContent='Aguarde seu perfil carregar.';return;}
  try{await navigator.clipboard.writeText(PROGRESS.token);document.getElementById('recoveryStatus').textContent='Código copiado. Guarde-o para restaurar seu perfil.';}catch(e){document.getElementById('recoveryCode').value=PROGRESS.token;document.getElementById('recoveryStatus').textContent='Seu código está no campo acima. Copie e guarde.';}
 },
 async restoreRecovery(){
  if(NET.room||this.user||this.busy){document.getElementById('recoveryStatus').textContent='Saia da sala e da conta antes de restaurar um visitante.';return;}
  const token=document.getElementById('recoveryCode').value.trim();if(!/^[a-f0-9-]{72}$/.test(token)){document.getElementById('recoveryStatus').textContent='Código inválido. Cole os 72 caracteres completos.';return;}
  try{const r=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(6000)}),data=await r.json();if(!r.ok||data.token!==token)throw new Error(data.error||'Código inválido.');this.clearPending();PROGRESS.dirty=false;localStorage.removeItem('retro-cloud-pending');localStorage.setItem('retro-profile-token',token);await PROGRESS.init();PROGRESS.applyCloud();document.getElementById('recoveryCode').value='';document.getElementById('recoveryStatus').textContent='Perfil restaurado. Progresso e baralho recuperados.';}catch(e){document.getElementById('recoveryStatus').textContent=e.message||'Não foi possível restaurar. Verifique sua conexão.';}
 },
 async logout(){
  if(this.busy)return;if(NET.room){toast('Saia da sala antes de desconectar a conta',T.gold);return;}this.busy='logout';this.paint();
  try{
   if(PROGRESS.dirty&&!await PROGRESS.saveNow(true))throw new Error('Aguarde a sincronização antes de sair da conta.');
   const r=await fetch('/api/account/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(6000)});if(!r.ok)throw new Error('Conecte à internet para sair da conta.');
   this.clearPending();this.setUser(null);PROGRESS.dirty=false;PROGRESS.loaded=false;PROGRESS.token=null;PROGRESS.unlocked=[];try{localStorage.removeItem('retro-profile-token');localStorage.removeItem('retro-cloud-pending');}catch(e){}
   deckSel=PROGRESS.sanitize([]);await PROGRESS.init();buildPool();syncDeck();this.message('Conta desconectada. Progresso guardado na nuvem.');toast('Conta desconectada',T.gold);
  }catch(e){this.message(e.message||'Conecte à internet para sair da conta.');}finally{this.busy='';this.paint();}
 }
};
window.ACCOUNT=ACCOUNT;
