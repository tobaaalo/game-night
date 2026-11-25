// The question card must keep one size for every question, and Next must sit inside the first screen.
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:4173";
const [W, H] = (process.argv[3] || "390x844").split("x").map(Number);
const ONLY = process.argv[4];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
const page = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
await page.goto(BASE + "/who");
await page.getByText("Friends are here").click();
const i = page.locator(".namelist input");
await i.nth(0).fill("Toba");
await i.nth(1).fill("Mimi");
await i.nth(2).fill("Dayo");
await page.getByRole("button", { name: "Pick a game" }).click();
const games = [
  ["world", null],
  ["trivia", null],
  ["bible", null],
  ["hol", null],
  ["oddone", null],
  ["years", null],
  ["realai", null],
  ["faces", "Pick from four"],
  ["sports", "Pick from four"],
].filter(([id]) => !ONLY || id === ONLY);
const fails = [];
for (const [id, mode] of games) {
  await page.goto(BASE + "/play/" + id);
  if (mode) await page.getByText(mode, { exact: true }).first().click();
  // all world modes
  const modes =
    id === "world" ? await page.locator("fieldset.choice").first().locator(".chip").allInnerTexts() : [null];
  for (const m of modes) {
    if (id === "world") {
      await page.goto(BASE + "/play/world");
      await page.locator("fieldset.choice").first().locator(".chip", { hasText: m }).click();
    }
    await page.getByRole("button", { name: /^Start$/ }).click();
    await page.waitForSelector(".qcard.fixed");
    const heights = new Set();
    const gaps = new Set();
    let nextBottomMax = 0,
      wOver = 0;
    for (let r = 0; r < 10; r++) {
      const opt = page.locator(".options .option:not([hidden]):not([aria-disabled=true])").first();
      await page.waitForTimeout(150);
      heights.add(await page.locator(".stage").evaluate((e) => Math.round(e.getBoundingClientRect().height)));
      if (await opt.isVisible().catch(() => false)) await opt.click();
      else
        await page
          .locator(".pair button")
          .first()
          .click()
          .catch(() => {});
      await page.waitForTimeout(150);
      const nb = page.locator("#next-btn");
      if (await nb.isVisible().catch(() => false)) {
        const o = await page.evaluate(() => ({
          nb: document.getElementById("next-btn").getBoundingClientRect().bottom,
          st: document.querySelector(".stage").getBoundingClientRect().bottom,
          over: document.documentElement.scrollWidth - innerWidth,
        }));
        nextBottomMax = Math.max(nextBottomMax, o.nb);
        gaps.add(Math.round(o.st - o.nb));
        wOver = Math.max(wOver, o.over);
        heights.add(await page.locator(".stage").evaluate((e) => Math.round(e.getBoundingClientRect().height)));
        await nb.click();
      } else break;
    }
    const okH = heights.size === 1 && gaps.size === 1,
      okN = true,
      okW = wOver <= 0;
    console.log(
      `${okH && okN && okW ? "ok  " : "FAIL"} ${id}${m ? " / " + m : ""}: card heights ${[...heights].join(",")}, gap from Next to card bottom ${[...gaps].join(",")}px, sideways ${wOver}`,
    );
    if (!(okH && okN && okW)) {
      fails.push(id + " " + m);
      await page.screenshot({ path: `/tmp/fixed-${id}.png` });
    }
  }
}
await b.close();
process.exit(fails.length ? 1 : 0);
