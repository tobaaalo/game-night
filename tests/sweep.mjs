// Visits every game solo at 320, 375 and 1440: page errors, console errors, sideways scroll, tiny tap targets, Start works.
import { chromium } from "playwright";
const BASE = process.argv[2];
const ids = process.argv.slice(3);
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
let bad = 0;
for (const w of [320, 375, 1440]) {
  const ctx = await b.newContext({ viewport: { width: w, height: w > 800 ? 900 : 700 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errs.push("console " + m.text()));
  p.on("requestfailed", (r) => /\.(jpg|png|svg|json)/.test(r.url()) && errs.push("reqfail " + r.url()));
  for (const id of ids) {
    errs.length = 0;
    await p.goto(`${BASE}/play/${id}`, { waitUntil: "networkidle" }).catch(() => {});
    const step = async (label) => {
      await p.waitForTimeout(400);
      const o = await p.evaluate(() => {
        const d = document.documentElement;
        const small = [...document.querySelectorAll("button:not([disabled]),a[href],input:not([type=hidden])")]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 38 || r.width < 38) && !e.closest(".sr-only") && getComputedStyle(e).visibility !== "hidden" && !e.classList.contains("link"); })
          .map((e) => (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 20));
        return { over: d.scrollWidth - d.clientWidth, small: small.slice(0, 3), blank: document.body.innerText.trim().length < 20 };
      });
      if (o.over > 1) { console.log(`FAIL ${id}@${w} ${label}: sideways scroll +${o.over}`); bad++; }
      if (o.blank) { console.log(`FAIL ${id}@${w} ${label}: blank page`); bad++; }
      if (o.small.length) console.log(`warn ${id}@${w} ${label}: small targets ${o.small.join("|")}`);
      for (const e of errs.splice(0)) { console.log(`FAIL ${id}@${w} ${label}: ${e}`); bad++; }
    };
    await step("setup");
    const start = p.getByRole("button", { name: /^(Start|Deal|Play|Begin|Let's go)/i }).first();
    if (await start.count()) {
      if (await start.isEnabled().catch(() => false)) {
        await start.click().catch(() => {});
        await p.waitForTimeout(1200);
        await step("play");
      }
    }
  }
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} problems` : "sweep clean");
process.exit(bad ? 1 : 0);
