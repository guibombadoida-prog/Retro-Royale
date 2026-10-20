'use strict';
const CONNECTION={
 state:navigator.onLine===false?'offline':'online',nativeOnline:null,wifi:null,checking:false,timer:0,generation:0,retries:0,lastChecked:0,
 available(){return this.state==='online'&&this.nativeOnline!==false&&navigator.onLine!==false;},
 paint(){const banner=document.getElementById('connectionBanner'),label=document.getElementById('connectionMessage');if(!banner)return;const peerWait=typeof NET!=='undefined'&&NET.active&&(NET.peerPaused||NET.remotePaused||NET.stale());banner.hidden=this.available()&&!peerWait;if(!banner.hidden)label.textContent=peerWait&&this.available()?'Aguardando um jogador reconectar. A batalha está suspensa.':this.state==='checking'?'Verificando acesso à internet…':this.state==='offline'?'Conexão perdida. Verifique o Wi-Fi ou os dados móveis.':'A conexão com o jogo caiu. Tentando reconectar…';banner.dataset.state=this.state;},
 set(state){const was=this.available();this.state=state;this.paint();if(!was&&this.available())this.recovered();},
 async probe(){if(this.checking)return;clearTimeout(this.timer);if(navigator.onLine===false||this.nativeOnline===false){this.set('offline');this.schedule();return;}this.checking=true;const generation=this.generation;
  try{const r=await fetch('/api/health?t='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(4500)}),d=await r.json();if(!r.ok||d.ok!==true||d.service!=='retro-royale')throw new Error('health');if(generation!==this.generation)return;this.retries=0;this.lastChecked=Date.now();this.set('online');}catch(e){if(generation===this.generation){this.retries++;this.set(navigator.onLine===false||this.nativeOnline===false?'offline':'retrying');}}finally{this.checking=false;this.schedule();}
 },
 schedule(){clearTimeout(this.timer);const delay=this.available()?(typeof NET!=='undefined'&&NET.room?10000:25000):Math.min(10000,1500*Math.max(1,this.retries));this.timer=setTimeout(()=>this.probe(),delay);},
 lost(){this.generation++;this.set('offline');if(typeof NET!=='undefined')NET.connectionLost();this.schedule();},
 changed(){this.generation++;if(!this.available())this.set('checking');this.probe();},
 async recovered(){if(typeof NET!=='undefined'&&NET.room)NET.reconnect();if(typeof ACCOUNT!=='undefined'){ACCOUNT.init();if(ACCOUNT.flow)ACCOUNT.poll();}if(typeof PROGRESS!=='undefined'&&!(typeof NET!=='undefined'&&NET.active)){if(!PROGRESS.loaded)await PROGRESS.init();if(PROGRESS.dirty)PROGRESS.saveNow();}},
 native(data){this.nativeOnline=data.online===true;this.wifi=typeof data.wifi==='boolean'?data.wifi:null;if(!this.nativeOnline)this.lost();else this.changed();},
 init(){document.getElementById('retryConnection').onclick=()=>{if(this.nativeOnline===false)this.nativeOnline=null;this.changed();};addEventListener('offline',()=>this.lost());addEventListener('online',()=>{this.nativeOnline=null;this.changed();});addEventListener('retro-network',e=>this.native(e.detail||{}));navigator.connection?.addEventListener?.('change',()=>{this.nativeOnline=null;if(typeof NET!=='undefined'&&NET.room)NET.reconnect();this.changed();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.changed();});this.paint();this.probe();}
};
window.CONNECTION=CONNECTION;
