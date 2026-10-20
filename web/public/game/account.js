'use strict';
const ACCOUNT={
 ready:false,user:null,flow:null,timer:0,busy:false,
 paint(){const name=document.getElementById('accountName'),status=document.getElementById('accountStatus'),button=document.getElementById('googleLoginBtn'),logout=document.getElementById('logoutBtn');if(!name)return;name.textContent=this.user?this.user.name:'Seu progresso, com você';status.textContent=this.user?this.user.email:this.ready?'Entre para recuperar seu baralho e progresso em outro dispositivo.':'Login Google em configuração. Seu perfil de visitante continua disponível.';button.hidden=!!this.user;button.disabled=!this.ready||this.busy||!!this.flow;logout.hidden=!this.user;const message=document.getElementById('cloudStatus');if(message&&!this.user&&!this.flow&&!message.textContent)message.textContent='Jogando como visitante';},
 setUser(user){this.user=user||null;this.paint();},
 async init(){try{const r=await fetch('/api/account/config',{cache:'no-store',signal:AbortSignal.timeout(5000)}),d=await r.json();this.ready=r.ok&&d.googleReady===true;}catch(e){}this.paint();try{const f=JSON.parse(sessionStorage.getItem('retro-google-flow'));if(f&&f.expires>Date.now()&&!this.flow){this.flow=f;this.poll();}}catch(e){}},
 async login(){
  if(this.busy||this.flow||!this.ready)return;if(NET.room){toast('Saia da sala antes de trocar de conta',T.gold);return;}if(typeof CONNECTION!=='undefined'&&!CONNECTION.available()){toast('Conecte à internet para entrar com Google',T.gold);return;}
  const version=navigator.userAgent.match(/RetroRoyaleAndroid\/(\d+)\.(\d+)/),android=!!version;if(android&&Number(version[1])+Number(version[2])/10<1.5){document.getElementById('cloudStatus').textContent='Atualize o APK para usar o login Google.';document.getElementById('androidUpdate').hidden=false;return;}
  const popup=android?null:window.open('about:blank','retro-google-login','popup,width=500,height=720');if(popup)popup.opener=null;this.busy=true;this.paint();
  try{
   await PROGRESS.init();if(!await PROGRESS.saveNow(true))throw new Error('Não foi possível salvar antes de entrar. Verifique sua conexão.');
   const r=await fetch('/api/account/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileToken:PROGRESS.token}),signal:AbortSignal.timeout(7000)}),d=await r.json();if(!r.ok)throw new Error(d.error);
   this.flow={flow:d.flow,pollToken:d.pollToken,expires:d.expires};try{sessionStorage.setItem('retro-google-flow',JSON.stringify(this.flow));}catch(e){}
   const url=new URL(d.authorizeUrl,location.origin).href;if(android)location.assign(url);else if(popup)popup.location.href=url;else{this.clearFlow();throw new Error('Permita abrir a janela de login e tente novamente.');}
   document.getElementById('cloudStatus').textContent='Aguardando você entrar no Google…';this.poll();
  }catch(e){popup?.close();document.getElementById('cloudStatus').textContent=e.message||'Não foi possível abrir o login.';}finally{this.busy=false;this.paint();}
 },
 clearFlow(){clearTimeout(this.timer);this.flow=null;this.paint();try{sessionStorage.removeItem('retro-google-flow');}catch(e){}},
 async poll(){
  if(!this.flow||this.polling)return;clearTimeout(this.timer);if(this.flow.expires<Date.now()){this.clearFlow();document.getElementById('cloudStatus').textContent='O login expirou. Tente novamente.';return;}this.polling=true;
  try{
   const r=await fetch('/api/account/poll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(this.flow),signal:AbortSignal.timeout(6000)}),d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});
   if(d.status==='complete'){this.clearFlow();PROGRESS.dirty=false;try{localStorage.removeItem('retro-cloud-pending');}catch(e){}await PROGRESS.init();PROGRESS.applyCloud();document.getElementById('cloudStatus').textContent='Progresso sincronizado com sua conta Google';toast('Conta conectada e progresso salvo',T.gold);return;}
   if(['cancelled','consumed'].includes(d.status)){this.clearFlow();document.getElementById('cloudStatus').textContent='Login não concluído. Seu progresso foi mantido.';return;}
  }catch(e){if([403,410].includes(e.status)){this.clearFlow();document.getElementById('cloudStatus').textContent=e.message;return;}}
  finally{this.polling=false;}
  if(this.flow)this.timer=setTimeout(()=>this.poll(),2000);
 },
 async copyRecovery(){
  if(this.user){document.getElementById('recoveryStatus').textContent='Sua conta usa o login Google para recuperar o progresso.';return;}
  if(!PROGRESS.token){document.getElementById('recoveryStatus').textContent='Aguarde seu perfil carregar.';return;}
  try{await navigator.clipboard.writeText(PROGRESS.token);document.getElementById('recoveryStatus').textContent='Código copiado. Guarde-o para restaurar seu perfil.';}catch(e){document.getElementById('recoveryCode').value=PROGRESS.token;document.getElementById('recoveryStatus').textContent='Seu código está no campo acima. Copie e guarde.';}
 },
 async restoreRecovery(){
  if(NET.room||this.user){document.getElementById('recoveryStatus').textContent='Saia da sala e da conta antes de restaurar um visitante.';return;}
  const token=document.getElementById('recoveryCode').value.trim();if(!/^[a-f0-9-]{72}$/.test(token)){document.getElementById('recoveryStatus').textContent='Código inválido. Cole os 72 caracteres completos.';return;}
  try{const r=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(6000)}),data=await r.json();if(!r.ok||data.token!==token)throw new Error(data.error||'Código inválido.');PROGRESS.dirty=false;localStorage.removeItem('retro-cloud-pending');localStorage.setItem('retro-profile-token',token);await PROGRESS.init();PROGRESS.applyCloud();document.getElementById('recoveryCode').value='';document.getElementById('recoveryStatus').textContent='Perfil restaurado. Progresso e baralho recuperados.';}catch(e){document.getElementById('recoveryStatus').textContent=e.message||'Não foi possível restaurar. Verifique sua conexão.';}
 },
 async logout(){
  if(NET.room){toast('Saia da sala antes de desconectar a conta',T.gold);return;}
  try{const r=await fetch('/api/account/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(6000)});if(!r.ok)throw new Error();this.clearFlow();this.setUser(null);PROGRESS.dirty=false;PROGRESS.loaded=false;PROGRESS.token=null;PROGRESS.unlocked=[];try{localStorage.removeItem('retro-profile-token');localStorage.removeItem('retro-cloud-pending');}catch(e){}deckSel=PROGRESS.sanitize([]);await PROGRESS.init();buildPool();syncDeck();toast('Conta desconectada. Progresso guardado na nuvem.',T.gold);}catch(e){document.getElementById('cloudStatus').textContent='Conecte à internet para sair da conta.';}
 }
};
window.ACCOUNT=ACCOUNT;
