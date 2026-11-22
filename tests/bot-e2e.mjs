// Single player vs the computer, every game one by one. Usage: PW_CHROME=... node tests/bot-e2e.mjs [base] [skill 1-3] [only-id]
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.argv[2] || "http://localhost:4173";
const SKILL = process.argv[3] || "Medium";
const ONLY = process.argv[4];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME });
const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource|favicon/.test(m.text()) && errors.push(m.text()));
const fails = [];
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails.push(m); };
const vis = (loc, t = 400) => loc.first().isVisible({ timeout: t }).catch(() => false);
const btn = (n) => page.getByRole("button", { name: n }).first();
const body = () => page.locator("body").innerText();
const sleep = (ms) => page.waitForTimeout(ms);
const words = JSON.parse(fs.readFileSync(new URL("../src/content/botwords.json", import.meta.url)));

// Set up: "Me vs the computer"
await page.goto(BASE + "/who");
await page.getByText("Me vs the computer").click();
await page.locator("#p-me").fill("Toba");
await page.getByText(SKILL, { exact: true }).click();
await btn("Pick a game").click();
await page.waitForURL(/\/games/);
ok(true, `set up Toba vs Computer (${SKILL})`);

const open = async (id) => { await page.goto(BASE + "/play/" + id); await page.waitForSelector("main", { timeout: 10000 }); };
const start = async () => { const s = page.getByRole("button", { name: /^Start$/ }); if (await vis(s, 3000)) await s.click(); };
const score = async () => (await body()).includes("Computer");

async function quiz(id, pre) {
  await open(id);
  if (pre) await pre();
  await start();
  await page.waitForSelector(".qcard", { timeout: 20000 });
  let botTurns = 0, humanTurns = 0;
  for (let r = 0; r < 6; r++) {
    const t = await page.locator(".qmeta").first().innerText();
    const isBot = /Computer/.test(t) || (await vis(page.getByText(/Computer is thinking/), 200));
    if (isBot) {
      botTurns++;
      await page.locator("#next-btn").waitFor({ timeout: 8000 });
      const v = await page.locator(".verdict").innerText();
      ok(/Computer got it wrong|Correct! \+\d+ for Computer/.test(v), `${id}: bot answered (${v.slice(0, 40)})`);
    } else {
      humanTurns++;
      const opt = page.locator(".options .option:not([hidden])").first();
      if (await vis(opt, 500)) await opt.click();
      else { // pair media: click first picture
        await page.locator(".pair button, .pairgrid button, .media button").first().click().catch(() => {});
      }
      await page.locator("#next-btn").waitFor({ timeout: 8000 });
    }
    await page.locator("#next-btn").click();
    if (await vis(page.getByText(/Play again/), 200)) break;
  }
  ok(botTurns >= 1 && humanTurns >= 1, `${id}: bot took ${botTurns} turns, you took ${humanTurns}`);
  ok(await score(), `${id}: Computer is on the scoreboard`);
}

async function reveal(id, pre) {
  await open(id);
  if (pre) await pre();
  await start();
  await page.waitForSelector(".qcard", { timeout: 20000 });
  let saw = 0;
  for (let r = 0; r < 4; r++) {
    await btn(/Reveal the answer/).click();
    const w = page.locator(".whogot");
    await w.waitFor({ timeout: 5000 });
    const t = await w.innerText();
    if (/Computer says it knew|Computer didn't get/.test(t)) saw++;
    const giver = w.locator(".giver").first();
    if (r % 2 === 0 && (await vis(giver, 200))) await giver.click();
    else await w.getByRole("button", { name: /Nobody got it/ }).click();
    if (await vis(page.getByText(/Play again/), 300)) break;
  }
  ok(saw >= 3, `${id}: computer's guess line shown (${saw}/4 rounds)`);
  ok(await score(), `${id}: Computer on scoreboard`);
}

async function timed(id, pre) {
  await open(id);
  if (pre) await pre();
  await start();
  await page.waitForSelector(".qcard", { timeout: 15000 });
  let bot = 0, human = 0;
  for (let t = 0; t < 8 && (bot < 2 || human < 1); t++) {
    if (await vis(btn(/Let the computer go/), 300)) {
      bot++;
      await btn(/Let the computer go/).click();
      ok(/Computer scored \d+ points?/.test(await body()), `${id}: computer turn result shown`);
    } else {
      human++;
      await btn(/^Start \d+ seconds/).click();
      const hit = page.getByRole("button", { name: /Got it|Did it/ }).first();
      await hit.click();
      if (!(await vis(btn(/Next player|Finish/), 300))) await btn(/Next player|Finish/).waitFor({ timeout: 70000 }).catch(() => {});
    }
    await btn(/Next player|Finish/).click().catch(() => {});
  }
  ok(bot >= 1 && human >= 1, `${id}: computer turns ${bot}, your turns ${human}`);
}

const mode = (label) => async () => { await page.getByText(label, { exact: true }).first().click(); };

const jobs = {
  trivia: () => quiz("trivia"),
  bible: () => quiz("bible"),
  hol: () => quiz("hol"),
  oddone: () => quiz("oddone"),
  years: () => quiz("years"),
  world: () => quiz("world"),
  realai: () => quiz("realai"),
  faces: async () => { await quiz("faces", mode("Pick from four")); await reveal("faces", mode("Shout it out")); },
  sports: async () => { await quiz("sports", mode("Pick from four")); await reveal("sports", mode("Shout it out")); },
  emoji: () => reveal("emoji"),
  proverbs: () => reveal("proverbs"),
  clues: async () => {
    await open("clues"); await start(); await page.waitForSelector(".qcard");
    let saw = 0;
    for (let r = 0; r < 3; r++) {
      await btn(/Someone guessed it/).click();
      const t = await page.locator(".whogot").innerText();
      if (/Computer says it knew|Computer didn't get/.test(t)) saw++;
      await page.locator(".whogot .giver").first().click().catch(async () => btn(/Nobody got it/).click());
      if (await vis(page.getByText(/Play again/), 300)) break;
    }
    ok(saw === 3, `clues: computer's guess line shown (${saw}/3)`);
    ok(await score(), "clues: Computer on scoreboard");
  },
  charades: () => timed("charades"),
  taboo: () => timed("taboo"),
  name5: () => timed("name5"),
  bingo: async () => {
    await open("bingo"); await start(); await page.waitForSelector(".bingo");
    let bot = 0, human = 0;
    for (let t = 0; t < 8; t++) {
      if (await vis(page.getByText(/Play again/), 200)) break;
      if (await vis(btn(/Let the computer go/), 300)) { bot++; await btn(/Let the computer go/).click(); }
      else { human++; await page.locator(".bingo-cell:not(.taken)").first().click(); await btn(/^Guessed$/).click(); }
    }
    ok(bot >= 1 && human >= 1, `bingo: computer ${bot} turns, you ${human}`);
    ok(await score(), "bingo: Computer on scoreboard");
  },
  match: async () => {
    await open("match"); await start(); await page.waitForSelector(".memgrid");
    let botSaw = false;
    for (let t = 0; t < 14; t++) {
      if (await vis(page.getByText(/All pairs found/), 100)) break;
      const turnTxt = await page.locator(".turn").first().innerText();
      if (/Computer/.test(turnTxt)) {
        botSaw = true;
        const before = (turnTxt.match(/(\d+) moves?/) || [])[1];
        await page.waitForFunction((bm) => { const t = document.querySelector(".turn")?.textContent || ""; const m = (t.match(/(\d+) moves?/) || [])[1]; return !/Computer/.test(t) || m !== bm; }, before, { timeout: 15000 });
        await sleep(1200);
      } else {
        const c = page.locator(".memcard:not(.up):not(.won)");
        await c.nth(0).click(); await c.nth(0).click().catch(() => {});
        await sleep(1100);
      }
    }
    ok(botSaw, "match: computer took a turn and flipped cards");
    ok(await score(), "match: Computer on scoreboard");
  },
  wordchain: async () => {
    await open("wordchain"); await start(); await page.waitForSelector(".bigtext");
    let plays = 0;
    for (let t = 0; t < 4; t++) {
      for (let k = 0; k < 40; k++) {
        const think = await vis(page.getByText(/Computer is thinking/), 100);
        if (!think && await vis(page.locator("input[aria-label='Your word']"), 100)) break;
        if (await vis(page.getByText(/wins!/), 100)) break;
        await sleep(300);
      }
      if (await vis(page.getByText(/wins!/), 100)) break;
      const last = (await page.locator(".bigtext").innerText()).trim().toLowerCase();
      const used = (await page.locator(".hint").allInnerTexts()).join(" ");
      const w = words.find((x) => x[0] === last.slice(-1) && !used.includes(x) && x !== last);
      await page.locator("input[aria-label='Your word']").fill(w);
      await btn(/Lock it in/).click();
      plays++;
      await sleep(400);
    }
    ok(plays >= 3, `wordchain: you and the computer traded words (${plays} of yours accepted)`);
    const hist = await page.locator(".bigtext").innerText();
    ok(hist.length >= 5, `wordchain: bot's word shown ("${hist}")`);
  },
  ladder: async () => {
    await open("ladder"); await start(); await page.waitForSelector(".ladder-now");
    let bot = 0, human = 0;
    for (let t = 0; t < 4; t++) {
      if (await vis(page.getByText(/ladders done/), 200)) break;
      if (await vis(btn(/Let the computer try/), 300)) {
        bot++; await btn(/Let the computer try/).click();
        ok(/solved it in|got stuck/.test(await body()), "ladder: computer result shown");
      } else { human++; await btn(/Give up/).click(); }
      await btn(/Next ladder|See results/).click();
    }
    ok(bot >= 1 && human >= 1, `ladder: computer ${bot}, you ${human}`);
  },
  draw: async () => {
    await open("draw"); await start();
    await btn(/Show me the word/).click(); await btn(/Start drawing/).click();
    const cv = page.locator("canvas.drawpad");
    const bb = await cv.boundingBox();
    await page.mouse.move(bb.x + 50, bb.y + 50); await page.mouse.down(); await page.mouse.move(bb.x + 150, bb.y + 120); await page.mouse.up();
    await btn(/^Guessed$/).click();
    const t = await page.locator(".whogot").innerText();
    ok(/Computer says it knew|Computer didn't get/.test(t), "draw: computer guess line shown");
    ok(!/Toba draws.*Computer draws/.test(await body()), "draw: computer never draws");
  },
  npat: async () => {
    await open("npat");
    await btn(/Start 60 seconds/).click(); await btn(/Pens down early/).click();
    ok(/Computer says it knew|Computer didn't get/.test(await page.locator(".whogot").innerText()), "npat: computer line shown");
  },
};
for (const id of ["nhie", "wyr"]) jobs[id] = async () => {
  await open(id); await start();
  await page.waitForSelector(".deckcard", { timeout: 10000 });
  await btn(/Next card/).click();
  ok(!(await body()).match(/Computer.*turn/), `${id}: runs as a card deck, computer sits out`);
};
for (const id of ["knowme", "likely", "twotruths", "hotseat", "couple", "bucket"]) jobs[id] = async () => {
  await open(id);
  ok(await vis(page.getByText(/needs other people/), 3000), `${id}: says it needs other people`);
};

const ids = ONLY ? [ONLY] : Object.keys(jobs);
for (const id of ids) {
  console.log("--- " + id);
  const before = errors.length;
  try { await jobs[id](); } catch (e) { ok(false, `${id}: threw ${String(e).split("\n")[0]}`); await page.screenshot({ path: `/tmp/bot-fail-${id}.png` }); }
  ok(errors.length === before, `${id}: no console errors${errors.length > before ? " " + errors.slice(before).join("|").slice(0, 200) : ""}`);
}
await b.close();
console.log(fails.length ? "FAILED: " + fails.length + "\n" + fails.join("\n") : "all passed");
process.exit(fails.length ? 1 : 0);
