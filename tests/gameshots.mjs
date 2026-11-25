// Setup and in-play screenshot of every game at 375px, joined into contact sheets.
// Usage: node tests/gameshots.mjs BASE OUTDIR
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const BASE = process.argv[2];
const OUT = process.argv[3] ?? "/tmp/gshots";
mkdirSync(OUT, { recursive: true });
const src = readFileSync(new URL("../src/games/registry.tsx", import.meta.url), "utf8");
const ids = [...new Set([...src.matchAll(/^    id: "([a-z0-9]+)",$/gm)].map((m) => m[1]))];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({
  viewport: { width: 375, height: 700 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
const p = await ctx.newPage();
for (const id of ids) {
  await p.goto(`${BASE}/play/${id}`, { waitUntil: "networkidle" }).catch(() => {});
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${id}-1setup.png` });
  const start = p.getByRole("button", { name: /^(Start|Deal|Play|Begin|Let's go)/i }).first();
  if (await start.count()) {
    await start.click().catch(() => {});
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/${id}-2play.png` });
  }
}
await b.close();
console.log(ids.length + " games");
