// The host plays too, against one other phone, in Tic-Tac-Toe. Usage: PW_CHROME=... node tests/duel-host-e2e.mjs <base>
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:4180";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const phone = async () =>
  await (await b.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" })).newPage();
const fail = (m) => {
  console.log("FAIL", m);
  process.exit(1);
};
const host = await phone();
await host.goto(BASE + "/room");
await host.getByRole("button", { name: "Open a room" }).click();
await host.locator(".room-code").waitFor();
const code = (await host.locator(".room-code").textContent()).replace(/\s/g, "");
await host.getByRole("switch", { name: /play too/ }).click();
await host.getByLabel("Your name").fill("Toba");
await host.getByRole("button", { name: "Join", exact: true }).click();
await host.getByText("Playing as Toba").waitFor({ timeout: 8000 });
const mate = await phone();
await mate.goto(`${BASE}/join/${code}`);
await mate.locator("#jname").fill("Femi");
await mate.getByRole("button", { name: "Join" }).click();
await host.getByText("2 in the room").first().waitFor({ timeout: 10000 });
await host.locator(".ticket, .tile", { hasText: "Tic-Tac-Toe" }).first().click();
await host.getByRole("button", { name: "Start with 2 players" }).click();
await host.locator(".duel").first().waitFor({ timeout: 10000 });
if ((await host.locator(".duel").count()) !== 1)
  fail("host page draws the board " + (await host.locator(".duel").count()) + " times");
await mate.locator(".duel").waitFor({ timeout: 10000 });
let finished = false;
for (let i = 0; i < 80 && !finished; i++) {
  for (const p of [host, mate]) {
    if (
      await p
        .getByRole("button", { name: /See the result|Next game/ })
        .isVisible()
        .catch(() => false)
    ) {
      finished = true;
      break;
    }
    const c = p.locator(".duel-cell:not([disabled])");
    if (await c.count())
      await c
        .first()
        .click({ timeout: 800 })
        .catch(() => {});
  }
  await host.waitForTimeout(120);
}
if (!finished) fail("host-plays duel never finished");
const a = await host.locator(".duel-status").innerText(),
  c = await mate.locator(".duel-status").innerText();
console.log("ok   host and joiner played Tic-Tac-Toe to the end:", a, "/", c);
const over = await host.evaluate(() => document.documentElement.scrollWidth - innerWidth);
if (over > 0) fail("host screen scrolls sideways");
console.log("ok   no sideways scroll on the host device");
await b.close();
