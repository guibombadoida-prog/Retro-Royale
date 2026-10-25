'use strict';
// Onde o jogo está hospedado. Com servidor (Sites, Cloudflare, `pnpm dev`) o jogo usa a API em /api.
// O build do GitHub Pages (tools/build-pages.mjs) publica este arquivo com estatico:true: sem API, só o treino
// roda no próprio site e "Batalhar online" abre a versão com servidor indicada em `online`.
const RR_SITE={estatico:false,online:''};
if(RR_SITE.estatico)document.documentElement.dataset.site='estatico';
