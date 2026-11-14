# Game Night

Party games for couples and friends. Pass one phone round, or play on everyone's phones with a 4-letter room code. It installs on a phone home screen and works offline.

- **Look:** 1970s TV game show. Fonts are Bungee and Chakra Petch.
- **Stack:** Vite + React + TypeScript. One Cloudflare Worker serves the site and runs the rooms (a Durable Object per room).
- **Spec:** see [SPEC.md](./SPEC.md).

## Run it

```bash
npm install
npm run dev          # app only (no rooms) on http://localhost:5173
npm run cf:dev       # full app incl. rooms on http://127.0.0.1:8787
```

## Checks

```bash
npm run typecheck
npm run lint
npm run build
node tests/shots.mjs http://127.0.0.1:8787   # screenshots every screen at 375/768/1440 into tests/screens
```

## Deploy (Cloudflare, automatic from GitHub)

One-time setup in the Cloudflare dashboard:

1. **Workers & Pages → Create → Import a repository → tobaaalo/game-night.**
2. Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
3. Save. Every push to `main` then rebuilds and goes live in about a minute.

The room server (Durable Object, SQLite-backed) is included in `wrangler.toml` and works on the free plan.

## Adding content

- Questions live in `src/content/*.json`. Each quiz item is `[level, question, [right, wrong, wrong, wrong]]`.
- Famous Faces: add a JPEG to `public/faces/<id>.jpg` and an entry to `src/content/faces.json`, with its Wikimedia Commons file name in `src` for the credits page.
- Real or AI: add `<id>-real.jpg` and `<id>-ai.jpg` to `public/realai/` and an entry to `src/content/realai.json`.
