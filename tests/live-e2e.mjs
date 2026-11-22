// Live room games with 3 phones. Usage: node tests/live-e2e.mjs <baseUrl> [game]
import { chromium } from "playwright";
const BASE = process.argv[2];
const ONLY = process.argv[3];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const phone = async () =>
  await (await b.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" })).newPage();
const fail = (m) => {
  console.log("FAIL", m);
  process.exit(1);
};
const ok = (m) => console.log("ok", m);
async function room(names) {
  const host = await phone();
  await host.goto(BASE + "/room");
  await host.getByRole("button", { name: "Open a room" }).click();
  await host.locator(".room-code").waitFor();
  const code = (await host.locator(".room-code").textContent()).replace(/\s/g, "");
  const mates = [];
  for (const n of names) {
    const p = await phone();
    await p.goto(`${BASE}/join/${code}`);
    await p.locator("#jname").fill(n);
    await p.getByRole("button", { name: "Join" }).click();
    mates.push(p);
  }
  await host
    .locator(".joined li")
    .nth(names.length - 1)
    .waitFor();
  return { host, mates };
}
async function start(host, game, pick = {}) {
  const t = host.locator(".ticket", { hasText: game }).first();
  if (!(await t.count())) fail(`${game} missing from rooms`);
  await t.click();
  for (const [legend, idx] of Object.entries(pick))
    await host.getByRole("group", { name: legend }).locator(".chip").nth(idx).click();
  await host.getByRole("button", { name: /Start with/ }).click();
}
async function fitAll(host, mates, label) {
  await sleep(1500);
  for (const pg of [host, ...mates]) {
    const w = await pg.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (w[0] > w[1] + 1) fail(`${label}: sideways scroll (${w[0]} > ${w[1]})`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function actorOf(mates, sel) {
  for (let i = 0; i < 40; i++) {
    for (const m of mates) if (await m.locator(sel).count()) return m;
    await sleep(250);
  }
  fail(`nobody showed ${sel}`);
}
const want = (g) => !ONLY || ONLY === g;

if (want("perform")) {
  for (const [game, buzz] of [
    ["Charades Sprint", false],
    ["Don't Say It", true],
    ["Charades Bingo", false],
  ]) {
    const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
    await start(host, game, { "How many turns": 0 });
    await fitAll(host, mates, game);
    const a = await actorOf(mates, ".taboo p");
    const word = await a.locator(".taboo p").first().innerText();
    for (const m of mates)
      if (m !== a && (await m.locator(".taboo").count())) fail(`${game}: word leaked to a guesser`);
    if ((await host.locator(".taboo").count()) !== 0) fail(`${game}: word leaked to host screen`);
    const g = mates.find((m) => m !== a);
    if (buzz) {
      await g.getByRole("button", { name: /Buzz/ }).waitFor();
    }
    await a.getByRole("button", { name: "Got it" }).click();
    await a
      .locator(".btn", { hasText: /Femi|Kemi|Dayo/ })
      .first()
      .click();
    await g.getByText("Guessed this turn: 1").waitFor({ timeout: 8000 });
    await a.getByRole("button", { name: "End my turn" }).click();
    await host.getByText(/got 1/).waitFor({ timeout: 8000 });
    ok(`${game}: word "${word}" private, scored, turn ends`);
  }
}
if (want("words")) {
  const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
  await start(host, "Name, Place, Animal, Thing", { "How many rounds": 0 });
  await fitAll(host, mates, "Name, Place, Animal, Thing");
  await mates[0].locator("input.input").first().waitFor({ timeout: 10000 });
  const letter = (await mates[0].locator(".letter").innerText()).trim();
  for (const [i, m] of mates.entries()) {
    const ins = m.locator("input.input");
    const shared = `${letter}ap`;
    await ins.nth(0).fill(shared);
    await ins.nth(1).fill(`${letter}${"xyz"[i]}${i}`);
    await m.getByRole("button", { name: /Lock in/ }).click();
  }
  await host.locator(".live-results").waitFor({ timeout: 15000 });
  const txt = await host.locator(".live-results").innerText();
  if (!/\+5/.test(txt) || !/\+10/.test(txt)) fail("words: shared 5 / unique 10 not shown: " + txt);
  ok("NPAT: everyone typed, shared 5 and unique 10 scored");
  const h = await b.newContext({ viewport: { width: 375, height: 812 } });
  void h;
}
if (want("name5")) {
  const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
  await start(host, "Name 5 in 10", { "How many turns": 0, "How to answer": 1 });
  await fitAll(host, mates, "Name 5 in 10");
  await mates[0].locator("input.input").nth(4).waitFor({ timeout: 10000 });
  for (const [i, m] of mates.entries()) {
    const ins = m.locator("input.input");
    for (let k = 0; k < 5; k++) await ins.nth(k).fill(k === 0 ? "same" : `item${i}${k}`);
    await m.getByRole("button", { name: /Lock in/ }).click();
  }
  await host.locator(".live-results").waitFor({ timeout: 15000 });
  const t = await host.locator(".live-results").innerText();
  if (!/\+1/.test(t) || !/\+2/.test(t)) fail("name5 scoring: " + t);
  ok("Name 5: answers typed and scored (unique 2, shared 1)");
}
if (want("name5end")) {
  const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
  await start(host, "Name 5 in 10", { "How many turns": 0, "How to answer": 1 });
  for (let r = 0; r < 12; r++) {
    if (await host.getByText(/wins!|It.s a tie|Game over/).count()) break;
    await mates[0]
      .locator("input.input")
      .nth(4)
      .waitFor({ timeout: 20000 })
      .catch(async () =>
        fail(
          "stuck at r" +
            r +
            " HOST: " +
            (await host.locator("main").innerText()).replace(/\n+/g, " | ").slice(0, 300) +
            " PHONE: " +
            (await mates[0].locator("main").innerText()).replace(/\n+/g, " | ").slice(0, 200),
        ),
      );
    // the last round is left unanswered on purpose: Next must still work
    const last = /(\d+) \/ \1/.test(await mates[0].locator(".prog").first().innerText());
    if (!last)
      for (const [i, m] of mates.entries()) {
        for (let k = 0; k < 5; k++) await m.locator("input.input").nth(k).fill(`r${r}i${i}${k}`);
        await m.getByRole("button", { name: /Lock in/ }).click();
      }
    await host.locator(".live-results").waitFor({ timeout: 15000 });
    const nx = mates[0].getByRole("button", { name: "Next" });
    await nx.waitFor({ timeout: 8000 });
    await nx.click();
  }
  await host
    .getByText(/wins!|It.s a tie|Game over/)
    .first()
    .waitFor({ timeout: 15000 })
    .catch(async () =>
      fail(
        "name5 end: " +
          (await host.locator("main").innerText()).slice(0, 400) +
          " || phone: " +
          (await mates[0].locator("main").innerText()).slice(0, 300),
      ),
    );
  ok("Name 5: Next works on every round including the last, game ends");
}
if (want("shout")) {
  const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
  await start(host, "Name 5 in 10", { "How many turns": 0, "How to answer": 0, "Seconds on the clock": 0 });
  await fitAll(host, mates, "Name 5 shout");
  const a = await actorOf(mates, "button:has-text('That is one')");
  const others = mates.filter((m) => m !== a);
  for (let k = 0; k < 3; k++) await a.getByRole("button", { name: "That is one" }).click();
  await others[0].getByRole("button", { name: /Not valid/ }).click();
  await sleep(500);
  const tl = await a.locator(".shout-tally").innerText();
  if (!/^2\s*\/\s*5/.test(tl.replace(/\n/g, " "))) fail("shout tally expected 2/5, got " + tl);
  await a.getByRole("button", { name: "Done" }).click();
  await a.locator("text=got 2 of 5").waitFor({ timeout: 8000 });
  ok("Name 5 shout: count, veto, done, scored");
}
if (want("draw")) {
  const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
  await start(host, "Draw and Guess", { "How many drawings": 0 });
  await fitAll(host, mates, "Draw and Guess");
  const a = await actorOf(mates, ".qprompt:has-text('Draw:')");
  const word = (await a.locator(".qprompt").innerText()).replace(/^Draw:\s*/, "").trim();
  const box = await a.locator("canvas.sketch").boundingBox();
  await a.mouse.move(box.x + 40, box.y + 40);
  await a.mouse.down();
  for (let i = 0; i < 30; i++) await a.mouse.move(box.x + 40 + i * 6, box.y + 40 + i * 4);
  await a.mouse.up();
  const g = mates.find((m) => m !== a);
  await sleep(1500);
  const ink = await g.locator("canvas.sketch").evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++;
    return n;
  });
  if (ink < 200) fail("draw: guesser does not see the drawing (ink " + ink + ")");
  if (await g.getByText(word, { exact: true }).count()) fail("draw: word leaked to guesser");
  await g.getByPlaceholder("Type your guess").fill("nonsenseword");
  await g.getByRole("button", { name: "Guess" }).click();
  await g.getByPlaceholder("Type your guess").fill(word);
  await g.getByRole("button", { name: "Guess" }).click();
  await g.getByText("You got it!").waitFor({ timeout: 8000 });
  ok(`Draw: drawing reaches guessers (${ink} ink px), word "${word}" scored`);
}
if (want("chain")) {
  const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
  await start(host, "Word Chain");
  await fitAll(host, mates, "Word Chain");
  const a = await actorOf(mates, "input[placeholder^='A word starting']");
  const need = (await a.locator("input[placeholder^='A word starting']").getAttribute("placeholder"))
    .slice(-1)
    .toLowerCase();
  const words = {
    a: "apple",
    e: "eagle",
    d: "drums",
    g: "goats",
    r: "river",
    t: "table",
    n: "night",
    s: "stone",
    l: "lemon",
    m: "mango",
    o: "ocean",
    i: "inbox",
    y: "yacht",
    p: "plant",
    h: "horse",
    c: "candy",
    b: "bread",
    f: "flame",
    k: "kitty",
    u: "uncle",
    w: "water",
    v: "voice",
    x: "xerox",
    z: "zebra",
    j: "juice",
    q: "quilt",
  };
  await a.locator("input[placeholder^='A word starting']").fill("zzz");
  await a.getByRole("button", { name: "Lock it in" }).click();
  await a.getByText("Words need at least 5 letters.").waitFor();
  await a.locator("input[placeholder^='A word starting']").fill(need === "z" ? "ppppp" : "zzzzz");
  await a.getByRole("button", { name: "Lock it in" }).click();
  await a.getByText(/must start with/).waitFor();
  await a.locator("input[placeholder^='A word starting']").fill(words[need]);
  await a.getByRole("button", { name: "Lock it in" }).click();
  await host.locator(".chain-trail .chip", { hasText: words[need] }).waitFor({ timeout: 8000 });
  ok(`Word Chain: rule enforced, "${words[need]}" appears on the host screen`);
}
if (want("memory")) {
  const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
  await start(host, "Memory Match");
  await fitAll(host, mates, "Memory Match");
  const a = await actorOf(mates, ".mem-card:not([disabled])");
  await a.locator(".mem-card").nth(0).click();
  await a.locator(".mem-card").nth(1).click();
  await host.locator(".mem-card.up").first().waitFor({ timeout: 8000 });
  const up = await host.locator(".mem-card.up").count();
  if (up < 1) fail("memory: host does not see flipped cards");
  const b2 = mates.find((m) => m !== a);
  if ((await b2.locator(".mem-card:not([disabled])").count()) !== 0) fail("memory: a non-turn player can flip");
  ok(`Memory: shared board synced (${up} up), only the turn player can flip`);
}
if (want("knowme")) {
  const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
  await start(host, "How Well Do You Know Me?", { "How many rounds": 0 });
  await fitAll(host, mates, "How Well Do You Know Me?");
  const a = await actorOf(mates, "input[placeholder^='Your real answer']");
  await a.locator("input[placeholder^='Your real answer']").fill("Jollof rice");
  await a.getByRole("button", { name: "Lock in my answer" }).click();
  const gs = mates.filter((m) => m !== a);
  for (const [i, g] of gs.entries()) {
    await g.locator("input[placeholder^='What did']").waitFor({ timeout: 8000 });
    if (await g.getByText("Jollof rice").count()) fail("knowme: secret leaked");
    await g.locator("input[placeholder^='What did']").fill(i === 0 ? "jollof" : "pizza");
    await g.getByRole("button", { name: "Guess" }).click();
  }
  await host.locator(".live-results").waitFor({ timeout: 15000 });
  const t = await host.locator(".live-results").innerText();
  if (!/\+100/.test(t)) fail("knowme: no scoring: " + t);
  ok("Know Me: secret hidden, guesses judged, reveal shown");
}
if (want("bucket")) {
  const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
  await start(host, "Couples Bucket List", { "How many cards": 0 });
  await fitAll(host, mates, "Couples Bucket List");
  await mates[0].locator(".option").first().waitFor({ timeout: 10000 });
  if ((await mates[0].locator(".option").count()) !== 3) fail("bucket: expected 3 options");
  for (const m of mates) await m.locator(".option").first().click();
  await host.locator(".votes").first().waitFor({ timeout: 10000 });
  ok("Bucket list: everyone votes on their own phone");
}
await b.close();
console.log("live room games ok");
