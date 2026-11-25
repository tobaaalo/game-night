import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto(BASE + "/who");
await page.getByText("Me vs the computer").click();
await page.locator("#p-me").fill("Toba");
await page.getByRole("button", { name: "Pick a game" }).click();
const games = [
  ["world", ""],
  ["trivia", ""],
  ["faces", "Pick from four"],
  ["sports", "Pick from four"],
  ["realai", ""],
  ["hol", ""],
  ["oddone", ""],
  ["years", ""],
  ["bible", ""],
];
for (const [id, mode] of games) {
  await page.goto(BASE + "/play/" + id);
  if (mode) await page.getByText(mode, { exact: true }).first().click();
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.waitForSelector(".qcard");
  const res = [];
  for (let r = 0; r < 4; r++) {
    // wait for human turn
    for (let k = 0; k < 30; k++) {
      const t = await page.locator(".qmeta").first().innerText();
      if (!/Computer/.test(t)) break;
      await page.waitForTimeout(400);
      if (await page.locator("#next-btn").count()) await page.locator("#next-btn").click();
    }
    await page.waitForTimeout(300);
    const q = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const opt = page.locator(".options .option:not([hidden])").first();
    if (await opt.isVisible().catch(() => false)) await opt.click();
    else await page.locator(".pair button").first().click();
    await page.waitForTimeout(300);
    const a = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    res.push([q, a]);
    await page.locator("#next-btn").click();
  }
  console.log(id, "overflow px (question,answered):", JSON.stringify(res));
  if (id === "world" || id === "realai") await page.screenshot({ path: `/tmp/fit-${id}.png` });
}
await b.close();
