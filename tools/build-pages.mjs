// Monta o site do GitHub Pages em _site/: a página inicial (site/) e o jogo (web/public/) em modo site, sem API.
// Uso, a partir da raiz do repositório: node tools/build-pages.mjs
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const OUT=join(ROOT,'_site');
// Endereço do servidor online (Cloudflare). O workflow descobre com `node tools/cloudflare.mjs endereco`;
// vazio = servidor fora do ar, e o site mostra só o treino.
const ONLINE_URL=(process.env.ONLINE_URL||'').trim();
if(ONLINE_URL&&!/^https?:\/\/[^\s"'<>]+\/$/.test(ONLINE_URL))fail('ONLINE_URL precisa ser um endereço http(s) terminado em /: '+ONLINE_URL);
const TIPOS={tropa:'Tropa',feitico:'Feitiço',construcao:'Construção'};

function fail(message){console.error('build-pages: '+message);process.exit(1);}
function replaceOnce(text,from,to,where){
 if(text.split(from).length!==2)fail(`esperava encontrar "${from}" uma vez em ${where}`);
 return text.replace(from,()=>to);
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// As cartas vêm direto do engine.js, então a página nunca mostra uma carta que o jogo não tem.
function readCards(){
 const engine=readFileSync(join(ROOT,'web/public/game/engine.js'),'utf8');
 const start=engine.indexOf('const CARDS = ['),end=engine.indexOf('\n];',start);
 if(start<0||end<0)fail('não encontrei "const CARDS = [ ... ];" em web/public/game/engine.js');
 const cards=vm.runInNewContext(engine.slice(start+'const CARDS = '.length,end+3),{}).filter(c=>!c.oculta);
 if(!cards.length)fail('nenhuma carta encontrada em engine.js');
 return cards;
}

function cardHtml(c,icons){
 const icon=icons.has(c.art)?c.art:'carta',extras=[TIPOS[c.tipo]||c.tipo];
 if(c.n>1)extras.push('×'+c.n);
 if(c.ar)extras.push('voa');
 return `<li class="card" data-art="${escape(c.art)}"><span class="cost" aria-label="${c.custo} de elixir">${c.custo}</span>`+
  `<svg class="icon" viewBox="0 0 64 64" aria-hidden="true"><use href="#art-${icon}"/></svg>`+
  `<b>${escape(c.nome)}</b><small>${escape(c.papel||'')}</small><span class="tags">${extras.map(escape).join(' · ')}</span></li>`;
}

// Confere se todo arquivo local citado por src/href/url() existe no _site/ gerado.
function checkLinks(file){
 const text=readFileSync(file,'utf8'),missing=[];
 for(const match of text.matchAll(/(?:src|href)="([^"]+)"|url\(['"]?([^'")]+)/g)){
  const ref=match[1]||match[2];
  if(/^(?:[a-z]+:|#|\/\/)/i.test(ref))continue;
  if(ref.startsWith('/'))fail(`${file.slice(OUT.length+1)} usa o caminho absoluto "${ref}", que quebra em /Retro-Royale/ no GitHub Pages`);
  const clean=ref.split(/[?#]/)[0],path=resolve(dirname(file),clean);
  if(!existsSync(clean.endsWith('/')||clean===''?join(path,'index.html'):path))missing.push(ref);
 }
 if(missing.length)fail(`${file.slice(OUT.length+1)} aponta para arquivos que não existem: ${missing.join(', ')}`);
}

rmSync(OUT,{recursive:true,force:true});
mkdirSync(OUT,{recursive:true});

// 1. O jogo, igual ao servidor, mas com config.js em modo site.
cpSync(join(ROOT,'web/public/game'),join(OUT,'game'),{recursive:true});
cpSync(join(ROOT,'web/public/favicon.svg'),join(OUT,'favicon.svg'));
const configPath=join(OUT,'game/config.js');
writeFileSync(configPath,replaceOnce(readFileSync(configPath,'utf8'),"const RR_SITE={estatico:false,online:''};",
 `const RR_SITE={estatico:true,online:${JSON.stringify(ONLINE_URL)}};`,'web/public/game/config.js'));

// 2. A página inicial e o que mais houver em site/.
for(const name of readdirSync(join(ROOT,'site')))if(name!=='index.html')cpSync(join(ROOT,'site',name),join(OUT,name),{recursive:true});
let home=readFileSync(join(ROOT,'site/index.html'),'utf8');
const cards=readCards();
// Carta nova sem desenho em site/index.html (<symbol id="art-...">) usa a coroa genérica.
const icons=new Set([...home.matchAll(/<symbol id="art-([\w-]+)"/g)].map(m=>m[1]));
home=replaceOnce(home,'<!-- CARTAS -->',cards.map(c=>cardHtml(c,icons)).join('\n   '),'site/index.html');
home=replaceOnce(home,'{{QUANTAS_CARTAS}}',String(cards.length),'site/index.html');
// Trechos <!-- COM-ONLINE -->...<!-- /COM-ONLINE --> só aparecem com servidor; <!-- SEM-ONLINE --> só sem ele.
for(const [tag,show] of [['COM-ONLINE',!!ONLINE_URL],['SEM-ONLINE',!ONLINE_URL]])
 home=home.replace(new RegExp(`<!-- ${tag} -->([\\s\\S]*?)<!-- /${tag} -->`,'g'),(_,inner)=>show?inner:'');
if(/<!-- \/?(?:COM|SEM)-ONLINE -->/.test(home))fail('site/index.html tem um marcador COM-ONLINE/SEM-ONLINE sem par');
home=home.replaceAll('{{ONLINE_URL}}',escape(ONLINE_URL));
if(/\{\{[A-Z_]+\}\}/.test(home))fail('site/index.html ainda tem um marcador {{...}} sem valor');
writeFileSync(join(OUT,'index.html'),home);

checkLinks(join(OUT,'index.html'));
checkLinks(join(OUT,'game/index.html'));
checkLinks(join(OUT,'game/arena.css'));
console.log(`Site pronto em _site/ (${cards.length} cartas, ${ONLINE_URL?'online em '+ONLINE_URL:'sem servidor online: só treino'}).`);
