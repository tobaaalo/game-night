// Looks for anything that runs off the side of the screen, in every game and every mode/level/category.
// Usage: PW_CHROME=... node tests/overflow.mjs [base] [width] [only-id]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:4173";
const W = +(process.argv[3] || 320);
const ONLY = process.argv[4];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
const page = await (await b.newContext({ viewport: { width: W, height: 800 } })).newPage();
await page.goto(BASE + "/who");
await page.getByText("Friends are here").click();
const i = page.locator(".namelist input");
await i.nth(0).fill("Toba");
await i.nth(1).fill("Mimi");
await i.nth(2).fill("Dayo");
await page.getByRole("button", { name: "Pick a game" }).click();
const ids = [
  "world",
  "faces",
  "sports",
  "realai",
  "emoji",
  "memory",
  "trivia",
  "bible",
  "hol",
  "oddone",
  "years",
  "clues",
  "proverbs",
  "charades",
  "taboo",
  "name5",
  "bingo",
  "match",
  "wordchain",
  "ladder",
  "draw",
  "npat",
  "nhie",
  "wyr",
  "knowme",
  "likely",
  "twotruths",
  "hotseat",
].filter((x) => !ONLY || x === ONLY);
const bad = () =>
  page.evaluate(() => {
    const w = innerWidth,
      out = [];
    if (document.documentElement.scrollWidth > w + 1)
      out.push("PAGE scrolls sideways " + document.documentElement.scrollWidth);
    for (const el of document.querySelectorAll("main *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.visibility === "hidden" || el.closest("[hidden],.sr-only,[aria-hidden=true]"))
        continue;
      if (el.closest(".chips,.namelist")) continue;
      let scroller = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") {
          scroller = true;
          break;
        }
      }
      if (scroller) continue;
      if (r.right > w + 1 || r.left < -1)
        out.push(
          `${el.tagName}.${String(el.className).slice(0, 30)} "${(el.textContent || "").trim().slice(0, 30)}" ${Math.round(r.left)}..${Math.round(r.right)}`,
        );
      else if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== "visible")
        out.push(
          `CLIPPED ${el.tagName}.${String(el.className).slice(0, 30)} "${(el.textContent || "").trim().slice(0, 30)}"`,
        );
    }
    return [...new Set(out)].slice(0, 4);
  });
const vis = (l) =>
  l
    .first()
    .isVisible({ timeout: 150 })
    .catch(() => false);
const problems = [];
let shot = 0;
async function drive(id, label, steps = 40) {
  let seen = 0;
  for (let k = 0; k < steps; k++) {
    const b1 = await bad();
    if (b1.length) {
      problems.push(`${id} [${label}] step ${k}: ${b1.join(" | ")}`);
      if (shot++ < 12) await page.screenshot({ path: `/tmp/ovf-${W}-${id}-${shot}.png` });
    }
    seen++;
    const click = async (loc) => {
      if (await vis(loc)) {
        await loc
          .first()
          .click({ timeout: 1500 })
          .catch(() => {});
        return true;
      }
      return false;
    };
    const bt = (n) => page.getByRole("button", { name: n });
    if (await click(bt(/^Start$/))) continue;
    if (await click(bt(/^Start \d+ seconds/))) continue;
    if (await click(page.locator(".options .option:not([hidden]):not([aria-disabled=true])"))) continue;
    if (await click(page.locator(".pair button:not([aria-disabled=true])"))) continue;
    if (await click(bt(/Show me the word/))) continue;
    if (await click(bt(/Start drawing/))) continue;
    if (await click(bt(/Reveal the answer|Pens down early|^Guessed$|Got it|Did it|Someone guessed/))) continue;
    if (await click(page.locator(".whogot .giver"))) continue;
    if (await click(bt(/Nobody got it/))) continue;
    if (
      await click(
        bt(
          /Next card|Next question|Next ladder|Next player|Next clue|No guess yet|Next$|Next round|Give up|See results|Higher|Lock it in/,
        ),
      )
    )
      continue;
    if (await click(bt(/See the scores|Finish|Play again/))) continue;
    if (await click(page.locator(".memcard:not(.up):not(.won)"))) continue;
    if (await click(page.locator(".bingo-cell:not(.taken)"))) continue;
    break;
  }
  return seen;
}
for (const id of ids) {
  await page.goto(BASE + "/play/" + id);
  await page.waitForSelector("main");
  // every option of every setup question, one at a time
  const labels = await page.locator("fieldset.choice .chip").evaluateAll((els) => els.map((e) => e.textContent.trim()));
  const uniq = ["default", ...new Set(labels)].slice(0, 40);
  for (const l of uniq) {
    await page.goto(BASE + "/play/" + id);
    await page.waitForSelector("main");
    if (l !== "default") {
      const chip = page
        .locator("fieldset.choice .chip", {
          hasText: new RegExp("^\\s*" + l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$"),
        })
        .first();
      await chip.click({ timeout: 1500 }).catch(() => {});
    }
    const n = await drive(
      id,
      l,
      /nhie|wyr|hotseat|knowme|likely|twotruths|trivia|bible|hol|oddone|years|world|faces|sports|realai|emoji|proverbs/.test(
        id,
      )
        ? 30
        : 14,
    );
  }
  console.log(id.padEnd(10), "checked", uniq.length, "setups");
}
await b.close();
console.log(
  problems.length
    ? "PROBLEMS " + problems.length + "\n" + problems.slice(0, 40).join("\n")
    : `no overflow found at ${W}px`,
);
process.exit(problems.length ? 1 : 0);
