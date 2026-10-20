# Retro Royale — Arena 3D

Play: https://retro-royale-vfx.gabriel-divino1.chatgpt.site

The browser and Android app run the same 3D game and join the same room by its six-character code. Available online modes: **1v1, 2v1, 2v2 and 3v1**. Every participant has their own hand, card cycle and elixir. In asymmetric modes, the solo player's elixir regenerates 2× or 3× faster. All participants must occupy the room and press **Estou pronto** before the match starts.

Characters use genuine 3D meshes with walk, idle, attack preparation, strike, damage and death poses. WebGL renders the scene; a software triangle renderer preserves the 3D geometry when WebGL is unavailable. The portrait HUD follows the supplied mobile layout: blue card panel, four-card hand, next card, segmented elixir, enemy name, timer and round champion abilities. Original character art is retained. Licensed sound clips and particle textures are credited in `public/game/assets/README.md`.

## Champions

All three champions start locked. Starting the first fully ready online battle unlocks **Rei Bombado** for subsequent decks; training and joining an unstarted lobby do not count. The server persists progress and validates every online deck. Each deck and each player's field allow at most **one champion**. The other champions stay locked until additional unlock rules are specified. Abilities require tapping their button, spend that player's elixir and have cooldowns. Choose left, right or both sides in Settings.

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

The Node tests cover actual API routes on SQLite with the generated migrations, all team capacities, readiness, server-side champion locks, command deduplication, combat ownership, independent elixir, coordinate mirroring, delayed attack damage and all 3D rigs. They do not replace visual browser QA or testing on a physical Android device.

The Sites deployment uses the Vinext/Cloudflare integration and D1 migrations in `drizzle/`. Use the managed Sites build/publish workflow for this existing hosted site.

## Android

The Android 8+ portrait APK is a small native WebView client that loads the published game over HTTPS. It requires internet access and the Android System WebView. The game is updated with the website, so its assets and server behavior are shared across web and Android. Build with JDK 17, Gradle 8.11.1 and Android SDK 35:

```sh
cd android
gradle assembleDebug
```

The GitHub Actions workflow builds, verifies the APK signature, records SHA-256 and publishes an installable debug artifact. This is a development APK for direct installation, not a Play Store release.

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
