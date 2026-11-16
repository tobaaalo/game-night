// Two phones, one ladder. Usage: node tests/team-e2e.mjs <baseUrl> <free|turns>
import { chromium } from "playwright";
const BASE = process.argv[2], MODE = process.argv[3] ?? "turns";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const host = await (await b.newContext({ viewport: { width: 375, height: 812 } })).newPage();
const mate = await (await b.newContext({ viewport: { width: 375, height: 812 } })).newPage();
const fail = (m) => { console.log("FAIL", m); process.exit(1); };
await host.goto(BASE + "/room");
await host.getByRole("button", { name: "Open a room" }).click();
await host.locator(".room-code").waitFor();
const code = (await host.locator(".room-code").textContent()).replace(/\s/g, "");
await mate.goto(`${BASE}/join/${code}`);
await mate.locator("#jname").fill("Dayo");
await mate.getByRole("button", { name: "Join" }).click();
await host.locator(".joined li").first().waitFor();
await host.locator(".ticket", { hasText: "Word Ladder" }).click();
await host.getByText(MODE === "free" ? "Both at once" : "Take turns").click();
await host.screenshot({ path: "tests/screens/team-setup.png", fullPage: true });
await host.getByRole("button", { name: /Start with/ }).click();
await host.locator(".ladder-now").waitFor({ timeout: 10000 });
await mate.locator(".ladder-now").waitFor({ timeout: 10000 });
const start = (await host.locator(".ltile").allTextContents()).join("").toLowerCase();
const same = (await mate.locator(".ltile").allTextContents()).join("").toLowerCase();
if (start !== same) fail(`boards differ ${start} ${same}`);
// find a legal next word via the app's own hint
await host.getByRole("button", { name: /Hint/ }).click();
await mate.getByText(/Hint: try/).waitFor({ timeout: 5000 });
const hint = ((await mate.getByText(/Hint: try/).textContent()).match(/“(\w+)”/) ?? [])[1].toLowerCase();
const diff = [...start].findIndex((c, i) => c !== hint[i]);
const mover = MODE === "free" ? mate : host; // host starts in turns mode
const other = mover === host ? mate : host;
if (MODE === "turns") {
  if ((await mate.locator(".ltile").first().isEnabled())) fail("partner tile should be locked");
}
await mover.locator(".ltile").nth(diff).click();
if (MODE === "free") await host.locator(".ltile.theirs").waitFor({ timeout: 5000 });
await mover.locator(".lkey", { hasText: new RegExp(`^${hint[diff]}$`, "i") }).click();
await other.locator(".ladder li", { hasText: new RegExp(`^${start}$`, "i") }).waitFor({ timeout: 5000 });
if (MODE === "turns") await mate.locator(".turnbar.mine").waitFor({ timeout: 5000 });
await mover.screenshot({ path: `tests/screens/team-${MODE}-a.png`, fullPage: true });
await other.screenshot({ path: `tests/screens/team-${MODE}-b.png`, fullPage: true });
console.log("ok", MODE, code);
await b.close();
