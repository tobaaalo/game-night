// Room checks with real phones (browser contexts). Usage: node tests/room-e2e.mjs <baseUrl>
import { chromium } from "playwright";
const BASE = process.argv[2];
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
  return { host, mates, code };
}

// 1. Quiz: change answer once, auto reveal, auto next
{
  const { host, mates } = await room(["Dayo", "Femi"]);
  await host.locator(".ticket, .tile", { hasText: "Bible Trivia" }).click();
  await host.getByRole("group", { name: "How many" }).locator(".chip").first().click();
  await host.getByRole("button", { name: /Start with/ }).click();
  const [d, f] = mates;
  await d.locator(".option").first().waitFor({ timeout: 10000 });
  const q1 = await d.locator(".qprompt").textContent();
  await d.locator(".option").nth(0).click();
  await d.locator(".option").nth(1).click(); // change once
  if (
    (await d.locator(".option.mine").count()) !== 1 ||
    !(await d.locator(".option").nth(1).getAttribute("class")).includes("mine")
  )
    fail("change once did not move my pick");
  await d.locator(".option").nth(2).click({ force: true }); // second change must be ignored
  if (!(await d.locator(".option").nth(1).getAttribute("class")).includes("mine"))
    fail("second change should be ignored");
  ok("answer can be changed once");
  await f.locator(".option").nth(0).click();
  // both answered: reveal should come by itself (no host tap), then next question by itself
  await d.locator(".option.right, .option.wrong").first().waitFor({ timeout: 8000 });
  ok("auto reveal when everyone answered");
  await d.waitForFunction((t) => document.querySelector(".qprompt")?.textContent !== t, q1, { timeout: 12000 });
  ok("auto next question without host");
  await host.screenshot({ path: "tests/screens/room-host.png", fullPage: true });
}
// 2. Name 5 and Emoji and Three Clues exist in rooms; Three Clues shows clues one by one
{
  const { host, mates } = await room(["Dayo"]);
  for (const g of ["Name 5 in 10", "Emoji Decode", "Finish the Proverb", "Three Clues"])
    if (!(await host.locator(".ticket, .tile", { hasText: g }).count())) fail(`${g} missing from rooms`);
  ok("more games in rooms");
  await host.locator(".ticket, .tile", { hasText: "Three Clues" }).click();
  await host.getByRole("button", { name: /Start with/ }).click();
  const d = mates[0];
  await d.locator(".clue").first().waitFor({ timeout: 10000 });
  const first = await d.locator(".clue").count();
  await d.waitForFunction(() => document.querySelectorAll(".clue").length >= 2, null, { timeout: 15000 });
  ok(`clues appear one at a time (${first} then more)`);
  await d.screenshot({ path: "tests/screens/clues-player.png", fullPage: true });
  await d.locator(".option").first().click();
  await d.locator(".option.right, .option.wrong").first().waitFor({ timeout: 15000 });
  ok("clue question reveals");
}
// 3. Word ladder race: boards are independent, first to finish wins
{
  const { host, mates } = await room(["Dayo"]);
  await host.locator(".ticket, .tile", { hasText: "Word Ladder" }).click();
  await host.getByRole("button", { name: /Start with/ }).click();
  const d = mates[0];
  await host.locator(".ladder-now").waitFor({ timeout: 10000 });
  await d.locator(".ladder-now").waitFor({ timeout: 10000 });
  const play = async (p, steps) => {
    for (let k = 0; k < steps; k++) {
      const before = (await p.locator(".ltile").allTextContents()).join("").toLowerCase();
      await p.getByRole("button", { name: /Hint/ }).click();
      const hint = ((await p.getByText(/Hint: try/).textContent()).match(/“(\w+)”/) ?? [])[1].toLowerCase();
      const diff = [...before].findIndex((c, i) => c !== hint[i]);
      await p.locator(".ltile").nth(diff).click();
      await p.locator(".lkey", { hasText: new RegExp(`^${hint[diff]}$`, "i") }).click();
      await p.waitForFunction(
        (w) =>
          [...document.querySelectorAll(".ltile")]
            .map((x) => x.textContent)
            .join("")
            .toLowerCase() !== w || !!document.querySelector(".tally"),
        before,
        { timeout: 5000 },
      );
      if (await p.locator(".tally").count()) return;
    }
  };
  await play(host, 1);
  const dayoStart = await d.locator(".ladder li").count();
  if (dayoStart !== 0) fail("Dayo's board changed when the host moved (race boards must be independent)");
  ok("race boards are independent");
  await play(host, 8);
  await d.locator(".tally").waitFor({ timeout: 8000 });
  const txt = await d.locator(".h3").first().textContent();
  ok(`race finishes for both phones: ${txt}`);
  await d.screenshot({ path: "tests/screens/ladder-race-end.png", fullPage: true });
}
await b.close();
