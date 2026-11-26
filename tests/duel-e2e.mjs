// Head to head games: one phone against the computer, two people on one phone, and in a room.
// Usage: PW_CHROME=... node tests/duel-e2e.mjs <base> [only-id]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:4180";
const ONLY = process.argv[3];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const fails = [];
const ok = (c, m) => {
  console.log((c ? "ok   " : "FAIL ") + m);
  if (!c) fails.push(m);
};
const errors = [];
const phone = async (w = 390, h = 800) => {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" })).newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on(
    "console",
    (m) => m.type() === "error" && !/Failed to load resource|favicon/.test(m.text()) && errors.push(m.text()),
  );
  return p;
};
const GAMES = [
  ["ttt", "Tic-Tac-Toe"],
  ["c4", "Connect Four"],
  ["dots", "Dots and Boxes"],
  ["rps", "Rock Paper Scissors"],
].filter(([id]) => !ONLY || id === ONLY);
const target = {
  ttt: ".duel-cell:not([disabled])",
  c4: ".c4-col:not([disabled])",
  dots: ".dots .hit",
  rps: ".rps-btn:not([disabled])",
};
const over = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);

// Plays one phone until the result button shows. Returns how many clicks it took.
async function playOut(p, id, limit = 1200) {
  for (let i = 0; i < limit; i++) {
    const done = p.getByRole("button", { name: /See the result|Next game|Go again/ });
    if (await done.isVisible().catch(() => false)) return i;
    const t = p.locator(target[id]);
    if (await t.count())
      await t
        .nth(Math.floor(Math.random() * Math.min(await t.count(), 6)))
        .click({ timeout: 1200 })
        .catch(() => {});
    await p.waitForTimeout(id === "c4" ? 200 : 120);
  }
  return -1;
}

for (const [id, name] of GAMES) {
  for (const w of [320, 390]) {
    // vs the computer
    const p = await phone(w, w === 320 ? 640 : 800);
    await p.goto(BASE + "/who");
    await p.getByText("Me vs the computer").click();
    await p.locator("#p-me").fill("Toba");
    await p
      .getByRole("button", { name: /Pick a game|Continue|Next/ })
      .first()
      .click();
    await p.goto(BASE + "/play/" + id);
    // The how-to line is on the page.
    ok(await p.getByRole("button", { name: "How to play" }).first().isVisible(), `${name} ${w}px: has How to play`);
    await p.getByRole("button", { name: /^Start$/ }).click();
    await p.locator(".duel").waitFor();
    ok((await over(p)) <= 0, `${name} ${w}px: no sideways scroll at start`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(600);
    const h0 = await p.locator(".duel").evaluate((e) => Math.round(e.getBoundingClientRect().height));
    const n = await playOut(p, id);
    ok(n >= 0, `${name} ${w}px vs computer: a game finishes (${n} clicks)`);
    const h1 = await p.locator(".duel").evaluate((e) => Math.round(e.getBoundingClientRect().height));
    ok(h0 === h1, `${name} ${w}px: card keeps its size (${h0} -> ${h1})`);
    ok((await over(p)) <= 0, `${name} ${w}px: no sideways scroll at the end`);
    const small = await p.evaluate(
      () =>
        [...document.querySelectorAll(".duel button, .duel .hit, .duel .sea-cell")].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.height < 38 || r.width < 38) && !e.closest(".sea.small");
        }).length,
    );
    ok(small === 0, `${name} ${w}px: no tiny tap targets (${small})`);
    await p.screenshot({ path: `/tmp/s/duel-${id}-${w}.png` });
    // Finish the match and see the result screen.
    await p.getByRole("button", { name: /See the result|Next game|Go again/ }).click();
    await p.waitForTimeout(300);
    ok((await p.locator("body").innerText()).length > 20, `${name} ${w}px: carries on after a game`);
    await p.context().close();
  }
}

// Two people on one phone.
for (const [id, name] of GAMES.filter(([id]) => ["ttt", "c4", "dots"].includes(id))) {
  const p = await phone();
  await p.goto(BASE + "/who");
  await p.getByText("Just the two of us").click();
  const inp = p.locator(".namelist input");
  await inp.nth(0).fill("Toba");
  await inp.nth(1).fill("Mimi");
  await p.getByRole("button", { name: "Pick a game" }).click();
  await p.goto(BASE + "/play/" + id);
  await p.getByRole("button", { name: /^Start$/ }).click();
  await p.locator(".duel").waitFor();
  const t0 = await p.locator(".duel-status").innerText();
  ok(/Toba's turn|Mimi's turn/.test(t0), `${name} on one phone says whose turn: "${t0}"`);
  const n = await playOut(p, id);
  ok(n >= 0, `${name} on one phone: a game finishes`);
  await p.context().close();
}
// Rock Paper Scissors on one phone with two people: they ask for the computer.
for (const [id, name] of [["rps", "Rock Paper Scissors"]].filter(([id]) => !ONLY || id === ONLY)) {
  const p = await phone();
  await p.goto(BASE + "/who");
  await p.getByText("Just the two of us").click();
  const inp = p.locator(".namelist input");
  await inp.nth(0).fill("Toba");
  await inp.nth(1).fill("Mimi");
  await p.getByRole("button", { name: "Pick a game" }).click();
  await p.goto(BASE + "/play/" + id);
  ok(await p.getByText("Play the computer").isVisible(), `${name} with two people on one phone points to the computer`);
  await p.context().close();
}
// With three players the two-player games are hidden from the list.
{
  const p = await phone();
  await p.goto(BASE + "/who");
  await p.getByText("Friends are here").click();
  const i = p.locator(".namelist input");
  await i.nth(0).fill("Toba");
  await i.nth(1).fill("Mimi");
  await i.nth(2).fill("Dayo");
  await p.getByRole("button", { name: "Pick a game" }).click();
  const txt = await p.locator("body").innerText();
  const off = async (n) =>
    (await p.locator(".ticket, .tile").filter({ hasText: n }).first().getAttribute("aria-disabled")) === "true";
  ok(await off("Tic-Tac-Toe"), "three players: Tic-Tac-Toe is greyed out");
  ok(await off("Connect Four"), "three players: Connect Four is greyed out");
  ok(
    /exactly 2/.test(txt) || (await p.locator(".ticket.off, .tile.off").count()) > 0,
    "three players: greyed games exist",
  );
  await p.context().close();
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
ok(errors.length === 0, "no page or console errors");
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
await b.close();
process.exit(fails.length ? 1 : 0);
