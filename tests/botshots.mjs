import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
for (const [w, h] of [
  [320, 640],
  [390, 800],
  [1100, 800],
]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  await page.goto(BASE + "/who");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/botshots/who-${w}.png` });
  await page.getByText("Me vs the computer").click();
  await page.locator("#p-me").fill("Toba");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/botshots/names-${w}.png` });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log(w, "hscroll", ov);
  await page.getByRole("button", { name: "Pick a game" }).click();
  await page.waitForTimeout(500);
  await page.goto(BASE + "/play/trivia");
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.waitForSelector(".qcard");
  for (let i = 0; i < 3; i++) {
    if (!(await page.locator(".option").first().isEnabled())) break;
    const t = await page.locator(".qmeta").innerText();
    if (/Computer/.test(t)) break;
    await page.locator(".option").first().click();
    await page.locator("#next-btn").click();
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/botshots/quiz-bot-${w}.png` });
  await page.goto(BASE + "/play/match");
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.waitForSelector(".memgrid");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/botshots/match-${w}.png` });
  await page.goto(BASE + "/play/knowme");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/botshots/needs-${w}.png` });
}
await b.close();
