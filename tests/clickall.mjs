// Clicks every button it can find in every game (solo), through setup and play, watching for crashes.
// Usage: node tests/clickall.mjs BASE [ids...]
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const BASE = process.argv[2];
let ids = process.argv.slice(3);
if (!ids.length) {
  const src = readFileSync(new URL("../src/games/registry.tsx", import.meta.url), "utf8");
  ids = [...new Set([...src.matchAll(/^    id: "([a-z0-9]+)",$/gm)].map((m) => m[1]))];
}
const SKIP = /^(close|leave|quit|exit|home|back|reset|clear all|delete|remove|switch|end the game|install)/i;
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
let bad = 0;
const summary = [];
for (const w of [375, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w > 800 ? 900 : 760 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errs.push("console " + m.text()));
  for (const id of ids) {
    errs.length = 0;
    await p.goto(`${BASE}/play/${id}`, { waitUntil: "networkidle" }).catch(() => {});
    const clicked = new Set();
    let n = 0;
    let idle = 0;
    for (let step = 0; step < 90 && idle < 4; step++) {
      if (!p.url().includes(`/play/${id}`)) {
        await p.goto(`${BASE}/play/${id}`, { waitUntil: "networkidle" }).catch(() => {});
      }
      const sig = (await p.evaluate(() => document.body.innerText.replace(/\d+/g, "#").slice(0, 160))).replace(/\s+/g, " ");
      const labels = await p.evaluate(() =>
        [...document.querySelectorAll("button:not([disabled]),[role=button]:not([aria-disabled=true]),summary")]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; })
          .map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)),
      );
      // fill any empty text inputs first
      for (const inp of await p.locator("input[type=text],input:not([type]),textarea").all()) {
        if (await inp.isVisible().catch(() => false)) {
          const v = await inp.inputValue().catch(() => "x");
          if (!v) await inp.fill("testing").catch(() => {});
        }
      }
      const next = labels.find((l, i) => l && !SKIP.test(l) && !clicked.has(sig + "|" + l + "|" + labels.slice(0, i).filter((x) => x === l).length));
      if (!next) { idle++; await p.waitForTimeout(500); continue; }
      idle = 0;
      const dup = labels.slice(0, labels.indexOf(next)).filter((x) => x === next).length;
      clicked.add(sig + "|" + next + "|" + dup);
      const loc = p.locator("button:not([disabled]),[role=button]:not([aria-disabled=true]),summary").filter({ hasText: next.length > 2 ? next : undefined }).first();
      const target = next.length > 2 ? loc : p.locator(`[aria-label="${next}"]`).first();
      await target.click({ timeout: 2500 }).catch(() => {});
      n++;
      await p.waitForTimeout(150);
      const o = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, blank: document.body.innerText.trim().length < 15 }));
      if (o.over > 1) { console.log(`FAIL ${id}@${w} after "${next}": sideways scroll +${o.over}`); bad++; }
      if (o.blank) { console.log(`FAIL ${id}@${w} after "${next}": blank page`); bad++; }
      for (const e of errs.splice(0)) { console.log(`FAIL ${id}@${w} after "${next}": ${e}`); bad++; }
    }
    summary.push(`${id}@${w}:${n}`);
  }
  await ctx.close();
}
await b.close();
console.log("clicks per game: " + summary.join(" "));
console.log(bad ? `${bad} problems` : "clickall clean");
process.exit(bad ? 1 : 0);
