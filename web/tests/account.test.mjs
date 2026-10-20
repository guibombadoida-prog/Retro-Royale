import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {harness} from './api-harness.mjs';
const normal=['cavaleiro','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos'];
const env={RESEND_API_KEY:'test-key-not-a-real-secret',LOGIN_EMAIL_FROM:'Retro Royale <login@game.test>'};
let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;},ok=v=>{assert.ok(v);count++;};
const hash=async s=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
const cookieOf=r=>r.headers.get('set-cookie')?.split(';')[0];
function setup(){
 const deliveries=[];let fail=false;
 const h=harness({env,fetch:async(url,options)=>{
  eq(url,'https://api.resend.com/emails');eq(options.headers.Authorization,'Bearer '+env.RESEND_API_KEY);ok(options.headers['Idempotency-Key'].startsWith('retro-login/'));
  const body=JSON.parse(options.body);eq(body.from,env.LOGIN_EMAIL_FROM);const code=body.text.match(/é: (\d{6})/)[1];ok(body.html.includes(code));deliveries.push({...body,code});
  return fail?Response.json({error:'private provider diagnostic'},{status:403}):Response.json({id:'test-message'});
 }});
 return {...h,deliveries,setFail(value){fail=value;}};
}
let h=setup();
async function guest(){return (await h.call('/api/profile',{})).data;}
async function begin(profile,email='player@gmail.com',options={}){
 const start=await h.call('/api/account/request-code',{profileToken:profile.token,email},options);eq(start.status,202);ok(/^[a-f0-9-]{72}$/.test(start.data.challenge));eq(start.data.resendAfter,60);ok(start.data.expires>Date.now());ok(!('code' in start.data));eq(start.headers.get('set-cookie'),null);
 return {start,profile,code:h.deliveries.at(-1).code};
}
const finish=(f,code=f.code,options={})=>h.call('/api/account/verify-code',{profileToken:f.profile.token,challenge:f.start.data.challenge,code},options);
const unavailable=harness();eq((await unavailable.call('/api/account/config')).data.emailReady,false);eq((await unavailable.call('/api/account/request-code',{})).status,503);eq((await unavailable.call('/api/account/verify-code',{})).status,503);
eq((await h.call('/api/account/config')).data,{emailReady:true,provider:'email-code',digits:6});
eq((await h.call('/api/account/authorize')).status,404);eq((await h.call('/api/account/login',{})).status,404);
const first=await guest(),guestHash=await hash(first.token);eq(first.unlocked,[]);
h.database.prepare("UPDATE player_profiles SET battles=1,unlocked='[\"reibombado\"]' WHERE token_hash=?").run(guestHash);h.database.prepare('INSERT INTO profile_battles VALUES (?,?)').run(guestHash,'ABC123');
const saved=await h.call('/api/profile',{token:first.token,save:true,revision:0,deck:normal,settings:{abilityPosition:'left',nickname:'Player',extra:'ignored'}});eq(saved.status,200);eq(saved.data.settings,{abilityPosition:'left',nickname:'Player'});
const flow=await begin(first,'  P.la.yer+arena@GoogleMail.com ');eq(flow.start.data.email,'player@gmail.com');eq(h.deliveries.at(-1).to,['player@gmail.com']);
const stored=h.database.prepare('SELECT * FROM email_login_codes').get();eq(stored.code_hash,await hash(flow.start.data.challenge+'.'+flow.code));ok(!JSON.stringify(stored).includes(flow.start.data.challenge));eq(stored.attempts,0);
eq((await h.call('/api/account/request-code',{profileToken:first.token,email:'player+another@gmail.com'})).status,429);eq(h.deliveries.length,1);
eq((await finish(flow,'123')).status,400);eq(h.database.prepare('SELECT attempts FROM email_login_codes').get().attempts,0);
const wrong=flow.code==='000000'?'000001':'000000';eq((await finish(flow,wrong)).status,401);eq(h.database.prepare('SELECT attempts FROM email_login_codes').get().attempts,1);
eq((await h.call('/api/account/verify-code',{profileToken:(await guest()).token,challenge:flow.start.data.challenge,code:flow.code})).status,410);
const session=await finish(flow);eq(session.status,200);eq(session.data.ok,true);ok(session.headers.get('set-cookie').includes('Secure'));ok(session.headers.get('set-cookie').includes('HttpOnly'));ok(session.headers.get('set-cookie').includes('SameSite=Lax'));const cookieA=cookieOf(session);
eq((await finish(flow)).status,410);eq((await finish(flow)).headers.get('set-cookie'),null);
let cloud=await h.call('/api/profile',{token:first.token},{cookie:cookieA});eq(cloud.data.unlocked,['reibombado']);eq(cloud.data.battles,1);eq(cloud.data.deck,normal);eq(cloud.data.account.email,'player@gmail.com');eq(cloud.data.account.name,'Player');ok(h.database.prepare('SELECT profile_hash FROM email_accounts').get().profile_hash!==guestHash);
// A second device proves ownership again and restores the same account.
h.database.prepare('UPDATE email_login_codes SET created=created-61000').run();
const second=await guest(),flow2=await begin(second),session2=await finish(flow2),cookieB=cookieOf(session2);eq(session2.status,200);
const restored=await h.call('/api/profile',{token:second.token},{cookie:cookieB});eq(restored.data.account.id,cloud.data.account.id);eq(restored.data.unlocked,['reibombado']);eq(restored.data.battles,1);eq(restored.data.deck,normal);
const revision=restored.data.revision,changed=['reibombado',...normal.slice(0,7)];
const save1=await h.call('/api/profile',{token:second.token,save:true,revision,deck:changed,settings:{abilityPosition:'both'}},{cookie:cookieB});eq(save1.status,200);
const conflict=await h.call('/api/profile',{token:first.token,save:true,revision,deck:normal,settings:{}},{cookie:cookieA});eq(conflict.status,409);eq(conflict.data.deck,changed);
eq((await h.call('/api/profile',{token:second.token,save:true,revision:save1.data.revision,deck:['pretobranco',...normal.slice(0,7)],settings:{}},{cookie:cookieB})).status,403);
const forgedProgress=await h.call('/api/profile',{token:second.token,battles:999,unlocked:['pretobranco']},{cookie:cookieB});eq(forgedProgress.data.battles,1);eq(forgedProgress.data.unlocked,['reibombado']);
const loggedRoom=await h.call('/api/room',{action:'create',mode:'1v1',profileToken:second.token,deck:changed},{cookie:cookieB});eq(loggedRoom.status,200);await h.call('/api/room',{action:'leave',code:loggedRoom.data.code,token:loggedRoom.data.token},{cookie:cookieB});
eq((await h.call('/api/room',{action:'create',mode:'1v1',profileToken:second.token,deck:changed})).status,403);
for(const action of ['request-code','verify-code','logout'])eq((await h.call('/api/account/'+action,{},{cookie:cookieA,headers:{Origin:'https://evil.test'}})).status,403);
eq((await h.call('/api/account/request-code',{profileToken:first.token,email:'other@gmail.com'},{cookie:cookieA})).status,409);
eq((await h.call('/api/account/logout',{}, {cookie:cookieA})).status,200);eq((await h.call('/api/profile',{token:second.token},{cookie:cookieA})).data.account,null);eq((await h.call('/api/profile',{token:second.token},{cookie:cookieB})).data.unlocked,['reibombado']);
h.database.prepare('UPDATE account_sessions SET expires=? WHERE token_hash=?').run(Date.now()-1000,await hash(cookieB.split('=')[1]));eq((await h.call('/api/profile',{token:second.token},{cookie:cookieB})).data.account,null);
// Invalid addresses never reach the mail transport.
const before=h.deliveries.length;
for(const email of ['no-at-sign','x@y','a..b@gmail.com','x@gmail.com\r\nBcc: victim@gmail.com','<b>@gmail.com','@gmail.com'])eq((await h.call('/api/account/request-code',{profileToken:first.token,email})).status,400);
eq(h.deliveries.length,before);
// Expiry, bounded guesses and isolation of different email accounts.
h=setup();const exp=await begin(await guest());h.database.prepare('UPDATE email_login_codes SET expires=?').run(Date.now()-1);eq((await finish(exp)).status,410);eq(h.database.prepare('SELECT count(*) AS n FROM email_accounts').get().n,0);
const locked=await begin(await guest(),'locked@gmail.com');for(let i=0;i<5;i++){const wrong=locked.code==='000000'?'000001':'000000';const r=await finish(locked,wrong);eq(r.status,401);eq(r.data.locked,i===4);}eq((await finish(locked)).status,410);eq(h.database.prepare('SELECT attempts FROM email_login_codes WHERE email=?').get('locked@gmail.com').attempts,5);
const other=await begin(await guest(),'different@gmail.com');const otherCookie=cookieOf(await finish(other));const otherProfile=await h.call('/api/profile',{}, {cookie:otherCookie});eq(otherProfile.data.unlocked,[]);eq(otherProfile.data.battles,0);
// A resend replaces only that device's previous code and is single-use under races.
h=setup();const person=await guest(),old=await begin(person);h.database.prepare('UPDATE email_login_codes SET created=created-61000').run();const fresh=await begin(person);eq((await finish(old)).status,410);
const simultaneous=await Promise.all([finish(fresh),finish(fresh)]);eq(simultaneous.map(r=>r.status).sort(),[200,410]);eq(h.database.prepare('SELECT count(*) AS n FROM account_sessions').get().n,1);
// Concurrent send reservations cannot bypass the email cooldown.
h=setup();const concurrentGuest=await guest();const sends=await Promise.all(Array.from({length:6},()=>h.call('/api/account/request-code',{profileToken:concurrentGuest.token,email:'race@gmail.com'})));eq(sends.filter(r=>r.status===202).length,1);eq(sends.filter(r=>r.status===429).length,5);eq(h.deliveries.length,1);ok(sends.find(r=>r.status===429).headers.get('retry-after'));
// Enforce five sends per mailbox per hour even with fresh device profiles.
h=setup();for(let i=0;i<5;i++){const p=await guest();await begin(p,'limit@gmail.com');h.database.prepare('UPDATE email_login_codes SET created=created-61000').run();}const capped=await h.call('/api/account/request-code',{profileToken:(await guest()).token,email:'limit@gmail.com'});eq(capped.status,429);ok(capped.data.retryAfter>3000);eq(h.deliveries.length,5);
// Device and source limits also cover requests for many different mailboxes.
h=setup();const device=await guest();for(let i=0;i<10;i++)await begin(device,'person'+i+'@example.test');eq((await h.call('/api/account/request-code',{profileToken:device.token,email:'next@example.test'})).status,429);
h=setup();for(let i=0;i<20;i++)await begin(await guest(),'origin'+i+'@example.test',{headers:{'cf-connecting-ip':'192.0.2.1'}});eq((await h.call('/api/account/request-code',{profileToken:(await guest()).token,email:'next@example.test'},{headers:{'cf-connecting-ip':'192.0.2.1'}})).status,429);
// Delivery failure never reports success or creates a usable challenge/session.
h=setup();h.setFail(true);const failed=await h.call('/api/account/request-code',{profileToken:(await guest()).token,email:'failure@gmail.com'});eq(failed.status,503);ok(!('challenge' in failed.data));ok(!JSON.stringify(failed.data).includes('private provider'));eq(h.database.prepare('SELECT status FROM email_login_codes').get().status,'failed');eq(h.database.prepare('SELECT count(*) AS n FROM account_sessions').get().n,0);
// Joining a room after requesting a code blocks account changes until leaving.
h=setup();const inRoom=await guest(),pending=await begin(inRoom);const room=await h.call('/api/room',{action:'create',mode:'1v1',profileToken:inRoom.token,deck:normal});eq(room.status,200);eq((await finish(pending)).status,409);eq((await h.call('/api/account/request-code',{profileToken:inRoom.token,email:'another@gmail.com'})).status,409);await h.call('/api/room',{action:'leave',code:room.data.code,token:room.data.token});eq((await finish(pending)).status,200);
console.log('Email account: '+count+' assertions passed for delivery, code expiry, bounded attempts, single use, resend and concurrent limits, CSRF, account isolation, progress migration, revisions and logout.');
