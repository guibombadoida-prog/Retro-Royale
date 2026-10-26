# Retro Royale — Arena 3D

Website: https://guibombadoida-prog.github.io/Retro-Royale/ (training in the browser, cards, APK download)

Online server: Cloudflare Workers on the owner's own free account (`https://retro-royale.<subdomain>.workers.dev/`), see [Online server](#online-server-cloudflare).

The browser and Android app run the same 3D game and join the same room by its six-character code. Available online modes: **1v1, 2v1, 2v2 and 3v1**. Every participant has their own hand, card cycle and elixir. In asymmetric modes, the solo player's elixir regenerates 2× or 3× faster. All participants must occupy the room and press **Estou pronto** before the match starts.

The 3D look is cartoon (built for phones: each troop is one skinned mesh per material, troop shadows are instanced blobs, the tower shadow map is static, and an automatic quality ladder lowers resolution, shadows and outlines when frames run late): rounded chibi troops with toon shading, dark outlines and strong team colors, stone towers with ballistas, a meadow arena with a river and wooden bridges, all built in code (`web/src/game/`). Each troop has its own attack animation (sword, dagger, punch, bow, throw, bite; the Princess also casts, and trapped troops float in an iridescent bubble) plus walk, idle, hit, stun, drop-in entry and death; card icons are portraits rendered from the same 3D models. WebGL renders the scene; a software triangle renderer (with lighter models) preserves the 3D geometry when WebGL is unavailable. The portrait HUD follows the supplied mobile layout: blue card panel, four-card hand, next card, segmented elixir, enemy name, timer and round champion abilities. Original character art is retained. Licensed sound clips and particle textures are credited in `public/game/assets/README.md`.

## Cards

The game currently ships with **9 cards** and players build an **8-card deck** from them in the menu: Cavaleiro, Arqueiras, Goblins, Gigante, Bólide, Estalo, Bombardeiro, Morcegos and the new **Princesa da Bolha** (5 elixir, 450 HP, ground-only melee with a bubble sword; every 7 s she automatically throws a bubble that traps ground enemies in an area for 2.5 s, then they take pop and fall damage; her ability music plays only while the ability is active). The champions and every older card were removed so each card can be remade (art, 3D model and animation) one by one. The server only accepts these nine ids, eight different ones per deck, when creating or joining a room and when saving a deck; there is nothing to unlock.

Visitor progress is tied to the installation/browser profile and can be transferred with its recovery code. Verify an email address to save and recover the same progression, deck and preferences on the website and Android.

## Online synchronization

The host simulates combat at 60 Hz and shares state with every guest 15 times per second. Three transports are tried, fastest first, and the match badge shows which one is in use: **DIRETO** (WebRTC: ordered channel for commands, unreliable channel for state), **AO VIVO** (a WebSocket to a Cloudflare Durable Object per room that relays host and guest messages, used when mobile networks block WebRTC) and **ONLINE** (HTTPS room synchronization, which also provides signaling and the heartbeat). State packets carry only the fields guests render (about 5 KB); particles are not sent: the host records its effect calls and guests replay them locally. Guests predict their own card cycle/elixir immediately and interpolate authoritative units. Commands are sequenced, bound to the sender and deduplicated. Network latency remains dependent on the connection. Reloading or leaving as host ends the room; disconnected guests can reconnect while the host remains online.

## Web source and checks

From `web/`, install with `pnpm install`. Build with `pnpm build`. Checks:

```sh
node tests/online.test.mjs
node tests/combat.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The Node tests cover actual API routes on SQLite with the generated migrations, all team capacities, readiness, server-side rejection of removed cards, command deduplication, combat ownership, independent elixir, coordinate mirroring, delayed attack damage and all 3D rigs. They do not replace visual browser QA or testing on a physical Android device.

Also `node tests/cloudflare.test.mjs` (deploy helper, mocked Cloudflare API) and `node tests/live.test.mjs` (live room: token check, relay routing, size/rate limits, reconnect).

## Online server (Cloudflare)

Online rooms, email accounts and cloud saves run on Cloudflare Workers + D1 + Durable Objects in the owner's free account. `web/wrangler.jsonc` names the Worker `retro-royale` (entry `web/worker/index.ts`), binds the D1 database `retro-royale` as `DB`, with the Drizzle migrations in `web/drizzle/`, and the live-room Durable Object `RoomLive` as `LIVE` (SQLite class, available on the free plan). `.github/workflows/cloudflare.yml` runs the tests, builds and dry-runs the Worker on pull requests. On `main` it creates the database if needed (`node tools/cloudflare.mjs banco`), applies the migrations, deploys, checks `/api/health`, then rebuilds the website and, when the server address changed, the APK.

One-time setup:

1. Create a free Cloudflare account and open **Workers & Pages** once to choose the `workers.dev` subdomain.
2. Create an API token from the **Edit Cloudflare Workers** template and add **Account → D1 → Edit**.
3. In GitHub **Settings → Secrets and variables → Actions**, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Run the **Servidor na Cloudflare** workflow (it also runs on every push to `main` that touches `web/`).

Optional: the secrets `RESEND_API_KEY` and `LOGIN_EMAIL_FROM` enable email login (`docs/EMAIL_LOGIN.md`), and a repository variable `ONLINE_URL` replaces the workers.dev address with a custom domain.

Local server on the Workers runtime, from `web/`: `pnpm build && pnpm db:migrate:local && pnpm start` (http://127.0.0.1:8787).

## Website (GitHub Pages)

`site/index.html` is the home page. `node tools/build-pages.mjs` assembles `_site/` from it and from `web/public/` (the game), reads the card list straight from `engine.js`, switches `game/config.js` to static mode and fails on any missing or absolute (`/game/...`) path. `.github/workflows/pages.yml` runs that build on pull requests and publishes it from `main`.

GitHub Pages only hosts static files, so the published game runs **training against the AI** with preferences kept in the browser. Online rooms, email accounts and cloud saves need the API: on the static site those controls are hidden. The workflow asks `node tools/cloudflare.mjs endereco` for the Cloudflare server; while it answers, "Batalhar online" opens it, otherwise the site says online play is coming soon. Game paths are relative, so the same files work at `/game/` on the server and at `/Retro-Royale/game/` on Pages.

One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Android

The Android 8+ portrait APK is a small native WebView client that loads the published game over HTTPS: the Cloudflare server when it is up, otherwise the GitHub Pages training build (`RR_GAME_URL` in `android/app/build.gradle`). It requires internet access and the Android System WebView. The game is updated with the website, so its assets and server behavior are shared across web and Android. Build with JDK 17, Gradle 8.11.1 and Android SDK 35:

```sh
cd android
gradle assembleDebug
```

The GitHub Actions workflow builds, verifies the APK signature, records SHA-256 and publishes an installable debug artifact. On `main` it also replaces the `android-latest` pre-release, which is where the website and the in-game "Baixar APK Android" link download from. This is a development APK for direct installation, not a Play Store release.

## Account saves and connection recovery (1.5)

The menu offers a six-digit email verification code, server-backed deck/settings saves and visitor recovery codes. Sending login codes needs the owner's transactional email configuration; see `docs/EMAIL_LOGIN.md`. Without it, the form reports that email login is not yet available and visitor profiles continue to work.

The browser checks both offline events and a no-cache server health endpoint. Android also observes validated internet connectivity, including Wi-Fi without internet and a switch to mobile data. During a connection outage, new online inputs are blocked and the host pauses combat instead of advancing a disconnected simulation. The original room, command acknowledgements and card cycle are kept. Recovery retries for up to 90 seconds, renegotiates direct channels, and preserves the HTTPS fallback. After the grace period, the room closes normally; saved progression is retained. A loaded game is not reloaded on a network change. Only an initial page that failed to load is retried by the native shell.

Additional checks:

```sh
node tests/account.test.mjs
node tests/email-client.test.mjs
node tests/connection.test.mjs
node tests/progress.test.mjs
```

Account tests use real API routes and a mocked email transport to validate expiry, attempt limits, concurrent sends, one-time verification and cross-device restoration. Live delivery requires a configured sender. Physical Wi-Fi switching and visual QA require a real device/browser.
