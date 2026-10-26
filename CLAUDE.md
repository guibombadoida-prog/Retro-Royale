# CLAUDE.md — Retro Royale (Ponte das Coroas)

Guia para o Claude Code. Leia este arquivo inteiro antes de mexer em qualquer coisa e leia `TAREFAS.md` para saber o que está pendente.

O dono do projeto é o Gui (Gui Bomba Doida, AmizadeTale Studios). Ele fala português do Brasil, vem do Roblox/Lua e está aprendendo o lado web. Responda em português, explique o que mudou e por quê, e nunca apague arquivo dele sem avisar.

## 1. O que é o jogo

Arena de cartas 3D em tempo real, em retrato (celular), inspirada em jogos de arena com cartas. Cada jogador tem um baralho de 8 cartas, uma mão de 4, elixir que regenera e três torres (uma torre do rei e duas princesas) de cada lado, com um rio e duas pontes no meio. A partida dura 180 s mais 60 s de prorrogação.

Modos: treino contra a IA (3 níveis), e online 1v1, 2v1, 2v2 e 3v1. Cada participante tem mão, ciclo e elixir próprios. Nos modos assimétricos o jogador solo regenera elixir 2× ou 3× mais rápido.

Plataformas: navegador e app Android (um WebView que carrega o site publicado). Os dois usam o mesmo jogo e entram na mesma sala pelo código de 6 caracteres.

**Estado atual das cartas (decisão do dono):** o jogo tem exatamente **8 cartas, baralho fixo**: `cavaleiro`, `arqueiras`, `goblins`, `gigante`, `bolide`, `estalo`, `bombardeiro`, `morcegos`. Todas as outras cartas e os 3 campeões foram removidos. O dono vai **remodelar todas as cartas e os modelos 3D** (rigs R6 do Roblox com textura e skin, e animações convertidas para código tipo CFrame). Não reintroduza cartas removidas.

## 2. Estrutura do repositório

```
/
├── CLAUDE.md, TAREFAS.md        este guia e a lista de pendências
├── README.md                    visão geral (em inglês)
├── index.html                   protótipo antigo de arquivo único; NÃO é servido pelo app
├── site/index.html              página inicial do site no GitHub Pages
├── tools/build-pages.mjs        monta o site do GitHub Pages em _site/ (ignorado pelo git)
├── tools/cloudflare.mjs         API da Cloudflare para os workflows: cria o banco D1 e descobre o endereço do servidor
├── tools/tripo-generate.js      gerador de modelos Tripo3D (não usado pelo jogo)
├── .github/workflows/           cloudflare.yml (servidor), pages.yml (site), build-android.yml, tripo-generate.yml
├── android/                     app Android (WebView), Gradle
└── web/                         tudo do site e do jogo
    ├── worker/index.ts          entrada do Worker: /api/live vai para a sala ao vivo, o resto para o app (vinext)
    ├── app/                     Next.js (vinext): page.tsx + rotas de API
    │   └── api/{health,profile,room,account/[action]}/route.ts
    ├── lib/                     player-profile.ts, email-account.ts, live-room.ts (sala ao vivo)
    ├── db/                      schema.ts (Drizzle) e index.ts
    ├── drizzle/                 migrações SQL geradas (0000..0002)
    ├── wrangler.jsonc           Worker "retro-royale" + banco D1 "retro-royale" (binding DB) + Durable Object RoomLive (binding LIVE)
    ├── public/game/             O JOGO (cliente, scripts clássicos sem bundler)
    │   ├── index.html           toda a interface HTML do jogo
    │   ├── arena.css            todo o CSS
    │   ├── engine.js            simulação + render 2D + UI de baralho (146 KB)
    │   ├── ui.js                HUD, configurações, vitrine do menu
    │   ├── online.js            multiplayer (WebRTC + fallback HTTPS)
    │   ├── progress.js          perfil/progresso, baralho, sincronização na nuvem
    │   ├── account.js           login por e-mail
    │   ├── connection.js        monitor de conexão e banner offline
    │   ├── config.js            onde o jogo está hospedado (RR_SITE); modo site sem API
    │   ├── sfx.js, clock.js
    │   ├── arena3d.bundle.js    BUNDLE GERADO do 3D (não edite à mão)
    │   └── assets/              fonts/, sfx/, vfx/ + README com créditos
    ├── src/game/                FONTE do 3D (vira o arena3d.bundle.js)
    │   ├── arena3d.js           cena Three.js, câmera, torres, VFX, ponte com o engine
    │   ├── models3d.js          modelos cartoon (toon + contorno) de tropas, torres, ruínas e projéteis
    │   ├── animation.js         animateRig / animateDeath (um estilo de ataque por tropa)
    │   └── software3d.js        renderizador por CPU quando não há WebGL
    └── tests/                   testes Node (ver seção 8)
```

## 3. Arquitetura do cliente (a parte mais importante)

O jogo **não passa por bundler** exceto o 3D. `public/game/index.html` carrega `connection.js`, `clock.js`, `sfx.js`, `progress.js`, `engine.js`, `online.js`, `account.js`, `ui.js` e `arena3d.bundle.js` como `<script>` clássicos. Eles compartilham **escopo global** (`G`, `CARD`, `CARDS`, `NET`, `PROGRESS`, `TEAMS`, `deckSel`, `TILE`...). Por isso um nome novo pode colidir com outro arquivo, e a ordem dos scripts importa. Antes de todos, no `<head>`, vem `config.js` com `RR_SITE`.

### Modo site (GitHub Pages)

`config.js` define `RR_SITE={estatico:false,online:''}`. O build do GitHub Pages publica uma cópia com `estatico:true`: não existe `/api`, então `connection.js` não monitora nada, `progress.js` guarda as preferências só no navegador (chave `retro-cloud-pending`) e nunca tenta salvar, `account.js` não chama a API, o CSS (`html[data-site=estatico]`) esconde login, transferência e modos online, e "Batalhar online" abre `RR_SITE.online` em outra aba. Se o servidor da Cloudflare estiver fora do ar no build, `online` fica vazio, `html[data-online=nao]` esconde o botão e o jogo avisa que o online está chegando. **Todo código novo que chama `/api` precisa respeitar `RR_SITE.estatico`.**

### engine.js (seções numeradas por comentário)

| Seção | Conteúdo |
|---|---|
| 0 | Constantes do mundo: `TILE=64`, arena `AW=18 × AH=26` casas, rio nas linhas 12–14, pontes em `LANE=[3.5,14.5]`, torres em `PR_Y`/`KG_Y`, `MATCH_TIME=180`, `OVER_TIME=60`, paleta `T`, lados `side.ally/foe` |
| 1 | Matemática |
| 2 | `CARDS` (as 8 cartas), `CARD` (por id), `POOL`, `DEFAULT_DECK`, `FOE_DECKS` |
| 3 | VFX 2D: partículas, anéis, decalques, números |
| 4 | Áudio sintetizado (`AU`) |
| 5 | **Arte procedural 2D** (`ART`): uma função por `art` desenhando no canvas. Só é usada quando não há WebGL (ícones de carta caem nela) e no sprite 2D |
| 6 | Estado `G` e entidades |
| 7 | Projéteis, feitiços, simulação de unidades |
| (campeões) | Bloco "Habilidades de campeão": **código morto**, ver `TAREFAS.md` |
| 8 | Baralho, IA rival, fluxo da partida (`startMatch`, `initCycle`, `TEAMS`) |
| 9 | Render 2D |
| 10 | Interface: arrastar e soltar, construtor de baralho (`buildPool`, `syncDeck`, `launch`) |
| 11 | Laço principal |

Coordenadas do mundo: x em `0..1152`, y em `0..1664` (`AW*TILE` × `AH*TILE`). O lado `foe` fica em cima (y pequeno), `ally` embaixo. No online o jogador do time 1 vê o campo espelhado (`y' = 1664 - y`).

### Campos de uma carta em `CARDS`

`id`, `nome`, `custo` (elixir), `tipo` (`tropa` | `construcao` | `feitico`), `papel` (texto na UI), `art` (chave de arte/modelo 3D), `hp`, `dmg`, `hit` (segundos entre golpes), `range` (em casas), `speed` (casas/s), `sight`, `alvo` (`chao` | `ambos` | `construcoes`), `raio`, `massa`, `deploy` (tempo de entrada), `n` (quantas unidades nascem), `splash`, `proj` (tipo de projétil: `arrow`, `bomb`...), `ar:true` (voa), `pula` (salta o rio), `feitico:{kind, raio, dmg, ...}` para feitiços.

### Ponte engine ↔ 3D (`src/game/arena3d.js`)

`ARENA3D` lê `G.units` a cada quadro. Para cada entidade cria um nó: `unitModel(e.card.art, e.side)` para unidades e `towerModel(side, king)` para torres, e chama `animateRig(n, e, time, dt)` e `animateDeath`. A conversão de coordenadas é `world(x,y) = (x/64 - 9, altura, y/64 - 13)`, ou seja, 1 casa = 1 unidade do Three.js. Câmera: `PerspectiveCamera` de 29°. Se `ARENA3D.ready` for falso aparece "3D indisponível".

**O bundle precisa ser reconstruído sempre que algo em `web/src/game/` mudar:**

```sh
cd web && pnpm build:game     # gera public/game/arena3d.bundle.js (Vite, formato IIFE)
```

Sem WebGL, `software3d.js` rasteriza os mesmos triângulos na CPU (usa o `Projector` do Three). Ele lê a cor por vértice da malha; nesse caminho `setLowDetail(true)` monta os modelos com menos lados e sem contorno. **Verifique** qualquer modelo novo com textura nesse caminho (teste abrindo com WebGL desligado).

### Visual 3D cartoon (`models3d.js`, decisão do dono)

Estilo cartoon arredondado: cabeça grande, formas lisas, cor do time forte (azul `palette.ally`, vermelho `palette.foe`) no que aparece de cima (capacete, capuz, bandana, ombros, asas).
- `materials.toon`: `MeshToonMaterial` com gradiente de 3 tons e brilho de borda; `materials.glow` para o que brilha sozinho (pavio, olhos do esqueleto); `materials.outline`: contorno escuro "inverted hull". O contorno some no modo leve e quando `QUALITY` cai (arena3d `render`).
- `Parts` monta tudo com cor por vértice e une numa malha por parte do rig: `box` (arredondada), `ball`, `dome`, `capsule`, `cyl`, `cone`, `torus`, `lathe`, `shape` (extrusão), `at(x,y,z,rx,ry,rz,fn)` (sub-referencial) e opções `{glow, outline}`. Os lados de cada peça dependem do tamanho (olho pequeno = poucos lados).
- Orçamento para o celular (conferido no `combat.test.mjs`): cada tropa abaixo de 4.500 triângulos sem o contorno; torre abaixo de 7.500.
- Torres: base de pedra com bandeiras do time e uma **balestra** na torreta (as torres atiram `bolt`); a do rei tem o rei atrás da balestra. Projéteis 3D: `projectileModel('arrow'|'bolt'|'bomb')`.
- `window.cardPortrait3D(art, side)` (no bundle) fotografa o modelo numa pose de ação; `paintCard` (engine.js) usa esse retrato nas cartas da mão, do baralho e da próxima carta, e a página inicial também. Sem WebGL volta para a arte 2D `ART`. Feitiços continuam com `SPELL_ART`.
- Efeitos 3D próprios do `arena3d.js` (além das partículas do engine): poeira ao pousar, puff de morte, estrelas de atordoado, clarão e onda do Bólide/Estalo, estilhaços da torre, raios do céu até o chão.

### Desempenho no celular (não desfaça sem medir)

- **Rig com ossos:** `bakeRig` (models3d.js) une as peças de cada tropa e torre numa `SkinnedMesh` por material (toon, contorno, brilho); os grupos do rig viram os ossos. São 2 ou 3 chamadas de desenho por tropa em vez de uma por peça. `unitModel` devolve uma cópia com esqueleto próprio (`cloneModel`); ao tirar um modelo de cena chame `releaseModel`. Sem WebGL (`setLowDetail(true)`) os modelos continuam em peças, porque o renderizador por CPU não anima ossos.
- **Sombras:** só arena e torres entram no mapa de sombra, que é **estático** (`shadowMap.autoUpdate=false`); marque `renderer.shadowMap.needsUpdate=true` quando algo parado mudar (torre nasce, cai ou é removida). As tropas usam a sombra redonda e o anel do time das `Marks` (`InstancedMesh`, uma chamada para todas).
- **Qualidade automática:** `LEVELS` + `tune()` no arena3d.js medem o tempo entre quadros desenhados e trocam resolução (`pr`), sombra e contorno. Começa no degrau 3 em tela de toque, cai depois de 1,5 s acima de ~24 ms por quadro e nunca volta a um degrau que já pesou. "Modo leve" limita ao degrau 1.
- **Até 60 quadros desenhados por segundo** (engine.js `frame`): telas de 90/120 Hz não desenham em dobro; a simulação continua em passos fixos de 1/60 s.
- O `#cv` (canvas 2D) é só a camada de toque: fica 1×1 pixel com o 3D e não é limpo a cada quadro.
- Para medir: chamadas de desenho por quadro em `ARENA3D.renderer.info.render.calls` (não conta a passada de sombra). Numa batalha com 24 tropas eram ~490 (com a sombra) e ficaram ~85.

### Contrato do rig 3D (o que `animation.js` espera)

`unitModel(art, team)` devolve um `Group` cujos filhos são grupos **nomeados**: `leftLeg`, `rightLeg`, `leftArm`, `rightArm`, `head` (pivô no pescoço) e, para voadores, `leftWing`, `rightWing`; o braço direito pode ter um `prop` (a bomba do Bombardeiro, que some no arremesso). `animateRig` só altera `rotation.x/y/z` desses grupos (pivô na articulação) mais rotação/escala/posição do modelo inteiro. `root.userData.height` define a altura da barra de vida e `root.userData.style` escolhe o ataque (`sword`, `stab`, `punch`, `bow`, `throw`, `bite`, em `STYLES` do `animation.js`). O dano sai quando `atk` vira 1, então a pose de contato do golpe é a de `atk=1`. Os estados que dirigem a animação vêm de `e` (a entidade): `moving`, `heading`, `ph` (fase do passo), `attackWindup`, `attackPrep`, `atk` (0..1 durante o golpe), `hurt`, `stun`, `deploy`, `air`. Um rig novo precisa expor esses nomes (ou o `animation.js` precisa ser trocado junto, com os testes).

### Online (`online.js`, `app/api/room/route.ts`, `lib/live-room.ts`)

O anfitrião simula a 60 Hz e envia estado aos convidados 15 vezes por segundo. Convidados predizem o próprio ciclo e elixir e interpolam as unidades autoritativas. Comandos têm número de sequência, são deduplicados e cobrados uma vez. `NET` é o objeto global; `TEAMS` cuida de jogadores e times. Três caminhos, do mais rápido ao mais lento (o selo da partida mostra qual está em uso):

1. **DIRETO** (WebRTC): canal ordenado para comandos e não confiável para o estado. Rede móvel costuma bloquear.
2. **AO VIVO** (`/api/live`): WebSocket com um Durable Object por sala (`RoomLive` em `lib/live-room.ts`). O Worker confere o token da sala (vai no cabeçalho `Sec-WebSocket-Protocol`, nunca na URL) e o lugar do jogador no D1; o objeto repassa anfitrião → convidados e convidado → anfitrião com o remetente carimbado, com limite de tamanho e de mensagens por segundo. O anfitrião continua validando toda jogada.
3. **ONLINE** (HTTPS `/api/room`): sinalização, batimento a cada 1,1 s e, se nada acima abrir, a partida inteira (lento: cada `sync` faz várias consultas ao D1, que fica longe).

**O pacote do estado é enxuto (~5 KB; antes ~50 KB).** Regras ao mexer nele:
- `NET_KEYS` lista os campos de unidade, torre e projétil que viajam; valores iguais a `NET_DEFAULTS` não viajam e o convidado os completa (`netFill`). Campo novo que o 3D ou a UI do convidado lê precisa entrar em `NET_KEYS`.
- As partículas não viajam. O anfitrião registra as chamadas das funções de efeito listadas em `NET_FX` (`sparks`, `explode`, `dmgText`...) e o convidado repete as mesmas chamadas (`replayFx`, espelhando para o time de cima). Efeito novo que o convidado deve ver é uma função nova na seção 3 do engine.js **e** um nome em `NET_FX`; `part()` direto não aparece para o convidado.
- Emissores contínuos (`walkDust`, `projTrail`, `meteorTrail`) o convidado gera sozinho no `NET.frame` a partir do estado.
- O anfitrião não enfileira: se o canal ainda tem pacote pendente (`bufferedAmount`), pula o envio daquele quadro. Fila no celular vira ping alto.

### Progresso, conta e perfil

Visitante: token de 72 caracteres hex em `localStorage` (`retro-profile-token`), guardado só como hash no servidor. Conta: login por e-mail com código (Resend), cookie `rr_session` `HttpOnly`. Ao verificar o e-mail, o progresso de visitante é copiado para o perfil da conta. Revisões evitam sobrescrever outro dispositivo (HTTP 409). Detalhes em `web/docs/EMAIL_LOGIN.md`.

## 4. Backend (web/app, web/lib, web/db)

- Next.js 16 via **vinext**, alvo **Cloudflare Workers + D1** (SQLite). Banco com Drizzle; migrações em `web/drizzle/`. Para mudar o schema: edite `db/schema.ts`, rode `pnpm db:generate`, e nunca edite migração antiga.
- Rotas: `GET /api/health` (devolve `{ok:true, service:'retro-royale'}`; o cliente **exige** `service === 'retro-royale'`), `POST /api/profile`, `POST /api/room`, `POST /api/account/[action]` (`request-code`, `verify-code`, `logout`).
- Tabelas: `rooms`, `inputs`, `team_rooms`, `room_players`, `team_inputs`, `player_profiles`, `profile_battles`, `email_accounts`, `account_sessions`, `email_login_codes`.
- Segredos (nunca no código): `RESEND_API_KEY`, `LOGIN_EMAIL_FROM`. Sem eles o login por e-mail aparece como "será liberado em breve".
- Validação de cartas no servidor: `CARDS` em `app/api/room/route.ts` e `CARD_IDS` em `lib/player-profile.ts`. Os dois **precisam** ter exatamente os mesmos ids do `CARDS` do engine.
- **Servidor (online, contas, progresso): Cloudflare Workers + D1 + Durable Objects na conta grátis do dono.** `web/wrangler.jsonc` define o Worker `retro-royale` (entrada `worker/index.ts`), o banco `retro-royale` (binding `DB`, migrações em `drizzle/`) e o Durable Object `RoomLive` (binding `LIVE`, classe SQLite do plano grátis, migração `v1`). Classe nova ou renomeada de Durable Object precisa de uma migração nova em `migrations` (nunca edite a `v1`). O banco D1 foi criado sem dica de local e ficou longe do Brasil; por isso a partida não passa mais por ele quando há caminho direto ou ao vivo. `.github/workflows/cloudflare.yml` roda testes, build e `wrangler deploy --dry-run` em pull requests; na `main`, com os segredos `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`, cria o banco se precisar (`node tools/cloudflare.mjs banco`, que grava o `database_id` só no CI), aplica as migrações, publica, confere `/api/health` e manda refazer o site e, se o endereço mudou, o APK. Endereço: `https://retro-royale.<subdomínio>.workers.dev/`; a variável do repositório `ONLINE_URL` troca por um domínio próprio. O ChatGPT Sites foi removido.
- O site próprio do dono é o **GitHub Pages** (`https://guibombadoida-prog.github.io/Retro-Royale/`): `.github/workflows/pages.yml` roda `node tools/build-pages.mjs` em pull requests e publica a partir da `main`. Ele junta `site/index.html` (a lista de cartas vem do `CARDS` do engine.js) com uma cópia de `web/public/` e falha se algum caminho for absoluto ou não existir. Só o treino roda lá. O workflow pergunta o endereço do servidor com `node tools/cloudflare.mjs endereco` (só vale se `/api/health` responder) e passa em `ONLINE_URL` para o build; vazio = "online em breve". Na `site/index.html`, trechos entre `<!-- COM-ONLINE -->` e `<!-- SEM-ONLINE -->` dependem disso.

## 5. Android (android/)

App nativo mínimo: um `WebView` que abre `GAME_URL` (`android/app/build.gradle`). O workflow passa `RR_GAME_URL` com o servidor da Cloudflare quando ele está no ar; sem ele, o app abre o jogo no GitHub Pages (só treino). O endereço usado fica escrito nas notas do release `android-latest`. Se a página ou a rede falhar, mostra tela offline com "tentar de novo". Links externos abrem no navegador. Pacote `br.com.guibomba.retroroyale`, minSdk 26, compileSdk 35, JDK 17, Gradle 8.11.1.

```sh
cd android && gradle assembleDebug
```

Não há Gradle wrapper no repositório; o CI (`build-android.yml`) usa `setup-gradle`.

## 6. Regras que não podem quebrar

1. **Os ids de carta têm 4 lugares** que precisam andar juntos: `CARDS` + `DEFAULT_DECK` (engine.js), `DECK_IDS` (progress.js), `CARDS` (room/route.ts), `CARD_IDS` (lib/player-profile.ts), e `testNormal` nos testes. Errar um deles dá "Escolha oito cartas diferentes" no online ou baralho vazio.
2. Mudou `web/src/game/*`? Rode `pnpm build:game` e **commite o bundle** (o site serve `public/game/arena3d.bundle.js` direto).
3. Scripts do cliente compartilham escopo global. Não declare `const`/`let` com nome já usado em outro arquivo.
4. O servidor nunca confia no cliente: baralho, progresso e comandos são validados na API. Mantenha assim.
5. Não use `localStorage` fora do que já existe (`retro-profile-token`, `retro-cloud-pending`, `ponte-coroas-deck`, `retro-ability-position`).
6. Todo texto visível ao jogador é em português do Brasil.
7. O jogo precisa continuar jogável sem WebGL (fallback por software) e em tela de celular em retrato.
8. O pacote do online só leva o que está em `NET_KEYS` e os efeitos de `NET_FX` (seção 3, Online). Esquecer um deles faz o convidado ver algo diferente do anfitrião.
9. Caminhos de arquivos do jogo são **relativos** (`arena.css`, `assets/sfx/...`, `../favicon.svg`), nunca `/game/...`: no GitHub Pages o jogo fica em `/Retro-Royale/game/`. Só `/api/...` continua absoluto. O `tools/build-pages.mjs` confere o HTML e o CSS.

## 7. Como rodar

Pré-requisitos: Node ≥ 22.13 e pnpm.

```sh
cd web
pnpm install
pnpm build:game        # 3D -> public/game/arena3d.bundle.js
pnpm dev               # servidor de desenvolvimento (porta 5173)
pnpm build             # build completo (já roda build:game antes) -> dist/ (Worker da Cloudflare)
pnpm db:migrate:local  # aplica drizzle/ no banco D1 local
pnpm start             # roda o Worker montado como na Cloudflare (http://127.0.0.1:8787), online funcionando
```

Para testar só o cliente do jogo, sem API, qualquer servidor estático servindo `web/public/` abre `/game/index.html` e o **treino** funciona (o online e a conta precisam da API).

Para ver o site do GitHub Pages como ele vai ao ar (a partir da raiz do repositório):

```sh
node tools/build-pages.mjs                         # gera _site/
mkdir -p /tmp/pages && ln -sfn "$PWD/_site" /tmp/pages/Retro-Royale
python3 -m http.server 8000 --directory /tmp/pages  # abra http://localhost:8000/Retro-Royale/
```

## 8. Testes

Rode a partir de `web/`:

```sh
node tests/online.test.mjs        # API real em SQLite, 4 modos, validação de baralho
node tests/account.test.mjs       # login por e-mail, CSRF, limites, migração de progresso
node tests/progress.test.mjs      # cliente de progresso
node tests/email-client.test.mjs  # UI de e-mail contra a API real
node tests/connection.test.mjs    # monitor de conexão
node tests/combat.test.mjs        # simulação de combate + todos os rigs 3D (precisa de `three`)
node tests/cloudflare.test.mjs    # tools/cloudflare.mjs com a API da Cloudflare simulada
node tests/live.test.mjs          # sala ao vivo: entrada pelo token, repasse, limites e reconexão
node node_modules/typescript/bin/tsc --noEmit
```

`tests/api-harness.mjs` carrega as rotas `.ts` em memória com `node:sqlite` e as migrações reais. O `combat.test.mjs` valida a lista de `art` dos rigs (`knight, archer, goblin, giant, bomber, bat`): partes nomeadas, todas as fases da animação, a morte, o orçamento de triângulos e o modo sem WebGL; **atualize essa lista quando os modelos novos entrarem**.

Teste visual: nada substitui abrir o jogo. Verifique menu, uma partida de treino de 1 minuto jogando cartas, e uma sala online com dois navegadores. Para forçar o caminho sem WebGL, abra o Chromium com `--disable-gpu --disable-webgl`.

Online de verdade em casa: `pnpm build && pnpm db:migrate:local && pnpm start` e abra `http://127.0.0.1:8787/game/` em dois navegadores (perfis separados). Para testar a sala ao vivo, desligue o WebRTC num deles (`window.RTCPeerConnection=undefined` antes de carregar): o selo deve mostrar `AO VIVO`. O `pnpm start` serve o `dist/`, então rode `pnpm build` de novo depois de mexer em `public/`.

## 9. Como trabalhar neste projeto

- Faça mudanças pequenas e rode os testes depois de cada uma.
- Antes de renomear ou remover algo, procure todas as referências (`grep -rn`) em `public/game/`, `src/game/`, `app/`, `lib/`, `tests/` e na documentação.
- Se o dono mandar assets do Roblox (FBX/OBJ/GLB, texturas, animações em CFrame), o plano de integração está em `TAREFAS.md`, seção "Modelos e animações".
- Não invente: se algo depender de uma conta, chave ou decisão do dono (hospedagem, domínio, Resend), pergunte.
