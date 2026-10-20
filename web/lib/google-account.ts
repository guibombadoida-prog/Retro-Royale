import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { apiError,hashToken,newToken,type Account } from './player-profile';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:5000});
export function googleConfig(){const e=env as unknown as Record<string,unknown>;const clientId=typeof e.GOOGLE_OAUTH_CLIENT_ID==='string'?e.GOOGLE_OAUTH_CLIENT_ID:'';const clientSecret=typeof e.GOOGLE_OAUTH_CLIENT_SECRET==='string'?e.GOOGLE_OAUTH_CLIENT_SECRET:'';return {clientId,clientSecret,ready:!!clientId&&!!clientSecret};}
export async function challenge(verifier:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
export async function googleIdentity(idToken:string,clientId:string,nonce:string){const {payload}=await jwtVerify(idToken,keys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:clientId,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce','email'],clockTolerance:30,maxTokenAge:'10m'});if(payload.nonce!==nonce||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255||payload.email_verified!==true||typeof payload.email!=='string'||payload.email.length>320)apiError('O Google não confirmou esta identidade.',401);if(payload.azp!==undefined&&payload.azp!==clientId)apiError('Aplicativo Google inválido.',401);return {sub:payload.sub,email:payload.email,name:typeof payload.name==='string'?payload.name.slice(0,80):'Jogador'};}
export async function linkGoogle(db:D1Database,identity:{sub:string;email:string;name:string},guestHash:string){
 const id=crypto.randomUUID(),profileHash=await hashToken(newToken()),now=Date.now();
 await db.batch([db.prepare("INSERT INTO player_profiles (token_hash,battles,unlocked,created) VALUES (?,0,'[]',?)").bind(profileHash,now),db.prepare('INSERT OR IGNORE INTO google_accounts (id,google_sub,email,name,profile_hash,created) VALUES (?,?,?,?,?,?)').bind(id,identity.sub,identity.email,identity.name,profileHash,now)]);
 const account=(await db.prepare('SELECT id,email,name,profile_hash FROM google_accounts WHERE google_sub=?').bind(identity.sub).first<Account>())!;
 await db.batch([
  db.prepare('DELETE FROM player_profiles WHERE token_hash=? AND NOT EXISTS (SELECT 1 FROM google_accounts WHERE profile_hash=?)').bind(profileHash,profileHash),
  db.prepare('UPDATE google_accounts SET email=?,name=? WHERE id=?').bind(identity.email,identity.name,account.id),
  db.prepare('INSERT OR IGNORE INTO profile_battles (profile_hash,code) SELECT ?,code FROM profile_battles WHERE profile_hash=?').bind(account.profile_hash,guestHash),
  db.prepare(`UPDATE player_profiles SET battles=MAX(battles,COALESCE((SELECT battles FROM player_profiles WHERE token_hash=?),0),(SELECT COUNT(*) FROM profile_battles WHERE profile_hash=?)),unlocked=(SELECT json_group_array(value) FROM (SELECT DISTINCT value FROM json_each(player_profiles.unlocked) UNION SELECT value FROM json_each(COALESCE((SELECT unlocked FROM player_profiles WHERE token_hash=?),'[]')))),deck=COALESCE(deck,(SELECT deck FROM player_profiles WHERE token_hash=?)),settings=COALESCE(settings,(SELECT settings FROM player_profiles WHERE token_hash=?)),revision=revision+1 WHERE token_hash=?`).bind(guestHash,account.profile_hash,guestHash,guestHash,guestHash,account.profile_hash)
 ]);return {...account,email:identity.email,name:identity.name};
}
