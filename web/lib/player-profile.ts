export const CHAMPIONS: string[]=[];
export const CARD_IDS=new Set(['cavaleiro','arqueiras','goblins','gigante','bolide','estalo','bombardeiro','morcegos','princesa']);
export const newToken=()=>crypto.randomUUID()+crypto.randomUUID();
export async function hashToken(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export const validToken=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9-]{72}$/.test(value);
export function apiError(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
export function cookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
export const sessionCookie=(token:string,maxAge=2592000)=>`rr_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
export function assertOrigin(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)apiError('Origem inválida.',403);if(request.headers.get('sec-fetch-site')==='cross-site')apiError('Origem inválida.',403);}
export type Account={id:string;email:string;name:string;profile_hash:string};
export type Profile={token_hash:string;battles:number;unlocked:string;deck:string|null;settings:string|null;revision:number};
export async function accountFor(request:Request,db:D1Database){const token=cookie(request,'rr_session');if(!validToken(token))return null;return db.prepare('SELECT a.id,a.email,a.name,a.profile_hash FROM account_sessions s JOIN email_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires>?').bind(await hashToken(token),Date.now()).first<Account>();}
export async function profileFor(request:Request,db:D1Database,token:unknown){const account=await accountFor(request,db);if(account)return {profileHash:account.profile_hash,account};if(!validToken(token))apiError('Aguarde seu perfil carregar.',401);return {profileHash:await hashToken(token),account:null};}
export function validDeck(value:unknown,unlocked:string[]){
 if(!Array.isArray(value)||value.length!==8||new Set(value).size!==8||!value.every(id=>typeof id==='string'&&CARD_IDS.has(id)))apiError('Escolha oito cartas diferentes.');
 const champions=value.filter(id=>CHAMPIONS.includes(id));if(champions.length>1)apiError('Escolha apenas um campeão por baralho.');if(champions.some(id=>!unlocked.includes(id)))apiError('Campeão bloqueado.',403);return value as string[];
}
export function validSettings(value:unknown){const input=value&&typeof value==='object'?value as Record<string,unknown>:{};const out:Record<string,string|number|boolean>={};if(['left','right','both'].includes(String(input.abilityPosition)))out.abilityPosition=String(input.abilityPosition);if([0,1,2].includes(input.difficulty as number))out.difficulty=Number(input.difficulty);for(const key of ['sound','fx','light'])if(typeof input[key]==='boolean')out[key]=input[key];if(typeof input.nickname==='string')out.nickname=input.nickname.trim().replace(/[<>\x00-\x1f]/g,'').slice(0,18);return out;}
export function profileData(profile:Profile,account:Account|null){return {battles:profile.battles,unlocked:JSON.parse(profile.unlocked),deck:profile.deck?JSON.parse(profile.deck):null,settings:profile.settings?JSON.parse(profile.settings):null,revision:profile.revision,account:account?{id:account.id,name:account.name,email:account.email}:null};}
