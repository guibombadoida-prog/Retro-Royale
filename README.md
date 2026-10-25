# Retro Royale — Arena 3D

Website: https://guibombadoida-prog.github.io/Retro-Royale/ (training in the browser, cards, APK download)

Online server: Cloudflare Workers on the owner's own free account (`https://retro-royale.<subdomain>.workers.dev/`), see [Online server](#online-server-cloudflare).

The browser and Android app run the same 3D game and join the same room by its six-character code. Available online modes: **1v1, 2v1, 2v2 and 3v1**. Every participant has their own hand, card cycle and elixir. In asymmetric modes, the solo player's elixir regenerates 2× or 3× faster. All participants must occupy the room and press **Estou pronto** before the match starts.

Characters use genuine 3D meshes with walk, idle, attack preparation, strike, damage and death poses. WebGL renders the scene; a software triangle renderer preserves the 3D geometry when WebGL is unavailable. The portrait HUD follows the supplied mobile layout: blue card panel, four-card hand, next card, segmented elixir, enemy name, timer and round champion abilities. Original character art is retained. Licensed sound clips and particle textures are credited in `public/game/assets/README.md`.

## Cards

The game currently ships with exactly **8 cards**, a fixed deck: Cavaleiro, Arqueiras, Goblins, Gigante, Bólide, Estalo, Bombardeiro and Morcegos. The champions and every other card were removed so each card can be remade (art, 3D model and animation) one by one. The server only accepts these eight ids when creating or joining a room and when saving a deck; there is nothing to unlock.

Visitor progress is tied to the installation/browser profile and can be transferred with its recovery code. Verify an email address to save and recover the same progression, deck and preferences on the website and Android.

## Online synchronization

The host simulates combat at 60 Hz and shares state with every guest. Ordered WebRTC channels carry commands; state updates use an unreliable channel. HTTPS room synchronization provides signaling, heartbeat and a fallback when a direct connection cannot be established. Guests predict their own card cycle/elixir immediately and interpolate authoritative units. Commands are sequenced, bound to the sender and deduplicated. Network latency remains dependent on the connection. Reloading or leaving as host ends the room; disconnected guests can reconnect while the host remains online.

## Web source and checks

From `web/`, install with `pnpm install`. Build with `pnpm build`. Checks:

```sh
node tests/online.test.mjs
node tests/combat.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The Node tests cover actual API routes on SQLite with the generated migrations, all team capacities, readiness, server-side rejection of removed cards, command deduplication, combat ownership, independent elixir, coordinate mirroring, delayed attack damage and all 3D rigs. They do not replace visual browser QA or testing on a physical Android device.

Also `node tests/cloudflare.test.mjs` (deploy helper, mocked Cloudflare API).

## Online server (Cloudflare)

Online rooms, email accounts and cloud saves run on Cloudflare Workers + D1 in the owner's free account. `web/wrangler.jsonc` names the Worker `retro-royale` and binds the D1 database `retro-royale` as `DB`, with the Drizzle migrations in `web/drizzle/`. `.github/workflows/cloudflare.yml` runs the tests, builds and dry-runs the Worker on pull requests. On `main` it creates the database if needed (`node tools/cloudflare.mjs banco`), applies the migrations, deploys, checks `/api/health`, then rebuilds the website and, when the server address changed, the APK.

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
