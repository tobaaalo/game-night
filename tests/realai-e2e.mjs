// Real or AI?: pictures and texts load, no repeats, all pairs reachable. Usage: PW_CHROME=... node tests/realai-e2e.mjs <base>
import { chromium } from "playwright";
const BASE = process.argv[2] || "https://game-night-eie.pages.dev";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
const page = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
const fails = [];
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails.push(m); };
// every picture file answers 200
await page.goto(BASE + "/who");
await page.getByText("Just the two of us").click();
const inputs = page.locator(".namelist input");
await inputs.nth(0).fill("Toba"); await inputs.nth(1).fill("Mimi");
await page.getByRole("button", { name: "Pick a game" }).first().click();
async function run(mode, label) {
  await page.goto(BASE + "/play/realai");
  await page.getByText(mode, { exact: true }).first().click();
  await page.locator(".own input").fill(process.env.N || "20");
  await page.getByRole("button", { name: /^Start$/ }).click();
  const seen = [], broken = [];
  for (let i = 0; i < Number(process.env.N || 20); i++) {
    await page.waitForSelector(".qcard", { timeout: 15000 });
    await page.waitForTimeout(700);
    if (mode === "Pictures") {
      const imgs = await page.locator(".pair-side img").evaluateAll((l) => l.map((x) => ({ s: x.getAttribute("src"), w: x.naturalWidth })));
      if (imgs.length !== 2) broken.push("q" + i + " imgs=" + imgs.length);
      imgs.forEach((x) => { if (!x.w) broken.push(x.s); });
      seen.push(imgs.map((x) => x.s).sort().join("|"));
    } else seen.push((await page.locator(".pair").first().innerText()).slice(0, 80));
    await page.locator('button[aria-label="Pick A"]').click();
    await page.getByRole("button", { name: /Next|Finish|See|results/i }).first().click({ timeout: 8000 }).catch(() => {});
  }
  ok(broken.length === 0, `${label}: all images load ${broken.slice(0, 3).join(",")}`);
  ok(new Set(seen).size === seen.length, `${label}: no repeats in 20 (${new Set(seen).size} unique)`);
}
await run("Pictures", "pictures");
await run("Texts", "texts");
await b.close();
console.log(fails.length ? "FAILED " + fails.length : "all passed");
process.exit(fails.length ? 1 : 0);
