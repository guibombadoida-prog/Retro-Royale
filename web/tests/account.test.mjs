import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {SignJWT,generateKeyPair,exportJWK} from 'jose';
import {harness} from './api-harness.mjs';
const normal=['cavaleiro','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos'];
const pair=await generateKeyPair('RS256'),badPair=await generateKeyPair('RS256'),publicKey=await exportJWK(pair.publicKey);publicKey.kid='google-test-key';publicKey.alg='RS256';publicKey.use='sig';
const env={GOOGLE_OAUTH_CLIENT_ID:'test-client.apps.googleusercontent.com',GOOGLE_OAUTH_CLIENT_SECRET:'only-used-by-tests'};
let h,identity={sub:'google-person-a',email:'player@example.test',name:'Player'},mode='ok',verifierSeen;
const oldFetch=globalThis.fetch;
async function mockFetch(url,options){
 if(String(url).includes('/certs'))return Response.json({keys:[publicKey]},{headers:{'cache-control':'max-age=3600'}});
 if(String(url)==='https://oauth2.googleapis.com/token'){
  const form=new URLSearchParams(options.body);verifierSeen=form.get('code_verifier');assert.equal(form.get('client_secret'),env.GOOGLE_OAUTH_CLIENT_SECRET);
  const row=h.database.prepare("SELECT nonce FROM google_login_flows WHERE status='processing' ORDER BY created DESC LIMIT 1").get();
  const token=await new SignJWT({email:identity.email,name:identity.name,email_verified:mode!=='unverified',nonce:mode==='nonce'?'wrong':row.nonce})
   .setProtectedHeader({alg:'RS256',kid:'google-test-key'}).setSubject(identity.sub).setIssuer('https://accounts.google.com')
   .setAudience(mode==='audience'?'wrong-client':env.GOOGLE_OAUTH_CLIENT_ID).setIssuedAt().setExpirationTime(mode==='expired'?'0s':'5m').sign(mode==='forged'?badPair.privateKey:pair.privateKey);
  return Response.json({id_token:token});
 }
 throw new Error('Unexpected external request '+String(url));
}
globalThis.fetch=mockFetch;h=harness({env,fetch:mockFetch});
let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;};const has=(v,part)=>{assert.ok(v.includes(part));count++;};
const hash=async s=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
const cookieOf=r=>r.headers.get('set-cookie')?.split(';')[0];
async function guest(){return (await h.call('/api/profile',{})).data;}
async function begin(profile){const start=await h.call('/api/account/login',{profileToken:profile.token});eq(start.status,200);const auth=await h.call(start.data.authorizeUrl);eq(auth.status,302);const target=new URL(auth.headers.get('location'));eq(target.origin,'https://accounts.google.com');eq(target.searchParams.get('scope'),'openid email profile');eq(target.searchParams.get('code_challenge_method'),'S256');has(auth.headers.get('set-cookie'),'HttpOnly');return {start,auth,target,state:target.searchParams.get('state'),cookie:cookieOf(auth)};}
async function finish(flow){const callback=await h.call('/api/account/callback?state='+flow.state+'&code=code',undefined,{cookie:flow.cookie});return callback;}
async function poll(flow){return h.call('/api/account/poll',{flow:flow.start.data.flow,pollToken:flow.start.data.pollToken});}
try{
 const unavailable=harness();eq((await unavailable.call('/api/account/config')).data.googleReady,false);eq((await unavailable.call('/api/account/login',{})).status,503);
 eq((await h.call('/api/account/config')).data.googleReady,true);
 const first=await guest(),guestHash=await hash(first.token);eq(first.unlocked,[]);
 h.database.prepare("UPDATE player_profiles SET battles=1,unlocked='[\"reibombado\"]' WHERE token_hash=?").run(guestHash);h.database.prepare('INSERT INTO profile_battles VALUES (?,?)').run(guestHash,'ABC123');
 let saved=await h.call('/api/profile',{token:first.token,save:true,revision:0,deck:normal,settings:{abilityPosition:'left',nickname:'Player',extra:'ignored'}});eq(saved.status,200);eq(saved.data.settings,{abilityPosition:'left',nickname:'Player'});
 const flow=await begin(first);eq((await h.call('/api/account/callback?state='+flow.state+'&code=code')).status,403);
 eq((await h.call('/api/account/poll',{flow:flow.start.data.flow,pollToken:webcrypto.randomUUID()+webcrypto.randomUUID()})).status,410);
 eq((await finish(flow)).status,200);const challenge=await h.load('lib/google-account.ts').challenge(verifierSeen);eq(challenge,flow.target.searchParams.get('code_challenge'));
 eq((await finish(flow)).status,410);
 const session=await poll(flow);eq(session.status,200);eq(session.data.status,'complete');has(session.headers.get('set-cookie'),'Secure');has(session.headers.get('set-cookie'),'HttpOnly');has(session.headers.get('set-cookie'),'SameSite=Lax');const cookieA=cookieOf(session);
 eq((await poll(flow)).data.status,'consumed');eq((await poll(flow)).headers.get('set-cookie'),null);
 let cloud=await h.call('/api/profile',{token:first.token},{cookie:cookieA});eq(cloud.data.unlocked,['reibombado']);eq(cloud.data.battles,1);eq(cloud.data.deck,normal);eq(cloud.data.account.email,identity.email);
 assert.notEqual(h.database.prepare('SELECT profile_hash FROM google_accounts').get().profile_hash,guestHash);count++;
 const second=await guest(),flow2=await begin(second);eq((await finish(flow2)).status,200);const session2=await poll(flow2),cookieB=cookieOf(session2);
 const restored=await h.call('/api/profile',{token:second.token},{cookie:cookieB});eq(restored.data.account.id,cloud.data.account.id);eq(restored.data.unlocked,['reibombado']);eq(restored.data.battles,1);eq(restored.data.deck,normal);
 const revision=restored.data.revision,changed=['reibombado',...normal.slice(0,7)];
 const save1=await h.call('/api/profile',{token:second.token,save:true,revision,deck:changed,settings:{abilityPosition:'both'}},{cookie:cookieB});eq(save1.status,200);
 const conflict=await h.call('/api/profile',{token:first.token,save:true,revision,deck:normal,settings:{}},{cookie:cookieA});eq(conflict.status,409);eq(conflict.data.deck,changed);
 eq((await h.call('/api/profile',{token:second.token,save:true,revision:save1.data.revision,deck:['pretobranco',...normal.slice(0,7)],settings:{}},{cookie:cookieB})).status,403);
 const forgedProgress=await h.call('/api/profile',{token:second.token,battles:999,unlocked:['pretobranco']},{cookie:cookieB});eq(forgedProgress.data.battles,1);eq(forgedProgress.data.unlocked,['reibombado']);
 const loggedRoom=await h.call('/api/room',{action:'create',mode:'1v1',profileToken:second.token,deck:changed},{cookie:cookieB});eq(loggedRoom.status,200);await h.call('/api/room',{action:'leave',code:loggedRoom.data.code,token:loggedRoom.data.token},{cookie:cookieB});
 eq((await h.call('/api/room',{action:'create',mode:'1v1',profileToken:second.token,deck:changed})).status,403);
 for(const invalid of ['nonce','audience','forged','unverified']){mode=invalid;const f=await begin(await guest());const callback=await finish(f);assert.ok(callback.status>=400);count++;eq((await poll(f)).data.status,'cancelled');}
 mode='ok';const cancelled=await begin(await guest());eq((await h.call('/api/account/callback?state='+cancelled.state+'&error=access_denied',undefined,{cookie:cancelled.cookie})).status,200);eq((await poll(cancelled)).data.status,'cancelled');
 eq((await h.call('/api/account/logout',{}, {cookie:cookieA,headers:{Origin:'https://evil.test'}})).status,403);
 eq((await h.call('/api/account/logout',{}, {cookie:cookieA})).status,200);eq((await h.call('/api/profile',{token:second.token},{cookie:cookieA})).data.account,null);
 eq((await h.call('/api/profile',{token:second.token},{cookie:cookieB})).data.unlocked,['reibombado']);
 console.log('Google account: '+count+' assertions passed for signature, audience, nonce, PKCE, CSRF, one-time handoff, progress migration, cross-device restore, revisions and logout.');
}finally{globalThis.fetch=oldFetch;}
