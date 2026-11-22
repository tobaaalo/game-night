import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:4173";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
const page = await (await b.newContext({ viewport: { width: 320, height: 640 } })).newPage();
await page.goto(BASE + "/who"); await page.getByText("Friends are here").click();
const i = page.locator(".namelist input"); await i.nth(0).fill("Toba"); await i.nth(1).fill("Mimi");
await page.getByRole("button", { name: "Pick a game" }).click();
let bad = 0;
for (const lvl of ["Easy", "Medium", "Hard", "Extremely hard"]) {
  await page.goto(BASE + "/play/proverbs");
  await page.locator("fieldset.choice").first().locator(".chip,label", { hasText: new RegExp("^" + lvl) }).first().click();
  await page.getByRole("button", { name: /^Start$/ }).click();
  const seen = new Set(); let n = 0;
  for (let k = 0; k < 40; k++) {
    const txt = (await page.locator("main").innerText());
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) { bad++; console.log("overflow", lvl, over); }
    const line = txt.split("\n").find((l) => l.includes("...")) || txt.slice(0, 60);
    if (seen.has(line)) { bad++; console.log("repeat", line); } seen.add(line); n++;
    const rev = page.getByRole("button", { name: /reveal|show/i }).first();
    if (await rev.isVisible().catch(() => false)) await rev.click();
    const nx = page.getByRole("button", { name: /next|got it|skip|done/i }).first();
    if (await nx.isVisible().catch(() => false)) await nx.click(); else break;
  }
  console.log(lvl, "rounds", n);
}
console.log(bad ? "FAIL" : "all passed"); await b.close(); process.exit(bad ? 1 : 0);
