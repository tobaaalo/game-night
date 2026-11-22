// Leaving a game, host handover and rejoining. Usage: node tests/exit-e2e.mjs <baseUrl> [shotsDir]
import { chromium } from "playwright";
const BASE = process.argv[2], SH = process.argv[3] || "tests/screens";
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const mk = async (w = 375, h = 812) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => fail("page error " + e.message));
  return p;
};
const fail = (m) => { console.log("FAIL", m); process.exit(1); };
const ok = (m) => console.log("ok", m);
const shot = (p, n) => p.screenshot({ path: `${SH}/exit-${n}.png`, fullPage: true });
const join = async (code, name) => {
  const p = await mk();
  await p.goto(`${BASE}/join/${code}`);
  await p.locator("#jname").fill(name);
  await p.getByRole("button", { name: "Join" }).click();
  await p.locator(".room.player").waitFor();
  return p;
};
const host = await mk(820, 1100);
await host.goto(BASE + "/room");
await host.getByRole("button", { name: "Open a room" }).click();
await host.locator(".room-code").waitFor();
const code = (await host.locator(".room-code").textContent()).replace(/\s/g, "");
const dayo = await join(code, "Dayo");
const femi = await join(code, "Femi");
await host.locator(".joined li").nth(1).waitFor();
await host.locator(".ticket, .tile", { hasText: "Bible Trivia" }).click();
await host.getByRole("group", { name: "How many" }).locator(".chip").last().click();
await host.getByRole("button", { name: /Start with/ }).click();
await dayo.locator(".option").first().waitFor({ timeout: 10000 });

// 1. A player asks to leave; the host can keep them
await dayo.getByRole("button", { name: "Leave room" }).click();
await dayo.getByText("Asked the host to let you leave").waitFor();
await host.getByText("Dayo wants to leave").waitFor();
await shot(host, "host-leave-request");
await shot(dayo, "player-asked");
await host.getByRole("button", { name: "Ask them to stay" }).click();
await dayo.getByRole("button", { name: "Leave room" }).waitFor();
ok("host can ask a player to stay; leave button comes back");
// ...or let them go
await dayo.getByRole("button", { name: "Leave room" }).click();
await host.getByRole("button", { name: "Let them go" }).click();
await dayo.locator("#code").waitFor();
ok("player leaves once the host accepts");
await shot(dayo, "player-left");
// 2. Rejoin the same room
await dayo.locator("#code").fill(code);
await dayo.locator("#jname").fill("Dayo");
await dayo.getByRole("button", { name: "Join" }).click();
await dayo.locator(".room.player").waitFor();
ok("player can rejoin the same room");
// 3. Host hands over to Femi
await host.getByRole("button", { name: "Make someone else host" }).click();
await host.getByRole("button", { name: "Make host" }).nth(1).click();
await host.getByText(/Waiting for .* to accept/).waitFor();
const who = (await host.getByText(/Waiting for .* to accept/).textContent()).match(/for (\w+)/)[1];
const newHost = who === "Femi" ? femi : dayo;
const other = who === "Femi" ? dayo : femi;
await newHost.getByText("The host wants you to be the host.").waitFor();
await shot(newHost, "offer");
await newHost.getByRole("button", { name: "No thanks" }).click();
await host.getByText(/Waiting for .* to accept/).waitFor({ state: "detached" });
ok("a declined offer leaves the host in place");
await host.getByRole("button", { name: "Make someone else host" }).click();
await host.getByRole("button", { name: "Make host" }).first().click();
const who2 = (await host.getByText(/Waiting for .* to accept/).textContent()).match(/for (\w+)/)[1];
const nh = who2 === "Femi" ? femi : dayo;
const ot = who2 === "Femi" ? dayo : femi;
await nh.getByRole("button", { name: /Yes, I.ll host/ }).click();
await nh.locator(".room-code").waitFor({ timeout: 10000 });
if ((await nh.locator(".room-code").textContent()).replace(/\s/g, "") !== code) fail("new host sees a different room");
await nh.locator(".qprompt").first().waitFor({ state: "attached" });
ok("accepting makes them the host, and the game carries on");
await shot(nh, "new-host");
await host.locator(".room.player").waitFor({ timeout: 10000 });
ok("the old host is a player now");
await shot(host, "old-host-as-player");
// 4. New host leaves: the next person is asked; if all say no, the room is still handed on
await nh.getByRole("button", { name: "Leave room" }).click();
await nh.getByRole("button", { name: "Leave and pass the host on" }).click();
const askee = [host, ot];
let asked;
for (let i = 0; i < 20 && !asked; i++) {
  for (const p of askee) if (await p.getByText("The host is leaving. Take over as host?").count()) asked = p;
  if (!asked) await nh.waitForTimeout(300);
}
if (!asked) fail("nobody was asked to take over");
await shot(asked, "leaving-offer");
await asked.getByRole("button", { name: "No thanks" }).click();
let second;
for (let i = 0; i < 20 && !second; i++) {
  const o = askee.find((p) => p !== asked);
  if (await o.getByText("The host is leaving. Take over as host?").count()) second = o;
  else await nh.waitForTimeout(300);
}
if (!second) fail("the next person was not asked");
await second.getByRole("button", { name: "No thanks" }).click();
// everyone said no: first connected player gets the role automatically
let auto;
for (let i = 0; i < 30 && !auto; i++) {
  for (const p of askee) if (await p.locator(".room-code").count()) auto = p;
  if (!auto) await nh.waitForTimeout(300);
}
if (!auto) fail("room was left without a host");
await nh.locator(".room.player").waitFor({ timeout: 10000 });
ok("if everyone says no, the host role is still passed on automatically");
// 5. Host gone: a player can leave straight away
const lone = askee.find((p) => p !== auto);
await auto.context().close();
await lone.getByRole("button", { name: "Leave room" }).click();
await lone.locator("#code").waitFor({ timeout: 8000 });
ok("with no host present a player leaves at once (never stuck)");
console.log("all passed");
await b.close();
