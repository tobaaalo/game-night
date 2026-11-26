// Mafia, Boggle, Tap Race, Trivia Buzzer, the greyed-out rule and a screenshot of each on phone, tablet and desktop.
// Usage: PW_CHROME=... node tests/newgames-e2e.mjs <base> [only]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.argv[2] || "http://localhost:4180";
const ONLY = process.argv[3];
mkdirSync("/tmp/s", { recursive: true });
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const fails = [];
const ok = (c, m) => {
  console.log((c ? "ok   " : "FAIL ") + m);
  if (!c) fails.push(m);
};
const errors = [];
const VIEWS = [
  [320, 640],
  [390, 780],
  [820, 1180],
  [1280, 800],
];
async function open(w, h, names, group = "Friends are here") {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" })).newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on(
    "console",
    (m) => m.type() === "error" && !/Failed to load resource|favicon/.test(m.text()) && errors.push(m.text()),
  );
  await p.goto(BASE + "/who");
  await p.getByText(group).click();
  const inp = p.locator(".namelist input");
  for (let i = 0; i < names.length; i++) {
    if ((await inp.count()) <= i) await p.getByRole("button", { name: "Add a player" }).click();
    await inp.nth(i).fill(names[i]);
  }
  await p.getByRole("button", { name: "Pick a game" }).click();
  return p;
}
const side = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const shot = (p, name) => p.screenshot({ path: `/tmp/s/${name}.png` });
const want = (g) => !ONLY || ONLY === g;
const NAMES = ["Tee", "Mimi", "Dayo", "Femi"];

// ------------------------------------------------------------------ greyed out
if (want("grey")) {
  const p2 = await open(390, 780, ["Tee", "Mimi"], "Just the two of us");
  await p2.waitForSelector(".tile, .ticket");
  const tile = (p, n) => p.locator(".tile, .ticket", { hasText: n }).first();
  const dis = async (p, n) => (await tile(p, n).getAttribute("aria-disabled")) === "true";
  ok(await dis(p2, "Mafia"), "2 players: Mafia is greyed out");
  ok(!(await dis(p2, "Tic-Tac-Toe")), "2 players: Tic-Tac-Toe is available");
  ok(/needs 4 or more/i.test(await tile(p2, "Mafia").innerText()), "greyed Mafia says why");
  await tile(p2, "Mafia").click({ force: true });
  ok(p2.url().includes("/games"), "tapping a greyed game does not open it");
  const p3 = await open(390, 780, ["Tee", "Mimi", "Dayo"]);
  await p3.waitForSelector(".tile, .ticket");
  ok(await dis(p3, "Tic-Tac-Toe"), "3 players: Tic-Tac-Toe is greyed out");
  ok(await dis(p3, "Connect Four"), "3 players: Connect Four is greyed out");
  ok(!(await dis(p3, "Boggle")), "3 players: Boggle is available");
  ok(/exactly 2/i.test(await tile(p3, "Tic-Tac-Toe").innerText()), "greyed Tic-Tac-Toe says exactly 2 players");
  const p5 = await open(390, 780, ["A", "B", "C", "D", "E"]);
  await p5.waitForSelector(".tile, .ticket");
  ok(await dis(p5, "Tap Race"), "5 players: Tap Race is greyed out");
  ok(!(await dis(p5, "Mafia")), "5 players: Mafia is available");
  await shot(p3, "grey-3-players");
}

// ------------------------------------------------------------------ Mafia
async function mafiaRun(p, label) {
  // Drive the whole game: take the first sensible button each time until the result.
  const labels = [
    "Show my role",
    "Hide it and pass on",
    "Everyone has seen their role",
    "Start the night",
    /^I am /,
    "Talk it over and vote",
    "Night falls again",
    "See who won",
  ];
  let shots = 0;
  for (let i = 0; i < 400; i++) {
    if (
      await p
        .getByRole("button", { name: "Another game" })
        .isVisible()
        .catch(() => false)
    )
      return true;
    let done = false;
    for (const l of labels) {
      const bt = p.getByRole("button", { name: l }).first();
      if (await bt.isVisible().catch(() => false)) {
        await bt.click({ timeout: 1500 }).catch(() => {});
        done = true;
        break;
      }
    }
    if (!done) {
      // an action list: night targets, or the day vote
      const g = p.locator(".givers button");
      if (await g.count()) {
        if (shots++ === 2) await shot(p, `mafia-${label}-act`);
        await g
          .nth(Math.floor(Math.random() * (await g.count())))
          .click({ timeout: 1500 })
          .catch(() => {});
      }
    }
    await p.waitForTimeout(40);
  }
  return false;
}
if (want("mafia"))
  for (const [w, h] of VIEWS) {
    const label = `${w}`;
    const p = await open(w, h, NAMES);
    await p.goto(BASE + "/play/mafia");
    ok(await p.locator(".howline").isVisible(), `Mafia ${w}px: how to play shows on the set-up page`);
    await shot(p, `mafia-${label}-setup`);
    await p.getByRole("button", { name: /^Start$/ }).click();
    await p.getByRole("button", { name: "Show my role" }).waitFor();
    await shot(p, `mafia-${label}-deal`);
    await p.getByRole("button", { name: "Show my role" }).click();
    await shot(p, `mafia-${label}-role`);
    ok((await side(p)) <= 0, `Mafia ${w}px: no sideways scroll`);
    const done = await mafiaRun(p, label);
    ok(done, `Mafia ${w}px: a whole game finishes`);
    ok(/win/i.test(await p.locator(".turn").first().innerText()), `Mafia ${w}px: says who won`);
    ok((await p.locator(".mafia-roles li").count()) === 4, `Mafia ${w}px: lists everyone's role`);
    await shot(p, `mafia-${label}-over`);
    ok((await side(p)) <= 0, `Mafia ${w}px: no sideways scroll at the end`);
    await p.context().close();
  }

// ------------------------------------------------------------------ Boggle
if (want("boggle"))
  for (const [w, h] of VIEWS) {
    const p = await open(w, h, ["Tee", "Mimi"], "Just the two of us");
    await p.goto(BASE + "/play/boggle");
    ok(await p.locator(".howline").isVisible(), `Boggle ${w}px: how to play shows on the set-up page`);
    await p.locator(".chip", { hasText: "1 min" }).click();
    await p.getByRole("button", { name: /^Start$/ }).click();
    await p.getByRole("button", { name: "Go" }).waitFor({ timeout: 15000 });
    await shot(p, `boggle-${w}-ready`);
    await p.getByRole("button", { name: "Go" }).click();
    await p.locator(".bog-cell").first().waitFor();
    ok((await p.locator(".bog-cell").count()) === 16, `Boggle ${w}px: 16 letters`);
    // try some paths: row 0 left to right (always touching)
    await p.locator(".bog-cell").nth(0).click();
    await p.locator(".bog-cell").nth(1).click();
    await p.locator(".bog-cell").nth(2).click();
    await shot(p, `boggle-${w}-play`);
    {
      const r = await p.evaluate(() => {
        const b = [...document.querySelectorAll(".qcard.boggle .btn")].find((x) => /Add word/.test(x.textContent));
        const c = document.querySelector(".qcard.boggle").getBoundingClientRect();
        return { add: b.getBoundingClientRect().bottom, card: c.bottom, ih: innerHeight, sy: scrollY };
      });
      ok(r.add <= r.ih && r.sy === 0, `Boggle ${w}px: Add word on screen without scrolling (${JSON.stringify(r)})`);
    }
    ok(/\S/.test(await p.locator(".bog-word").innerText()), `Boggle ${w}px: shows the word being built`);
    await p.locator(".bog-cell").nth(15).click(); // far away: refused
    ok(
      (await p.locator(".bog-cell.on").count()) === 3,
      `Boggle ${w}px: a far-away square is refused (${await p.locator(".bog-cell.on").count()} chosen)`,
    );
    await p.getByRole("button", { name: "Add word" }).click();
    const msg = await p.locator(".bog-msg").innerText();
    ok(/not a word|\+\d/.test(msg), `Boggle ${w}px: a word is judged (${msg.trim()})`);
    ok((await side(p)) <= 0, `Boggle ${w}px: no sideways scroll`);
    const sc = await p.locator(".bog-cell").first().boundingBox();
    ok(sc.width >= 44 && sc.height >= 44, `Boggle ${w}px: letters are big enough to tap (${Math.round(sc.width)}px)`);
    if (w === 390) {
      // let the clock run out, play the second turn, and see the results
      await p.getByRole("button", { name: /Next player/ }).waitFor({ timeout: 75000 });
      await p.getByRole("button", { name: /Next player/ }).click();
      await p.getByRole("button", { name: "Go" }).click();
      await p.getByRole("button", { name: /See the results/ }).waitFor({ timeout: 75000 });
      await p.getByRole("button", { name: /See the results/ }).click();
      await p.locator(".bog-results").waitFor();
      await shot(p, `boggle-${w}-results`);
      ok((await p.locator(".bog-results li").count()) === 2, "Boggle: results list both players");
    }
    await p.context().close();
  }

// ------------------------------------------------------------------ Tap Race
if (want("taprace"))
  for (const [w, h] of VIEWS)
    for (const n of [2, 3, 4]) {
      const p = await open(w, h, NAMES.slice(0, n), n === 2 ? "Just the two of us" : undefined);
      await p.goto(BASE + "/play/taprace");
      await p.locator(".chip", { hasText: "One round" }).click();
      await p.locator(".chip", { hasText: /^20$/ }).click();
      await p.getByRole("button", { name: /^Start$/ }).click();
      await p.getByRole("button", { name: "Start", exact: true }).waitFor();
      if (n === 2 || n === 4) await shot(p, `taprace-${w}-${n}-ready`);
      ok((await p.locator(".tap-zone").count()) === n, `Tap Race ${w}px/${n}: ${n} zones`);
      const boxes = await p.locator(".tap-zone").evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return [r.width, r.height];
        }),
      );
      ok(
        boxes.every(([bw, bh]) => bw >= 100 && bh >= 100),
        `Tap Race ${w}px/${n}: zones are big (${boxes.map((x) => x.map(Math.round).join("x")).join(", ")})`,
      );
      ok((await side(p)) <= 0, `Tap Race ${w}px/${n}: no sideways scroll`);
      await p.getByRole("button", { name: "Start", exact: true }).click();
      // too early: taps before GO do nothing
      await p
        .locator(".tap-zone")
        .nth(0)
        .click({ force: true })
        .catch(() => {});
      await p.getByText("TAP!").waitFor({ timeout: 6000 });
      ok(
        (await p.locator(".tap-count").first().innerText()) === "0",
        `Tap Race ${w}px/${n}: taps before GO do not count`,
      );
      for (let k = 0; k < 20; k++)
        await p
          .locator(".tap-zone")
          .nth(n - 1)
          .click();
      await p.getByText(/wins the round/).waitFor({ timeout: 3000 });
      if (n === 3 || w === 1280) await shot(p, `taprace-${w}-${n}-won`);
      ok(true, `Tap Race ${w}px/${n}: round won`);
      await p.getByRole("button", { name: "See the result" }).click();
      ok(await p.getByText("Game over").isVisible(), `Tap Race ${w}px/${n}: ends with the scores`);
      await p.context().close();
    }

// ------------------------------------------------------------------ Trivia Buzzer
if (want("buzzer"))
  for (const [w, h] of VIEWS) {
    const names = w === 390 ? NAMES : ["Tee", "Mimi", "Dayo"];
    const p = await open(w, h, names);
    await p.goto(BASE + "/play/buzzer");
    ok(await p.locator(".howline").isVisible(), `Buzzer ${w}px: how to play shows on the set-up page`);
    await p.getByRole("button", { name: /^Start$/ }).click();
    await p.locator(".buz-pad").first().waitFor({ timeout: 15000 });
    await shot(p, `buzzer-${w}-ask`);
    {
      const r = await p.evaluate(() => {
        const c = document.querySelector(".qcard.buzgame").getBoundingClientRect();
        const h = document.querySelector("header")?.getBoundingClientRect();
        return { top: c.top, bottom: c.bottom, hb: h ? h.bottom : 0, ih: innerHeight, sy: scrollY };
      });
      ok(r.bottom <= r.ih + 1, `Buzzer ${w}px: card bottom on screen (${JSON.stringify(r)})`);
      ok(r.top >= r.hb - 1, `Buzzer ${w}px: card top below header (${JSON.stringify(r)})`);
    }
    ok((await p.locator(".buz-pad").count()) === names.length, `Buzzer ${w}px: one buzzer each`);
    const pad = await p.locator(".buz-pad").first().boundingBox();
    ok(pad.height >= 60, `Buzzer ${w}px: buzzers are big (${Math.round(pad.height)}px)`);
    await p.locator(".buz-pad").nth(1).click();
    await p.locator(".options .option").first().waitFor();
    await shot(p, `buzzer-${w}-answer`);
    ok(
      (await p.locator(".buz-pad").count()) === 0 && /Mimi, your answer/.test(await p.locator(".turn").innerText()),
      `Buzzer ${w}px: only the first to buzz answers`,
    );
    ok((await side(p)) <= 0, `Buzzer ${w}px: no sideways scroll`);
    // play on to the end
    let guard = 0;
    while (guard++ < 400) {
      if (
        await p
          .getByText("Game over")
          .isVisible()
          .catch(() => false)
      )
        break;
      const next = p.getByRole("button", { name: /Next question|See the scores/ });
      if (await next.isVisible().catch(() => false)) {
        if (guard < 40) await shot(p, `buzzer-${w}-reveal`).catch(() => {});
        await next.click();
        continue;
      }
      const opt = p.locator(".options .option");
      if (await opt.count()) {
        await opt
          .nth(Math.floor(Math.random() * (await opt.count())))
          .click({ timeout: 1000 })
          .catch(() => {});
        continue;
      }
      const pads = p.locator(".buz-pad:not([disabled])");
      if (await pads.count())
        await pads
          .first()
          .click({ timeout: 1000 })
          .catch(() => {});
      await p.waitForTimeout(30);
    }
    ok(await p.getByText("Game over").isVisible(), `Buzzer ${w}px: a whole game finishes`);
    await p.context().close();
  }

console.log(errors.length ? "ERRORS:\n" + [...new Set(errors)].join("\n") : "no page errors");
ok(errors.length === 0, "no page or console errors");
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
await b.close();
process.exit(fails.length ? 1 : 0);
