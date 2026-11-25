// Screenshots + overflow checks for Bible Trivia (all levels) and Memory Match flags. Usage: node tests/shots-new.mjs <base> <outDir>
import { chromium } from "playwright";
const BASE = process.argv[2],
  OUT = process.argv[3];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
const sizes = (process.env.SIZES || "320x640,360x740,390x844,820x1180,1280x800")
  .split(",")
  .map((s) => s.split("x").map(Number));
let bad = 0;
for (const [W, H] of sizes) {
  const page = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
  page.on("pageerror", (e) => {
    console.log("FAIL page error", e.message);
    bad++;
  });
  await page.goto(BASE + "/who");
  await page.getByText("Friends are here").click();
  const i = page.locator(".namelist input");
  await i.nth(0).fill("Toba");
  await i.nth(1).fill("Mimi");
  await page.getByRole("button", { name: "Pick a game" }).click();
  for (const lvl of ["Easy", "Medium", "Hard", "Extremely hard"]) {
    await page.goto(BASE + "/play/bible");
    await page
      .getByRole("radio", { name: new RegExp("^" + lvl) })
      .click()
      .catch(() =>
        page
          .locator(".chip", { hasText: new RegExp("^" + lvl) })
          .first()
          .click(),
      );
    await page.getByRole("button", { name: /^Start$/ }).click();
    await page.waitForSelector(".qcard.fixed");
    for (let r = 0; r < 4; r++) {
      await page.waitForTimeout(120);
      const o = await page.evaluate(() => ({
        over: document.documentElement.scrollWidth - innerWidth,
        p: document.querySelector(".qprompt")?.scrollHeight - document.querySelector(".qprompt")?.clientHeight,
        q: document.querySelector(".qprompt .quote") ? 1 : 0,
        fs: getComputedStyle(document.querySelector(".qprompt")).fontSize,
        nb: document.getElementById("next-btn")?.getBoundingClientRect().bottom,
        st: document.querySelector(".stage").getBoundingClientRect().bottom,
      }));
      if (o.over > 0 || o.p > 1) {
        console.log("FAIL", W, lvl, JSON.stringify(o));
        bad++;
      }
      if (r === 1)
        await page.screenshot({ path: `${OUT}/bible-${lvl[0]}${lvl === "Extremely hard" ? "X" : ""}-${W}.png` });
      await page.locator(".options .option:not([aria-disabled=true])").first().click();
      await page.waitForTimeout(120);
      const nb = page.locator("#next-btn");
      if (await nb.isVisible().catch(() => false)) {
        const gap = await page.evaluate(
          () =>
            document.querySelector(".stage").getBoundingClientRect().bottom -
            document.getElementById("next-btn").getBoundingClientRect().bottom,
        );
        if (gap < 0) {
          console.log("FAIL next below card", W, lvl);
          bad++;
        }
        if (r === 2) await page.screenshot({ path: `${OUT}/bible-reveal-${lvl[0]}-${W}.png` });
        await nb.click();
      }
    }
    console.log("ok bible", W, lvl);
  }
  // Memory Match flags
  await page.goto(BASE + "/play/match");
  await page.locator(".chip", { hasText: "Flags" }).first().click();
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.waitForSelector(".memcard");
  const cards = page.locator(".memcard");
  const n = await cards.count();
  for (let k = 0; k < n; k++) {
    await cards
      .nth(k)
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
  await cards
    .nth(0)
    .click({ force: true })
    .catch(() => {});
  const m = await page.evaluate(() => {
    const cs = [...document.querySelectorAll(".memcard")].map((c) => {
      const r = c.getBoundingClientRect();
      const im = c.querySelector("img");
      const ir = im?.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        img: im ? [Math.round(ir.width), Math.round(ir.height)] : null,
      };
    });
    return { over: document.documentElement.scrollWidth - innerWidth, cs };
  });
  const ratios = m.cs.map((c) => (c.w / c.h).toFixed(2));
  console.log(W, "flag cards", n, "ratio set", [...new Set(ratios)].join(","), "overflow", m.over);
  if (m.over > 0 || [...new Set(ratios)].some((x) => Math.abs(+x - 1.33) > 0.03)) {
    console.log("FAIL flags");
    bad++;
  }
  await page.waitForTimeout(1500);
  for (const k of [2, 3])
    await cards
      .nth(k)
      .click({ force: true })
      .catch(() => {});
  await page.screenshot({ path: `${OUT}/flags-${W}.png`, fullPage: true });
  await page.context().close();
}
await b.close();
console.log(bad ? "FAILED " + bad : "all passed");
process.exit(bad ? 1 : 0);
