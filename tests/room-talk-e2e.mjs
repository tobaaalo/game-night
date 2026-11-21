// Room checks with real phones (browser contexts). Usage: node tests/room-e2e.mjs <baseUrl>
import { chromium } from "playwright";
const BASE = process.argv[2];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const phone = async () => (await (await b.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" })).newPage());
const fail = (m) => { console.log("FAIL", m); process.exit(1); };
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
  await host.locator(".joined li").nth(names.length - 1).waitFor();
  return { host, mates, code };
}


// Talking games in rooms: everyone answers on their own phone, the host sees how the room voted.
const cases = [
  ["Never Have I Ever", 2, "I have"],
  ["Would You Rather", 2, "First option"],
  ["Who's Most Likely To", 3, null],
  ["Hot Seat", 1, "Next card"],
  ["Two Truths and a Lie", 3, "Statement 1"],
  ["Couple Questions", 1, "Next card"],
];
for (const [game, nOpts, first] of cases) {
  const { host, mates } = await room(["Dayo", "Femi", "Kemi"]);
  const t = host.locator(".ticket", { hasText: game });
  if (!(await t.count())) fail(`${game} missing from rooms`);
  await t.click();
  await host.getByRole("group", { name: "How many cards" }).locator(".chip").first().click();
  await host.getByRole("button", { name: /Start with/ }).click();
  const d = mates[0];
  await d.locator(".option").first().waitFor({ timeout: 10000 });
  const n = await d.locator(".option").count();
  if (n !== nOpts) fail(`${game}: expected ${nOpts} options, saw ${n}`);
  if (first && (await d.locator(".option").first().innerText()).indexOf(first) < 0) fail(`${game}: first option is not "${first}"`);
  for (const m of mates) await m.locator(".option").first().click();
  await host.locator(".votes").first().waitFor({ timeout: 10000 });
  const votes = await host.locator(".votes").allInnerTexts();
  if (Number(votes[0]) !== 3) fail(`${game}: expected 3 votes on option 1, saw ${votes.join(",")}`);
  ok(`${game}: ${n} options, votes counted (${votes.join("/")})`);
}
await b.close();
console.log("all talking games ok");
