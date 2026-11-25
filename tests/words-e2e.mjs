// Hangman, Word Guess and Find the Spy on one phone. Usage: PW_CHROME=... node tests/words-e2e.mjs <base>
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:4180";
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
const over = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const solo = async (p) => {
  await p.goto(BASE + "/who");
  await p.getByText("Me vs the computer").click();
  await p.locator("#p-me").fill("Toba");
  await p
    .getByRole("button", { name: /Pick a game|Continue|Next/ })
    .first()
    .click();
};
const small = (p, sel) =>
  p.evaluate(
    (s) =>
      [...document.querySelectorAll(s)].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.height < 38 || r.width < 38);
      }).length,
    sel,
  );

// Hangman
for (const w of [320, 390]) {
  const p = await phone(w, w === 320 ? 640 : 800);
  await solo(p);
  await p.goto(BASE + "/play/hangman");
  ok(await p.locator("details.howto summary").isVisible(), `Hangman ${w}px: has How to play`);
  await p.getByRole("button", { name: /^Start$/ }).click();
  await p.locator(".hang").waitFor();
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  const h0 = await p.locator(".hang").evaluate((e) => Math.round(e.getBoundingClientRect().height));
  ok((await over(p)) <= 0, `Hangman ${w}px: no sideways scroll`);
  ok((await small(p, ".hang button")) === 0, `Hangman ${w}px: no tiny taps`);
  const order = "ETAOINSHRDLUCMFWYPGBVKJXQZ".split("");
  let n = 0;
  const playWord = async () => {
    for (const l of order) {
      if (
        await p
          .getByRole("button", { name: /Next word|See the result/ })
          .isVisible()
          .catch(() => false)
      )
        break;
      await p
        .locator(".key", { hasText: new RegExp(`^${l}$`) })
        .click({ timeout: 1500 })
        .catch(() => {});
      n++;
    }
  };
  await playWord();
  const done = p.getByRole("button", { name: /Next word|See the result/ });
  ok(await done.isVisible(), `Hangman ${w}px: a word ends (${n} letters)`);
  const h1 = await p.locator(".hang").evaluate((e) => Math.round(e.getBoundingClientRect().height));
  ok(h0 === h1, `Hangman ${w}px: card keeps its size (${h0} -> ${h1})`);
  await p.screenshot({ path: `/tmp/s/hang-${w}.png` });
  for (let k = 0; k < 6; k++) {
    if (
      !(await p
        .locator(".hang")
        .isVisible()
        .catch(() => false))
    )
      break;
    await playWord();
    await p.getByRole("button", { name: /Next word|See the result/ }).click();
    await p.waitForTimeout(150);
  }
  ok(
    await p
      .getByRole("button", { name: /Play again/i })
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false),
    `Hangman ${w}px: finishes with Play again`,
  );
  await p.context().close();
}
// Hangman wrong guesses draw the gallows
{
  const p = await phone();
  await solo(p);
  await p.goto(BASE + "/play/hangman");
  await p.getByRole("button", { name: /^Start$/ }).click();
  await p.locator(".hang").waitFor();
  const before = await p.locator(".gallows").getAttribute("aria-label");
  for (const l of "QZXJVKWYFB") {
    const wrongNow = await p.locator(".gallows").getAttribute("aria-label");
    if (/^[6] of/.test(wrongNow)) break;
    await p
      .locator(".key", { hasText: new RegExp(`^${l}$`) })
      .click({ timeout: 1500 })
      .catch(() => {});
  }
  const after = await p.locator(".gallows").getAttribute("aria-label");
  ok(
    before.startsWith("0 of") && after !== before,
    `Hangman: wrong guesses add to the drawing (${before} -> ${after})`,
  );
  await p.context().close();
}

// Word Guess
for (const w of [320, 390]) {
  const p = await phone(w, w === 320 ? 640 : 800);
  await solo(p);
  await p.goto(BASE + "/play/wordguess");
  ok(await p.locator("details.howto summary").isVisible(), `Word Guess ${w}px: has How to play`);
  await p.getByRole("group", { name: "How many words" }).locator(".chip").first().click();
  await p.getByRole("button", { name: /^Start$/ }).click();
  await p.locator(".wguess").waitFor();
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  const h0 = await p.locator(".wguess").evaluate((e) => Math.round(e.getBoundingClientRect().height));
  await p.getByPlaceholder("Type 5 letters").fill("abc");
  await p.getByRole("button", { name: "Guess", exact: true }).click();
  ok(/5 letters/.test(await p.locator(".wg-err").innerText()), `Word Guess ${w}px: short guess is refused`);
  const tries = ["crane", "light", "sound", "pizza", "hotel", "dream"];
  for (const g of tries) {
    if (
      await p
        .getByRole("button", { name: /Next word|See the result/ })
        .isVisible()
        .catch(() => false)
    )
      break;
    await p.getByPlaceholder("Type 5 letters").fill(g);
    await p.getByRole("button", { name: "Guess", exact: true }).click();
    await p.waitForTimeout(80);
  }
  const done = p.getByRole("button", { name: /Next word|See the result/ });
  ok(await done.isVisible(), `Word Guess ${w}px: a word ends after at most six guesses`);
  ok((await p.locator(".wtile.right, .wtile.close, .wtile.no").count()) >= 5, `Word Guess ${w}px: tiles are coloured`);
  const h1 = await p.locator(".wguess").evaluate((e) => Math.round(e.getBoundingClientRect().height));
  ok(h0 === h1, `Word Guess ${w}px: card keeps its size (${h0} -> ${h1})`);
  ok((await over(p)) <= 0, `Word Guess ${w}px: no sideways scroll`);
  ok((await small(p, ".wguess button, .wguess input")) === 0, `Word Guess ${w}px: no tiny taps`);
  await p.screenshot({ path: `/tmp/s/wg-${w}.png` });
  await done.click();
  await p.waitForTimeout(300);
  ok(
    await p
      .getByRole("button", { name: /Play again/i })
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false),
    `Word Guess ${w}px: finishes with Play again`,
  );
  await p.context().close();
}

// Find the Spy: three friends, pass the phone.
for (const w of [320, 390]) {
  const p = await phone(w, w === 320 ? 640 : 800);
  await p.goto(BASE + "/who");
  await p.getByText("Friends are here").click();
  const i = p.locator(".namelist input");
  await i.nth(0).fill("Toba");
  await i.nth(1).fill("Mimi");
  await i.nth(2).fill("Dayo");
  await p.getByRole("button", { name: "Pick a game" }).click();
  ok(
    (await p.locator(".ticket, .tile").filter({ hasText: "Find the Spy" }).count()) > 0,
    `Spy ${w}px: is in the list with 3 players`,
  );
  await p.goto(BASE + "/play/spy");
  await p.getByRole("button", { name: /^Start$/ }).click();
  let spies = 0,
    places = [];
  for (let k = 0; k < 3; k++) {
    await p.getByRole("button", { name: "Show my card" }).click();
    const t = await p.locator(".qcard").innerText();
    if (/You are the spy/i.test(t)) spies++;
    else places.push((t.match(/The place is\s+(.+)/i) || [])[1]?.split("\n")[0]?.trim());
    ok((await over(p)) <= 0, `Spy ${w}px card ${k + 1}: no sideways scroll`);
    await p.getByRole("button", { name: /Hide it and pass on|Everyone has seen it/ }).click();
  }
  ok(
    spies === 1 && places.length === 2 && places[0] === places[1],
    `Spy ${w}px: one spy, the others see the same place (${places.join(" / ")})`,
  );
  ok(await p.locator("[role=timer]").isVisible(), `Spy ${w}px: question timer shows`);
  await p.getByRole("button", { name: "We know who it is" }).click();
  await p.getByRole("button", { name: "Mimi" }).click();
  await p.waitForTimeout(200);
  const t = await p.locator(".qcard").innerText();
  ok(/caught the spy|was not the spy/i.test(t), `Spy ${w}px: accusing someone gives a result (${t.split("\n")[0]})`);
  if (/caught the spy/i.test(t)) {
    await p.locator(".givers button").first().click();
    await p.waitForTimeout(200);
  }
  ok(/wins|win\.|was not the spy/i.test(await p.locator(".qcard").innerText()), `Spy ${w}px: round result shows`);
  await p.getByRole("button", { name: "Another round" }).click();
  ok(await p.getByRole("button", { name: "Show my card" }).isVisible(), `Spy ${w}px: another round starts`);
  await p.context().close();
}
// Two players: Find the Spy is not offered.
{
  const p = await phone();
  await p.goto(BASE + "/who");
  await p.getByText("Just the two of us").click();
  const i = p.locator(".namelist input");
  await i.nth(0).fill("Toba");
  await i.nth(1).fill("Mimi");
  await p.getByRole("button", { name: "Pick a game" }).click();
  ok(
    (await p.locator(".ticket, .tile").filter({ hasText: "Find the Spy" }).count()) === 0,
    "Spy is hidden for two players",
  );
  ok(
    (await p.locator(".ticket, .tile").filter({ hasText: "Hangman" }).count()) > 0,
    "Hangman is offered to two players",
  );
  const txt = await p.locator("body").innerText();
  ok(/Word games/.test(txt) && /Head to head/.test(txt), "Word games and Head to head are separate sections");
  await p.context().close();
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
ok(errors.length === 0, "no page or console errors");
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
await b.close();
process.exit(fails.length ? 1 : 0);
