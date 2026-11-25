// Custom counts: multiple-of-players check, turn counts, ladder over 6. Usage: PW_CHROME=... node tests/count-e2e.mjs [base]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:4173";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
const page = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
const fails = [];
const ok = (c, m) => {
  console.log((c ? "ok   " : "FAIL ") + m);
  if (!c) fails.push(m);
};
const click = (n) => page.getByRole("button", { name: n }).first().click();
await page.goto(BASE + "/who");
await page.getByText("Friends are here").click();
const inputs = page.locator(".namelist input");
await inputs.nth(0).fill("Toba");
await inputs.nth(1).fill("Mimi");
await inputs.nth(2).fill("Dayo");
await click("Pick a game");
const own = () => page.locator(".own input").first();
const start = () => page.getByRole("button", { name: /^Start$/ });
// quiz count
await page.goto(BASE + "/play/bible");
const chips = await page.locator(".chips").nth(1).innerText();
ok(
  chips
    .split("\n")
    .map(Number)
    .every((n) => n % 3 === 0),
  "chips are multiples of 3: " + chips.replace(/\n/g, ","),
);
await own().fill("10");
ok(await page.getByText(/multiple of 3/).isVisible(), "10 with 3 players shows multiple message");
ok(await start().isDisabled(), "Start disabled for 10");
await own().fill("12");
ok(
  !(await page
    .getByText(/multiple of 3/)
    .isVisible()
    .catch(() => false)),
  "12 accepted",
);
ok(await start().isEnabled(), "Start enabled for 12");
await own().fill("0");
ok(await page.getByText(/whole number from/).isVisible(), "0 rejected");
await own().fill("12");
await start().click();
await page.waitForSelector(".qcard", { timeout: 15000 });
ok(/1\s*(of|\/)\s*12/i.test(await page.locator(".prog").first().innerText()), "game has 12 questions");
// turns game
await page.goto(BASE + "/play/charades");
await own().fill("4");
ok(await page.getByText(/multiple of 3/).isVisible(), "charades: 4 rejected");
await own().fill("3");
await start().click();
for (let t = 0; t < 3; t++) {
  await click(/Start 60 seconds/);
  await click(/Got it/);
  await page
    .getByRole("button", { name: /Next player|Finish/ })
    .waitFor({ timeout: 70000 })
    .catch(() => {});
  await page.keyboard.press("Enter");
}
ok(
  await page
    .getByText("That’s all 3 turns")
    .isVisible()
    .catch(() => false),
  "charades ends after 3 turns",
);
// cards
await page.goto(BASE + "/play/wyr");
await own().fill("3");
await start().click();
ok(await page.getByText(/Card 1 of 3/).isVisible(), "deck shows 1 of 3");
// ladder > 6
await page.goto(BASE + "/play/ladder");
await own().fill("10");
ok(
  !(await page
    .locator(".error-text")
    .isVisible()
    .catch(() => false)),
  "ladder accepts 10 (no multiple rule)",
);
await start().click();
await page.waitForSelector(".ladder, .qcard, main", { timeout: 10000 });
ok(/1\s*(of|\/)\s*10/i.test(await page.locator("body").innerText()), "ladder shows 10 ladders");
await b.close();
console.log(fails.length ? "FAILED: " + fails.length : "all passed");
process.exit(fails.length ? 1 : 0);
