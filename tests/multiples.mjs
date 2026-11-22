// Round counts must be a multiple of the number of players, for 2 to 5 players, in every tap/type quiz game.
// Also: no repeated question (and no shared option) inside one Odd One Out game.
// Usage: PW_CHROME=... node tests/multiples.mjs [base]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:4173";
const GAMES = ["faces", "sports", "world", "emoji", "bible", "trivia", "hol", "oddone", "years"];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
const fails = [];
const ok = (c, m) => {
  console.log((c ? "ok   " : "FAIL ") + m);
  if (!c) fails.push(m);
};
for (const n of [2, 3, 4, 5]) {
  const page = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await page.goto(BASE + "/who");
  await page.getByText("Friends are here").click();
  while ((await page.locator(".namelist input").count()) < n)
    await page.getByRole("button", { name: /Add a player/ }).click();
  while ((await page.locator(".namelist input").count()) > n)
    await page
      .getByRole("button", { name: /^Remove / })
      .last()
      .click();
  const inputs = page.locator(".namelist input");
  for (let i = 0; i < n; i++) await inputs.nth(i).fill("Player" + String.fromCharCode(65 + i));
  await page.getByRole("button", { name: "Pick a game" }).click();
  for (const g of GAMES) {
    await page.goto(BASE + "/play/" + g);
    const sets = page.locator(".chips");
    const nChips = await sets.count();
    let bad = [];
    for (let i = 0; i < nChips; i++) {
      const t = (await sets.nth(i).innerText())
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      if (t.every((x) => /^\d+$/.test(x))) bad = t.filter((x) => Number(x) % n);
    }
    ok(bad.length === 0, `${n} players, ${g}: all count chips are multiples${bad.length ? " (bad: " + bad + ")" : ""}`);
    const startBtn = page.getByRole("button", { name: /^Start$/ });
    if (!(await startBtn.isVisible().catch(() => false))) {
      ok(false, `${n} players, ${g}: no Start button`);
      continue;
    }
    await startBtn.click();
    await page.waitForSelector(".qcard", { timeout: 20000 }).catch(() => {});
    const prog = await page
      .locator(".prog")
      .first()
      .innerText()
      .catch(() => "");
    const m = prog.match(/of\s*(\d+)|\/\s*(\d+)/i);
    const total = m ? Number(m[1] || m[2]) : NaN;
    ok(total % n === 0, `${n} players, ${g}: game has ${total} questions`);
  }
  await page.close();
}
// no repeats within one Odd One Out game of 20 (solo: just read prompts and options)
const page = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
for (let round = 0; round < 6; round++) {
  await page.goto(BASE + "/who");
  await page.getByText("Friends are here").click();
  const nm = page.locator(".namelist input");
  await nm.nth(0).fill("Toba");
  await nm.nth(1).fill("Mimi");
  while ((await page.locator(".namelist input").count()) > 2)
    await page
      .getByRole("button", { name: /^Remove / })
      .last()
      .click();
  await page.getByRole("button", { name: "Pick a game" }).click();
  await page.goto(BASE + "/play/oddone");
  const chips = page.locator(".chips").nth(1);
  const opts = (await chips.innerText()).split("\n").map(Number).filter(Boolean);
  const big = opts[opts.length - 1];
  await chips
    .getByRole("button", { name: String(big), exact: true })
    .click()
    .catch(() => {});
  await page.getByRole("button", { name: /^Start$/ }).click();
  const seen = new Set();
  let dup = false,
    shared = false,
    total = 0;
  for (let i = 0; i < 60; i++) {
    const has = await page
      .locator(".options .option")
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (!has) break;
    const texts = await page.locator(".options .option").allInnerTexts();
    const words = texts.map((t) =>
      t
        .replace(/^\d+\s*/, "")
        .trim()
        .toLowerCase(),
    );
    const key = words.slice().sort().join("|");
    if (seen.has(key)) dup = true;
    for (const w of words) if ([...seen].some((x) => x.split("|").includes(w))) shared = true;
    seen.add(key);
    total++;
    await page.locator(".options .option").first().click();
    await page
      .getByRole("button", { name: /Next question|Finish|See the scores|See results/ })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(150);
  }
  ok(!dup && !shared, `odd one out game ${round + 1}: ${total} questions, no repeats or shared options`);
}
await b.close();
console.log(fails.length ? "FAILED: " + fails.length : "all passed");
process.exit(fails.length ? 1 : 0);
