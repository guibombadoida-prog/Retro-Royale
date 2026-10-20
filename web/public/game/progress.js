'use strict';
const CHAMPION_IDS=['reibombado','pretobranco','boneca'];
const PROGRESS={
 token:null,battles:0,unlocked:[],loaded:false,revision:0,cloud:null,dirty:false,hydrating:false,saving:false,saveTimer:0,
 allowed(id){return !CHAMPION_IDS.includes(id)||this.unlocked.includes(id);},
 sanitize(deck){const normal=['cavaleiro','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos'],out=[];let champion=false;for(const id of deck){if(!this.allowed(id)||CHAMPION_IDS.includes(id)&&champion)continue;if(CHAMPION_IDS.includes(id))champion=true;if(!out.includes(id))out.push(id);}for(const id of normal)if(out.length<8&&!out.includes(id))out.push(id);return out.slice(0,8);},
 apply(data){const was=this.unlocked.includes('reibombado');this.battles=Math.max(0,Number(data.battles)||0);this.unlocked=(data.unlocked||[]).filter(id=>CHAMPION_IDS.includes(id));const label=document.getElementById('championProgress');if(label)label.textContent=this.unlocked.length?'Rei Bombado liberado · 1 campeão por baralho':'Campeões bloqueados · jogue 1 batalha online';if(!was&&this.unlocked.includes('reibombado')){if(typeof toast==='function')toast('Rei Bombado desbloqueado!','#FFD44E');if(typeof buildPool==='function')buildPool();}},
 init(){if(!this.loadingPromise)this.loadingPromise=this.load().finally(()=>{this.loadingPromise=null;});return this.loadingPromise;},
 async load(){
  try{this.token=localStorage.getItem('retro-profile-token');}catch(e){}
  try{
   let r=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:this.token}),signal:AbortSignal.timeout(6000)});
   if(r.status===404){this.token=null;r=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(6000)});}
   const d=await r.json();if(!r.ok)throw new Error(d.error);this.token=d.token;this.apply(d);this.loaded=true;this.revision=d.revision||0;this.cloud=d;if(!d.deck&&this.localDeck?.length===8)this.cloud.deck=this.sanitize(this.localDeck);
   try{localStorage.setItem('retro-profile-token',this.token);}catch(e){}
   if(typeof ACCOUNT!=='undefined')ACCOUNT.setUser(d.account);
   let pending;try{pending=JSON.parse(localStorage.getItem('retro-cloud-pending'));}catch(e){}
   if(pending?.owner===(d.account?.id||'guest:'+this.token)&&pending.revision===this.revision&&pending.state?.deck?.length===8){this.dirty=true;this.cloud={...d,...pending.state};this.applyCloud();this.saveTimer=setTimeout(()=>this.saveNow(),500);}
   else if(!this.dirty)this.applyCloud();
  }catch(e){const label=document.getElementById('championProgress');if(label)label.textContent='Sem conexão com o progresso · tentaremos novamente';}
 },
 snapshot(){return {deck:deckSel.slice(),settings:{abilityPosition:document.body.dataset.abilityPosition||'right',difficulty:diffSel,sound:AU.on,fx:PREF.fx,light:PREF.light,nickname:document.getElementById('playerName')?.value||''}};},
 remember(){try{localStorage.setItem('retro-cloud-pending',JSON.stringify({owner:typeof ACCOUNT!=='undefined'&&ACCOUNT.user?ACCOUNT.user.id:'guest:'+this.token,revision:this.revision,state:this.snapshot()}));}catch(e){}},
 applyCloud(){
  if(!this.cloud||typeof G==='undefined'||G.state!=='menu'||typeof NET!=='undefined'&&NET.room)return;this.hydrating=true;
  try{
   const d=this.cloud,s=d.settings||{};if(d.deck)deckSel=this.sanitize(d.deck);
   if(['left','right','both'].includes(s.abilityPosition)){document.body.dataset.abilityPosition=s.abilityPosition;try{localStorage.setItem('retro-ability-position',s.abilityPosition);}catch(e){}for(const b of document.querySelectorAll('button[data-ability-position]')){b.classList.toggle('gold',b.dataset.abilityPosition===s.abilityPosition);b.setAttribute('aria-pressed',b.dataset.abilityPosition===s.abilityPosition);}}
   if([0,1,2].includes(s.difficulty)){diffSel=s.difficulty;for(const b of document.querySelectorAll('[data-diff]'))b.classList.toggle('on',Number(b.dataset.diff)===diffSel);}
   if(typeof s.sound==='boolean'){AU.on=s.sound;const b=document.getElementById('soundBtn');b.setAttribute('aria-pressed',AU.on);b.textContent=AU.on?'♪ Som':'♪ Mudo';}
   for(const k of ['fx','light'])if(typeof s[k]==='boolean'){PREF[k]=s[k];document.getElementById(k==='fx'?'fxBtn':'lightBtn').setAttribute('aria-pressed',PREF[k]);}
   if(typeof s.nickname==='string')document.getElementById('playerName').value=s.nickname;FX.reduced=!PREF.fx;if(typeof CHAMP_UI!=='undefined')CHAMP_UI.key='';buildPool();syncDeck();
  }finally{this.hydrating=false;}
 },
 changed(){if(this.hydrating||typeof deckSel==='undefined'||deckSel.length!==8)return;this.dirty=true;this.remember();const label=document.getElementById('cloudStatus');if(label&&typeof ACCOUNT!=='undefined'&&ACCOUNT.user)label.textContent='Alterações aguardando sincronização…';clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.saveNow(),650);},
 saveNow(force=false){if(this.savePromise)return this.savePromise;this.savePromise=this.persistSave(force).finally(()=>{this.savePromise=null;});return this.savePromise;},
 async persistSave(force=false){
  clearTimeout(this.saveTimer);if(!force&&typeof ACCOUNT!=='undefined'&&ACCOUNT.busy==='verify')return false;if(this.saving||!this.loaded||!this.dirty&&!force||deckSel.length!==8||typeof CONNECTION!=='undefined'&&!CONNECTION.available())return false;
  const state=this.snapshot(),encoded=JSON.stringify(state);this.saving=true;
  try{
   const r=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:this.token,save:true,revision:this.revision,...state}),signal:AbortSignal.timeout(6000)}),d=await r.json();
   if(r.status===409){this.dirty=false;this.revision=d.revision;this.cloud=d;this.apply(d);this.applyCloud();try{localStorage.removeItem('retro-cloud-pending');}catch(e){}document.getElementById('cloudStatus').textContent='Carregamos a versão mais recente de outro dispositivo.';return false;}
   if(!r.ok)throw new Error(d.error);this.revision=d.revision;this.cloud=d;if(JSON.stringify(this.snapshot())===encoded){this.dirty=false;try{localStorage.removeItem('retro-cloud-pending');}catch(e){}}
   const label=document.getElementById('cloudStatus');if(label)label.textContent=d.account?'Salvo na sua conta ✓':'Progresso de visitante salvo neste perfil';return true;
  }catch(e){const label=document.getElementById('cloudStatus');if(label)label.textContent='Sem conexão para salvar. Tentaremos novamente.';return false;}
  finally{this.saving=false;if(this.dirty){this.remember();if(typeof CONNECTION!=='undefined'&&CONNECTION.available())this.saveTimer=setTimeout(()=>this.saveNow(),5000);}}
 }
};
