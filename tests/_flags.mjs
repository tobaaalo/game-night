import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
let bad = 0;
for (const [W, H] of [
  [360, 740],
  [390, 844],
  [820, 1180],
  [1280, 800],
]) {
  const page = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })).newPage();
  await page.goto("http://localhost:4180/who");
  await page.getByText("Friends are here").click();
  const i = page.locator(".namelist input");
  await i.nth(0).fill("Toba");
  await i.nth(1).fill("Mimi");
  await page.getByRole("button", { name: "Pick a game" }).click();
  await page.goto("http://localhost:4180/play/match");
  await page.locator(".chip", { hasText: "Flags" }).first().click();
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.waitForSelector(".memcard");
  const cards = page.locator(".memcard");
  const n = await cards.count();
  await cards.nth(0).click({ force: true });
  await cards.nth(1).click({ force: true });
  await page.waitForTimeout(250);
  // reveal as many as possible at once for the picture: find open flags
  const m = await page.evaluate(() =>
    [...document.querySelectorAll(".memcard.flag.up")]
      .map((c) => {
        const im = c.querySelector("img");
        if (!im) return null;
        const a = c.getBoundingClientRect(),
          r = im.getBoundingClientRect();
        const nat = im.naturalWidth / (im.naturalHeight || 1);
        const box = r.width / r.height;
        return {
          dw: Math.round(c.clientWidth - r.width),
          dh: Math.round(c.clientHeight - r.height),
          ratio: +(c.clientWidth / c.clientHeight).toFixed(2),
          nat: +nat.toFixed(2),
        };
      })
      .filter(Boolean),
  );
  const names = await page.evaluate(
    () =>
      [...document.querySelectorAll(".memcard span.name")]
        .map((s) => s.scrollWidth > s.parentElement.clientWidth + 1)
        .filter(Boolean).length,
  );
  console.log(W, "open flags", m.length, JSON.stringify(m.slice(0, 3)), "name overflow", names);
  if (m.some((x) => Math.abs(x.dw) > 1 || Math.abs(x.dh) > 1 || Math.abs(x.ratio - 1.33) > 0.05)) {
    bad++;
    console.log("FAIL");
  }
  await page.screenshot({
    path: `/tmp/claude-0/-home-claude/6c90ff0d-f928-5f3e-a2f5-8fc39025c5da/scratchpad/s/flagfix-${W}.png`,
  });
  await page.context().close();
}
await b.close();
console.log(bad ? "FAILED" : "all passed");
