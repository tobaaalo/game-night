// Host checks: End game keeps the host in the room, a host playing sees one board, no "vs Computer" in rooms,
// and when the host drops, the next person who is here becomes host by themselves.
import { chromium } from "playwright";
const BASE = process.argv[2];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
let bad = 0;
const ok = (c, m) => (console.log(c ? "ok  " : "FAIL", m), c || (bad = 1));
const phone = async () =>
  await (await b.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: "reduce" })).newPage();
const host = await phone();
await host.goto(BASE + "/room");
await host.getByRole("button", { name: "Open a room" }).click();
await host.locator(".room-code").waitFor();
const code = (await host.locator(".room-code").textContent()).replace(/\s/g, "");
ok(!(await host.locator(".who-pill").count()), "no player pill (vs Computer) in a room");
const mates = [];
for (const n of ["Dayo", "Femi"]) {
  const p = await phone();
  await p.goto(`${BASE}/join/${code}`);
  await p.locator("#jname").fill(n);
  await p.getByRole("button", { name: "Join" }).click();
  mates.push(p);
}
await host.locator(".joined li").nth(1).waitFor();
// host plays too
await host.getByRole("switch", { name: "I'll play too" }).click();
await host.locator(".host-play input").fill("Tee");
await host.locator(".host-play form button").click();
await host.locator(".joined li").nth(2).waitFor({ timeout: 8000 });
await host.locator(".ticket, .tile", { hasText: "Memory Match" }).click();
await host.getByRole("button", { name: /Start with/ }).click();
await host.locator(".host-player").waitFor({ state: "visible", timeout: 10000 });
await host.waitForTimeout(1500);
const boards = await host.locator(".mem-grid").count();
ok(boards === 1, `host who plays sees one memory board (${boards})`);
// End this game: stay in the room
await host.getByRole("button", { name: "End this game for everyone" }).click();
await host.getByRole("button", { name: /Play another game/ }).waitFor({ timeout: 12000 });
ok(
  /\/room/.test(host.url()) && (await host.locator(".room-code").isVisible()),
  "after ending the game the host is still in the room",
);
await host.getByRole("button", { name: /Play another game/ }).click();
ok(await host.locator(".room-code").isVisible(), "host can pick another game");
// Host drops: next person takes over
await host.context().close();
const d = mates[0];
await d.waitForSelector(".host-play", { timeout: 45000 }).then(
  () => ok(true, "next player became host automatically"),
  () => ok(false, "next player became host automatically"),
);
await b.close();
process.exit(bad);
