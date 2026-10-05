'use strict';
const CHAMPION_IDS=['reibombado','pretobranco','boneca'];
const PROGRESS={
 token:null,battles:0,unlocked:[],loaded:false,
 allowed(id){return !CHAMPION_IDS.includes(id)||this.unlocked.includes(id);},
 sanitize(deck){
  const normal=['cavaleiro','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos'];
  const out=[];let champion=false;
  for(const id of deck){if(!this.allowed(id)||CHAMPION_IDS.includes(id)&&champion)continue;if(CHAMPION_IDS.includes(id))champion=true;if(!out.includes(id))out.push(id);}
  for(const id of normal)if(out.length<8&&!out.includes(id))out.push(id);return out.slice(0,8);
 },
 apply(data){
  const was=this.unlocked.includes('reibombado');this.battles=Math.max(0,Number(data.battles)||0);this.unlocked=(data.unlocked||[]).filter(id=>CHAMPION_IDS.includes(id));
  const label=document.getElementById('championProgress');if(label)label.textContent=this.unlocked.length?'Rei Bombado liberado · 1 campeão por baralho':'Campeões bloqueados · jogue 1 batalha online';
  if(!was&&this.unlocked.includes('reibombado')){if(typeof toast==='function')toast('Rei Bombado desbloqueado!', '#FFD44E');if(typeof buildPool==='function')buildPool();}
 },
 init(){if(!this.loadingPromise)this.loadingPromise=this.load().finally(()=>{this.loadingPromise=null;});return this.loadingPromise;},
 async load(){
  try{this.token=localStorage.getItem('retro-profile-token');}catch(e){}
  try{
   let response=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:this.token})});
   if(response.status===404){this.token=null;response=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}
   const data=await response.json();if(!response.ok)throw new Error(data.error);
   this.token=data.token;this.apply(data);this.loaded=true;
   try{localStorage.setItem('retro-profile-token',this.token);}catch(e){}
  }catch(e){const label=document.getElementById('championProgress');if(label)label.textContent='Progresso indisponível · toque em Online para tentar novamente';}
 }
};
