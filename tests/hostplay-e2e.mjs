// The host plays too: one tap and a name, a switch, then host controls and your answers on one screen.
import { chromium } from "playwright";
const BASE = process.argv[2];
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
await host
  .getByText("2 in the room")
  .first()
  .waitFor({ timeout: 10000 })
  .catch(async () =>
    fail("host player not counted: " + (await host.locator("main").innerText()).replace(/\n+/g, " | ").slice(0, 500)),
  );
// start Higher or Lower style quick game: Would You Rather is talk-only; use Name 5 shout
await host.locator(".ticket, .tile", { hasText: "Name 5 in 10" }).first().click();
await host.getByRole("button", { name: /Start with/ }).click();
// host device flips to the player view by itself
await host.getByRole("heading", { name: "Your answers" }).waitFor({ timeout: 10000 });
await host.waitForTimeout(1500);
const txt = await host.locator("[hidden]").count();
const sees = (await host.locator("main").innerText()).match(/Name 5|shout|Your turn|is shouting|Name five/i);
if (!sees) fail("player view not showing the game on the host device");
const over = await host.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (over > 1) fail("sideways scroll on host device " + over);
// back to the controls
await host.getByRole("button", { name: /End the game for everyone/ }).waitFor();
console.log(
  "ok host plays too: joined with one tap, counted as a player, auto-switched to play, can flip back to controls",
);
await b.close();
