// Head to head games in a room, on real separate phones. Usage: PW_CHROME=... node tests/duel-room-e2e.mjs <base>
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:4180";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const fails = [];
const ok = (c, m) => {
  console.log((c ? "ok   " : "FAIL ") + m);
  if (!c) fails.push(m);
};
const errors = [];
const phone = async () => {
  const p = await (await b.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" })).newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on(
    "console",
    (m) => m.type() === "error" && !/Failed to load resource|favicon/.test(m.text()) && errors.push(m.text()),
  );
  return p;
};
const join = async (code, name) => {
  const p = await phone();
  await p.goto(`${BASE}/join/${code}`);
  await p.locator("#jname").fill(name);
  await p.getByRole("button", { name: "Join" }).click();
  return p;
};
async function openRoom() {
  const host = await phone();
  await host.goto(BASE + "/room");
  await host.getByRole("button", { name: "Open a room" }).click();
  await host.locator(".room-code").waitFor();
  const code = (await host.locator(".room-code").textContent()).replace(/\s/g, "");
  return { host, code };
}
const target = {
  ttt: ".duel-cell:not([disabled])",
  c4: ".c4-col:not([disabled])",
  dots: ".dots .hit",
  rps: ".rps-btn:not([disabled])",
  ship: ".sea.live .sea-cell:not([disabled])",
};
const resultBtn = (p) => p.getByRole("button", { name: /See the result|Next game|Go again/ });
async function playBoth(a, c, id, limit = 600) {
  for (let i = 0; i < limit; i++) {
    for (const p of [a, c]) {
      if (
        await resultBtn(p)
          .isVisible()
          .catch(() => false)
      )
        return i;
      if (id === "ship") {
        const r = p.getByRole("button", { name: "Ready" });
        if (await r.isVisible().catch(() => false)) {
          await r.click({ timeout: 1000 }).catch(() => {});
          continue;
        }
      }
      const t = p.locator(target[id]);
      const n = await t.count();
      if (n)
        await t
          .nth(Math.floor(Math.random() * Math.min(n, 5)))
          .click({ timeout: 1000 })
          .catch(() => {});
    }
    await a.waitForTimeout(100);
  }
  return -1;
}
const pick = async (host, name) => {
  await host.locator(".ticket, .tile", { hasText: name }).first().click();
};

// 1. One player in the room: a two-player game cannot start yet. Two players: it can.
{
  const { host, code } = await openRoom();
  const d = await join(code, "Dayo");
  await host.locator(".joined li").nth(0).waitFor();
  ok(
    await host.locator(".ticket, .tile", { hasText: "Tic-Tac-Toe" }).first().isVisible(),
    "room picker lists Tic-Tac-Toe in its own section",
  );
  ok((await host.getByRole("button", { name: /^Head to head/ }).count()) > 0, "room has a Head to head section");
  await pick(host, "Tic-Tac-Toe");
  ok(
    await host.getByText("Take turns putting your mark in a square").isVisible(),
    "room shows how to play for the picked game",
  );
  const start = host.getByRole("button", { name: /needs exactly 2 players/ });
  ok((await start.isVisible()) && (await start.isDisabled()), "one player: start is blocked and says why");
  const f = await join(code, "Femi");
  await host.locator(".joined li").nth(1).waitFor();
  await host.getByRole("button", { name: "Start with 2 players" }).click();
  await d.locator(".duel").waitFor({ timeout: 10000 });
  await f.locator(".duel").waitFor({ timeout: 10000 });
  ok(await host.locator(".duel").isVisible(), "the host can watch");
  ok((await host.locator(".duel-cell:not([disabled])").count()) === 0, "the host cannot move");
  const turns = [await d.locator(".duel-status").innerText(), await f.locator(".duel-status").innerText()];
  ok(turns.filter((t) => /Your turn/.test(t)).length === 1, `exactly one phone says Your turn (${turns.join(" / ")})`);
  const n = await playBoth(d, f, "ttt");
  ok(n >= 0, `a game of Tic-Tac-Toe finishes in the room (${n} rounds)`);
  const st = [await d.locator(".duel-status").innerText(), await f.locator(".duel-status").innerText()];
  ok(
    st.some((t) => /won/.test(t)) || st.every((t) => /draw/i.test(t)),
    `both phones agree on the result: ${st.join(" / ")}`,
  );
  await resultBtn(d).click();
  ok(
    await host
      .getByRole("button", { name: "Play another game" })
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false),
    "after the match the host sees the results and Play another game",
  );
  ok(
    await d
      .getByText(/Final scores|Dayo|Femi/)
      .first()
      .isVisible()
      .catch(() => false),
    "players see the results too",
  );
  // A third person joining takes a two-player game off the picker.
  await host
    .getByRole("button", { name: /Play another game/ })
    .click()
    .catch(() => {});
  await join(code, "Kemi");
  await host.waitForTimeout(800);
  ok(
    (await host.locator(".ticket, .tile", { hasText: "Connect Four" }).count()) === 0,
    "third player joins: Connect Four leaves the picker",
  );
  ok(
    (await host.locator(".ticket, .tile", { hasText: "Bible Trivia" }).count()) > 0,
    "third player joins: other games stay",
  );
  ok(/2 players only/.test(await host.locator("body").innerText()), "the picker says why games are hidden");
  await host.context().close();
}

// 2. Third player joins while a two-player game is picked: it is cleared, not left half set up.
{
  const { host, code } = await openRoom();
  await join(code, "A1");
  await join(code, "B2");
  await host.locator(".joined li").nth(1).waitFor();
  await pick(host, "Connect Four");
  ok(await host.getByText("Take turns dropping a disc").isVisible(), "Connect Four picked");
  await join(code, "C3");
  await host.waitForTimeout(1000);
  ok(
    !(await host
      .getByText("Take turns dropping a disc")
      .isVisible()
      .catch(() => false)),
    "a third player clears a picked two-player game",
  );
  await host.context().close();
}

// 3. Every game, played out in a room on two phones.
for (const [id, name] of [
  ["c4", "Connect Four"],
  ["dots", "Dots and Boxes"],
  ["rps", "Rock Paper Scissors"],
  ["ship", "Battleship"],
]) {
  const { host, code } = await openRoom();
  const d = await join(code, "Dayo");
  const f = await join(code, "Femi");
  await host.locator(".joined li").nth(1).waitFor();
  await pick(host, name);
  await host.getByRole("button", { name: "Start with 2 players" }).click();
  await d.locator(".duel").waitFor({ timeout: 10000 });
  await f.locator(".duel").waitFor({ timeout: 10000 });
  if (id === "ship") {
    ok(
      (await d.locator(".sea .ship").count()) === 7 && (await f.locator(".sea .ship").count()) === 7,
      "Battleship: each phone sees only its own 7 ship squares",
    );
    await d.getByRole("button", { name: "Shuffle" }).click();
    ok((await d.locator(".sea .ship").count()) === 7, "Battleship: shuffle keeps a full fleet");
    await d.getByRole("button", { name: "Ready" }).click();
    ok(
      await d
        .locator(".duel-status", { hasText: /Waiting for/ })
        .waitFor({ timeout: 6000 })
        .then(
          () => true,
          () => false,
        ),
      "Battleship: waits for the other player",
    );
    await f.getByRole("button", { name: "Ready" }).click();
    await d.locator(".sea.live, .sea").first().waitFor();
    await d.waitForTimeout(500);
    const mineD = await d.locator('.sea[aria-label="Your fleet"] .ship').count();
    const theirsD = await d.locator('.sea[aria-label$="\'s waters"] .ship, .sea.live .ship').count();
    ok(mineD === 7 && theirsD === 0, `Battleship: enemy ships stay hidden (own ${mineD}, enemy ${theirsD})`);
  }
  if (id === "rps") {
    await d.locator(".rps-btn").first().click();
    await f.waitForTimeout(500);
    ok(
      (await f.locator(".rps-reveal").count()) === 0 && (await d.locator(".rps-reveal").count()) === 0,
      "Rock Paper Scissors: nothing is revealed until both pick",
    );
    ok(
      !/Rock/.test(await f.locator(".duel-status").innerText()),
      "Rock Paper Scissors: the other phone does not see the pick",
    );
  }
  const n = await playBoth(d, f, id);
  ok(n >= 0, `${name} finishes in a room (${n} rounds)`);
  const st = [await d.locator(".duel-status").innerText(), await f.locator(".duel-status").innerText()];
  ok(
    st.some((t) => /won|draw|Same pick/i.test(t)),
    `${name}: result shown: ${st.join(" / ")}`,
  );
  ok((await d.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${name}: no sideways scroll`);
  await d.screenshot({ path: `/tmp/s/room-${id}.png` });
  await host.context().close();
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
ok(errors.length === 0, "no page or console errors");
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
await b.close();
process.exit(fails.length ? 1 : 0);
