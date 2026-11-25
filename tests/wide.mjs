import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
for (const [n, w, h] of [
  ["laptop", 1280, 720],
  ["lap2", 1366, 768],
]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  const shot = (name) => page.screenshot({ path: `/tmp/wide/${n}-${name}.png` });
  const info = async (name) => {
    const o = await page.evaluate(() => ({
      h: document.documentElement.scrollWidth - innerWidth,
      v: document.documentElement.scrollHeight - innerHeight,
    }));
    console.log(n, name, "hscroll", o.h, "vscroll", o.v);
  };
  await page.goto(BASE + "/who");
  await page.waitForTimeout(500);
  await shot("who");
  await info("who");
  await page.getByText("Me vs the computer").click();
  await page.locator("#p-me").fill("Toba");
  await shot("names");
  await page.getByRole("button", { name: "Pick a game" }).click();
  await page.waitForTimeout(600);
  await shot("games");
  await info("games");
  for (const [id, mode] of [
    ["world", ""],
    ["realai", ""],
    ["match", ""],
    ["bingo", ""],
    ["trivia", ""],
  ]) {
    await page.goto(BASE + "/play/" + id);
    await page.getByRole("button", { name: /^Start$/ }).click();
    await page.waitForSelector(".qcard,.memgrid,.bingo");
    await page.waitForTimeout(500);
    await shot(id);
    await info(id);
  }
}
await b.close();
