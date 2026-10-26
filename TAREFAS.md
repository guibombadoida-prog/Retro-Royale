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

## 1. Hospedagem própria

**Site no GitHub Pages — feito e no ar.** [verificado] publicado pelo workflow "Site no GitHub Pages" e aberto pelo dono no celular em `https://guibombadoida-prog.github.io/Retro-Royale/`. Página inicial, treino contra a IA e download do APK.

**ChatGPT Sites — removido** (decisão do dono). Saíram `web/.openai/`, o plugin `web/build/sites-vite-plugin.*`, os `web/scripts/*` "managed-linux", `web/app/chatgpt-auth.ts`, `web/examples/` e todas as URLs `*.chatgpt.site`.

**Servidor online na Cloudflare (Workers + D1, conta grátis do dono) — pronto no código, falta a conta.**
[verificado] localmente no runtime da Cloudflare (`pnpm build && pnpm db:migrate:local && pnpm start`): sala 1v1 criada, segundo navegador entrou pelo código, os dois "prontos" e batalha sincronizada com WebRTC direto; `wrangler deploy --dry-run` passa (216 KiB gzip). [não verificado] o deploy real, que precisa da conta.

- [ ] **Passos do dono, uma vez só:**
  1. Criar conta grátis em `dash.cloudflare.com` e abrir **Workers e Pages** uma vez para escolher o subdomínio `workers.dev`.
  2. Copiar o **Account ID** (aparece na página Workers e Pages).
  3. Criar um token em *My Profile → API Tokens → Create Token*, modelo **Edit Cloudflare Workers**, e adicionar a permissão **Account → D1 → Edit**.
  4. No GitHub, *Settings → Secrets and variables → Actions*: segredos `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
  5. *Actions → Servidor na Cloudflare → Run workflow*. Depois disso o site ganha o botão "Batalhar online" e o APK é refeito apontando para o servidor, sozinhos.
- [ ] Opcional: login por e-mail (segredos `RESEND_API_KEY` e `LOGIN_EMAIL_FROM`, ver `web/docs/EMAIL_LOGIN.md`).
- [ ] Opcional: domínio próprio. Ligar o domínio ao Worker na Cloudflare e criar a variável do repositório `ONLINE_URL` com o endereço novo (com `/` no fim).
- Limites do plano grátis da Cloudflare (conferir no painel): por volta de 100 mil pedidos por dia no Worker e limites diários de leitura/escrita no D1. Com WebRTC direto, uma partida 1v1 de 3 minutos usa algumas centenas de pedidos.

## 2. Link do APK

**Feito [verificado]:** o `build-android.yml`, na `main`, recria o pré-release `android-latest`; o release apareceu com `retro-royale-android.apk` depois do merge. O botão do jogo e o da página inicial apontam para `https://github.com/guibombadoida-prog/Retro-Royale/releases/download/android-latest/retro-royale-android.apk`. O app abre o servidor da Cloudflare quando ele está no ar, senão o jogo do GitHub Pages; o endereço fica nas notas do release.

## 3. Modelos e animações

**Feito em 26/10/2026 (estilo escolhido pelo dono: cartoon arredondado):** as 6 tropas, as duas torres, a ruína, os projéteis, a arena (grama, rio, pontes, muro e entorno), as animações (andar, respirar, ataque por estilo, dano, tontura, entrada caindo do céu, morte) e os efeitos (Bólide, Estalo, poeira, puff, estrelas, torre caindo) foram refeitos em código, sem arquivos externos. Os ícones das cartas viraram retratos do próprio modelo 3D. [verificado] testes, fotos com WebGL e sem WebGL. [não verificado] desempenho num celular de verdade (o teste usa GPU emulada); se pesar, o modo leve tira sombra e contorno.

Se o dono ainda quiser trazer modelos do Roblox (R6 com textura e animação em CFrame), o plano abaixo continua valendo; o modelo novo só precisa expor as mesmas partes e o `userData.style`. **[não verificado]**:

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

**Feito:** `paintCard` usa `window.cardPortrait3D` (retrato do modelo 3D numa pose de ação) nas tropas; feitiços seguem com `SPELL_ART`. A arte 2D `ART` ficou só como reserva sem WebGL. Se um modelo novo entrar, o retrato muda sozinho.

## 4. Remover código morto dos campeões

Nada no jogo aciona esse código hoje, mas ele ainda pesa e confunde. Remover **com cuidado, uma peça por vez**, rodando os testes a cada passo:

- `engine.js`: bloco "Habilidades de campeão" (`CHAMP_ABILITIES`, `BW_ORDEM`, `championContext`, `championAbilityState`, `activateChampionAbility`, `stepAbility`, `stepInvoca`, `stepBW`, `alvoPerto`/`aglomerado` se só eram usados ali), os `esquadra`/`unico`/`campeaoEmCampo` em `spawn`, os campos de efeito `pingo`, `aereo`, `nuke`, `balefire`, `bwimagine`, `bwcore`, a arte `gangue`/`b*`/`bombking`/`bwchamp`/`dollaltar`/`hologram`/`kamikaze` e as classes `.champ` aplicadas na UI.
- `engine.js`: arte 2D das cartas que saíram (`skeleton`, `ram`, `colossus`, `mage`, `drake`, `cannon`, `coil`, `arrows`, `tornado`) e as ramificações de feitiço `saraivada`/`vortice`.
- `ui.js`: `syncChampionButtons`, `CHAMP_UI`, `abilityIcon`, o seletor de posição do botão de habilidade.
- `online.js`: `abilityOwn` e o uso de `activateChampionAbility`/`championAbilityState`; em `TEAMS`, o `ability`.
- ~~`src/game/arena3d.js` e `models3d.js`: modelos e campos de efeito dos campeões e das cartas removidas~~ (feito na reforma 3D: os dois arquivos foram reescritos só com as 8 cartas).
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

- Raiz do repositório: os dois `.mhtml` já foram apagados (pedido do dono). Falta decidir sobre o `index.html` antigo, que o app não serve.
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
