# TAREFAS.md — o que falta fazer

Ordem sugerida: 0 → 1 → 2 → 3 (modelos) → 4 → 5 → 6. Leia `CLAUDE.md` primeiro.

Legenda: **[verificado]** foi testado numa auditoria; **[não verificado]** é plano, não foi executado.

## Estado de partida (auditoria de 25/10/2026)

- [verificado] O treino contra a IA roda sem erro de JavaScript, com WebGL e no fallback por software.
- [verificado] Multiplayer 1v1 ponta a ponta (sala, convidado, "pronto", batalha, WebRTC direto de 13–40 ms, relógios e unidades sincronizados), com a API real em SQLite e dois navegadores.
- [verificado] Passam: `online`, `account` (582 asserções), `progress`, `email-client`, `connection` e a parte de simulação do `combat`.
- [não verificado] A parte de rigs 3D do `combat.test.mjs` (precisa de `three`, que não havia no ambiente da auditoria), os modos 2v1/2v2/3v1 no navegador, Android em aparelho real, WebGL em GPU real, o site publicado e o envio real de e-mail.
- Alteração já feita nesta rodada: o jogo passou a ter só 8 cartas e os campeões foram removidos (cliente, servidor, testes, README).

## 0. Primeira coisa a fazer

1. `cd web && pnpm install && pnpm build:game`
2. Rodar toda a suíte da seção 8 do `CLAUDE.md`, **incluindo** `node tests/combat.test.mjs` completo. Se falhar na parte de rigs, corrigir antes de qualquer outra coisa.
3. `pnpm dev`, abrir `/game/index.html` no celular ou no emulador e jogar uma partida.

## 1. Hospedagem própria (decisão pendente do dono)

Problema: o README e o APK apontam para `https://retro-royale-vfx.gabriel-divino1.chatgpt.site`, que está em outra conta. Se esse deploy sumir, o APK cai na tela offline e o jogo inteiro deixa de existir.

O GitHub Pages **não serve** sozinho: ele só hospeda arquivos estáticos e o jogo precisa de backend (salas, contas, progresso). No GitHub Pages só o treino funcionaria.

Plano recomendado **[não verificado]**: conta própria no Cloudflare (gratuita), projeto ligado ao GitHub, Worker + banco D1, porque o projeto já foi escrito para esse alvo.

- Criar o banco D1 e aplicar as migrações de `web/drizzle/`.
- Criar o `wrangler.jsonc` com o binding do D1 (investigar como o vinext/`@cloudflare/vite-plugin` gera o `dist/server/wrangler.json` que o script `start` já usa).
- Cadastrar os segredos `RESEND_API_KEY` e `LOGIN_EMAIL_FROM` (login por e-mail).
- Criar um workflow do GitHub Actions para build e deploy.
- `web/.openai/hosting.json`, `web/build/sites-vite-plugin.ts` e os `scripts/*` de "managed-linux" são do fluxo do ChatGPT Sites. Descobrir o que pode sair e o que precisa ficar; não apagar antes de o deploy novo funcionar.
- Depois de ter o domínio novo, trocar a URL em: `README.md`, `web/README.md`, `android/app/build.gradle` (`GAME_URL`) e conferir o rodapé de `public/game/index.html`.
- Precisa de decisão e de contas do dono: domínio, conta Cloudflare, conta Resend.

## 2. Link do APK

O botão "Baixar APK Android" aponta para `/downloads/retro-royale.apk`, que **não existe** no repositório. Opções: publicar o APK em GitHub Releases e apontar o link para lá, ou colocar o arquivo em `web/public/downloads/`, ou remover o botão. Há workflow de build em `.github/workflows/build-android.yml`; conferir o que ele publica.

## 3. Modelos e animações (rigs R6 do Roblox) — o trabalho principal

O dono vai remodelar as 8 cartas. Plano de integração **[não verificado]**:

### 3.1 Receber os assets

Formato desejado, por carta: modelo R6 exportado como **FBX ou OBJ** (ou GLB) + texturas em **PNG**, e a animação como tabela de keyframes em código. Só aceitar assets feitos pelo dono (nada do marketplace do Roblox sem licença). Guardar em `web/public/game/assets/models/<art>/` e registrar créditos em `web/public/game/assets/README.md`.

### 3.2 Converter e carregar

1. Converter FBX/OBJ para **GLB** (Blender), com escala em que o boneco R6 (cerca de 5 studs) fique com ~2 unidades de altura no jogo. 1 unidade do Three.js = 1 casa.
2. Manter o GLB pequeno (celular). Textura de no máximo 512×512 por personagem como ponto de partida.
3. Em `web/src/game/`, usar o `GLTFLoader` (`three/addons/loaders/GLTFLoader.js`). O jogo é carregado por `<script>` clássico, então os assets não podem depender de import em tempo de execução fora do bundle: ou carregar por URL com `GLTFLoader.load`, ou embutir como data URI no bundle. Escolher e documentar.
4. O carregamento é assíncrono, mas `unitModel(art, team)` hoje é síncrono. Opções: pré-carregar tudo antes de liberar o botão "Jogar" (recomendado), ou devolver um modelo provisório e trocar quando carregar.

### 3.3 Montar o rig

R6 tem seis peças: `Torso`, `Head`, `Left Arm`, `Right Arm`, `Left Leg`, `Right Leg`. O jogo espera grupos nomeados `leftArm`, `rightArm`, `leftLeg`, `rightLeg` (e `leftWing`/`rightWing` nos voadores). Para o `animation.js` atual funcionar:

- Reparentar cada membro num `Group` com o nome certo, com o **pivô na articulação** (ombro e quadril). No Roblox o pivô fica no `Motor6D` (`C0`/`C1`); a malha exportada geralmente tem o pivô no centro da peça, então é preciso reposicionar.
- Definir `root.userData.height` (usado pela barra de vida).
- Texturas: usar `MeshStandardMaterial` com `map`, ou `MeshBasicMaterial` se quiser fiel ao Roblox. Conferir sombras e iluminação da arena.
- **Fallback sem WebGL** (`software3d.js`): hoje rasteriza malhas com cor por vértice. Texturas podem não aparecer ou quebrar nesse caminho. Testar e, se preciso, usar uma cor média da textura como cor por vértice no modo software.

### 3.4 Animações em código (CFrame)

O dono vai converter as animações do Roblox (por ID) para código. Plano:

1. Combinar um **formato JSON** por animação, por exemplo:

   ```json
   {
     "name": "cavaleiro_walk", "loop": true, "length": 0.8,
     "keyframes": [
       { "t": 0.0, "pose": {
         "Torso":   { "cf": [x,y,z, r00,r01,r02, r10,r11,r12, r20,r21,r22], "ease": "Linear" },
         "Left Arm":{ "cf": [ ... ], "ease": "Cubic" } } }
     ]
   }
   ```

   (os 12 números são o que `CFrame:GetComponents()` devolve). Confirmar com o dono o formato final antes de escrever o tocador.
2. Criar `web/src/game/robloxAnim.js` com um tocador: interpola entre keyframes (aplicando o easing), converte CFrame do Roblox para o espaço do Three.js (cuidado com eixos e handedness; no Roblox a frente do personagem é −Z) e aplica a **rotação relativa à pose de repouso** de cada articulação.
3. Clipes por carta: **andar, parado, preparar ataque, golpe, dano e morte**. O `animation.js` já decide o estado (`e.moving`, `e.attackWindup`, `e.atk`, `e.hurt`, `e.stun`, `e.deploy`): trocar a lógica de seno pelos clipes e mesclar entre eles (crossfade curto). O ponto do golpe (`e.atk`) precisa coincidir com o momento em que o dano é aplicado pelo engine (ver `hit` e o atraso do golpe em `stepUnit`).
4. Cartas especiais: **Gigante, Cavaleiro, Goblins** (`n` unidades) e **Arqueiras** (projétil `arrow`), **Bombardeiro** (`bomb`), **Morcegos** (voam, `ar:true`, sem pernas: ou usar animação de asas em código). **Bólide** e **Estalo** são feitiços e não têm rig: só efeitos.
5. Atualizar o `combat.test.mjs` (lista de `art`) para validar que todo rig novo produz valores finitos em `animateRig` e `animateDeath`.

### 3.5 Arte 2D e ícones

Os ícones das cartas na mão e nos menus ainda usam a **arte procedural 2D** (`ART` em `engine.js`, chaves `knight`, `archer`, `goblin`, `giant`, `fireball`, `zap`, `bomber`, `bat`). Para ícones novos: ou desenhar PNGs (`web/public/game/assets/cards/`) e fazer `paintCard` usar imagem, ou renderizar um retrato do próprio modelo 3D. Decidir com o dono.

## 4. Remover código morto dos campeões

Nada no jogo aciona esse código hoje, mas ele ainda pesa e confunde. Remover **com cuidado, uma peça por vez**, rodando os testes a cada passo:

- `engine.js`: bloco "Habilidades de campeão" (`CHAMP_ABILITIES`, `BW_ORDEM`, `championContext`, `championAbilityState`, `activateChampionAbility`, `stepAbility`, `stepInvoca`, `stepBW`, `alvoPerto`/`aglomerado` se só eram usados ali), os `esquadra`/`unico`/`campeaoEmCampo` em `spawn`, os campos de efeito `pingo`, `aereo`, `nuke`, `balefire`, `bwimagine`, `bwcore`, a arte `gangue`/`b*`/`bombking`/`bwchamp`/`dollaltar`/`hologram`/`kamikaze` e as classes `.champ` aplicadas na UI.
- `engine.js`: arte 2D das cartas que saíram (`skeleton`, `ram`, `colossus`, `mage`, `drake`, `cannon`, `coil`, `arrows`, `tornado`) e as ramificações de feitiço `saraivada`/`vortice`.
- `ui.js`: `syncChampionButtons`, `CHAMP_UI`, `abilityIcon`, o seletor de posição do botão de habilidade.
- `online.js`: `abilityOwn` e o uso de `activateChampionAbility`/`championAbilityState`; em `TEAMS`, o `ability`.
- `src/game/arena3d.js` e `models3d.js`: modelos e campos de efeito dos campeões (`bombking`, `bwchamp`, `dollaltar`, `hologram`, gangue) e os modelos das cartas removidas. Depois: `pnpm build:game`.
- `public/game/index.html` e `arena.css`: `#championPanel`, `.abilityButton`, `.cbadge` e afins.
- `progress.js` (`CHAMPION_IDS`) e o servidor: `CHAMPIONS` em `lib/player-profile.ts`. As colunas `unlocked` e `battles` do banco podem ficar (evitam migração); decidir com o dono.

## 5. Quando houver mais de 8 cartas (reativar o construtor de baralho)

Hoje o baralho é fixo e a interface de troca está escondida. Para reativar:

- `public/game/index.html`: remover o `style="display:none"` de `.menuTabs` e `#deckDetails`, e recolocar a linha de presets se quiser.
- `engine.js`: o clique em `buildPool` hoje só anima; devolver a lógica de adicionar/remover carta. Recriar `PRESETS` se quiser. `FOE_DECKS` precisa de baralhos variados.
- `progress.js`: `sanitize` hoje devolve sempre `DECK_IDS`; voltar a respeitar o baralho do jogador, descartando ids inexistentes.
- Servidor: atualizar `CARDS` (`room/route.ts`) e `CARD_IDS` (`lib/player-profile.ts`).
- Idealmente criar **uma única fonte** da lista de ids (um JSON compartilhado) para o cliente, o servidor e os testes, para acabar com a duplicação em 4 lugares.

## 6. Limpeza e melhorias menores

- Raiz do repositório: dois arquivos `.mhtml` (páginas salvas, sem uso) e um `index.html` antigo que o app não serve. Confirmar com o dono e apagar.
- Criar `.gitignore` na raiz e em `android/` (`build/`, `.gradle/`, `local.properties`, `*.apk`).
- `.github/workflows/tripo-generate.yml` e `tools/tripo-generate.js` geram modelos em `assets/models/` que nada no jogo carrega, e precisam de `TRIPO_API_KEY`. Remover, ou integrar ao plano de modelos.
- Adicionar o Gradle wrapper (`gradle wrapper`) ao `android/` para o build não depender da versão do CI.
- Testar no navegador os modos 2v1, 2v2 e 3v1 (só a API foi testada).
- Texto do README em inglês vs. interface em português: decidir um idioma para a documentação.

## Critério de pronto para cada mudança

1. Os testes da seção 8 do `CLAUDE.md` passam.
2. Menu, treino de 1 minuto e sala online com dois navegadores funcionam, com e sem WebGL.
3. Se `web/src/game/` mudou, o bundle foi reconstruído e commitado.
4. O dono recebeu um resumo em português do que mudou.
