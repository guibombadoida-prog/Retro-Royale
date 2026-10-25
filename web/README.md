# Retro Royale — web

The game client (`public/game/`), the 3D source (`src/game/`) and the server (`app/api/`, `lib/`, `db/`, `drizzle/`) for Cloudflare Workers + D1. See the repository [README](../README.md) for the website, the Cloudflare setup and Android, and [CLAUDE.md](../CLAUDE.md) for the architecture.

```sh
pnpm install
pnpm dev                 # Vite dev server on port 5173
pnpm build               # 3D bundle + Worker in dist/
pnpm db:migrate:local    # apply drizzle/ to the local D1 database
pnpm start               # run the built Worker locally (http://127.0.0.1:8787)
```

Tests (run from this folder):

```sh
node tests/online.test.mjs
node tests/account.test.mjs
node tests/progress.test.mjs
node tests/email-client.test.mjs
node tests/connection.test.mjs
node tests/combat.test.mjs
node tests/cloudflare.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Email login needs the `RESEND_API_KEY` and `LOGIN_EMAIL_FROM` secrets; see `docs/EMAIL_LOGIN.md`.
