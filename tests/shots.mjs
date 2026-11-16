// Screenshot every screen and state at 375, 768 and 1440px.
// Usage: node tests/shots.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:8787";
const OUT = process.argv[3] ?? "tests/screens";
const WIDTHS = [375, 768, 1440];
const exe = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: exe });
const problems = [];

async function shot(page, w, name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${w}-${name}.png`, fullPage: true });
  // layout checks: horizontal overflow and tiny tap targets
  const issues = await page.evaluate(() => {
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth + 1)
      out.push(`horizontal scroll ${document.documentElement.scrollWidth}>${innerWidth}`);
    for (const el of document.querySelectorAll("button, a, input, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || el.closest(".sr-only") || el.classList.contains("skip")) continue;
      if (el.tagName === "INPUT" && (el.type === "radio" || el.type === "checkbox")) continue;
      if (r.height < 43.5 || r.width < 43.5)
        out.push(
          `small target ${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
        );
    }
    return out;
  });
  for (const i of issues) problems.push(`${w} ${name}: ${i}`);
}

const click = (page, text) => page.getByRole("button", { name: text, exact: false }).first().click();

for (const w of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: w < 500 ? 812 : w < 1000 ? 1024 : 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const step = async (name, fn) => {
    try {
      await fn();
      await shot(page, w, name);
    } catch (e) {
      problems.push(`${w} ${name}: FAILED ${e.message.split("\n")[0]}`);
    }
  };

  await step("01-welcome", async () => page.goto(BASE + "/"));
  await step("02-who", async () => click(page, "Let’s play"));
  await step("03-names", async () => click(page, "Just the two of us"));
  await step("03b-names-filled", async () => {
    const inputs = page.locator(".namelist input");
    await inputs.nth(0).fill("Toba");
    await inputs.nth(1).fill("Mimi");
  });
  await step("04-library-couple", async () => click(page, "Pick a game"));
  await step("05-setup-faces", async () => page.locator(".ticket, .tile", { hasText: "Famous Faces" }).click());
  await step("06-faces-play", async () => {
    await click(page, "Start");
    await page.locator(".frame img").waitFor();
  });
  await step("07-faces-reveal", async () => click(page, "Reveal the answer"));
  await step("08-howto-sheet", async () => page.getByRole("button", { name: "How to play" }).click());
  await page.keyboard.press("Escape");

  await step("09-bible-setup", async () => page.goto(BASE + "/play/bible"));
  await step("10-bible-question", async () => click(page, "Start"));
  await step("11-bible-answered", async () => page.locator(".option").first().click());
  await step("12-world-flag", async () => {
    await page.goto(BASE + "/play/world");
    await click(page, "Start");
    await page.locator(".flagbox img").waitFor();
    const board = await page.locator(".board").first().innerText();
    if (!/\d/.test(board)) problems.push(`${w} scoreboard digits missing: ${JSON.stringify(board)}`);
  });
  await step("13-world-shape", async () => {
    await page.goto(BASE + "/play/world");
    await page.getByText("Country shapes").click();
    await click(page, "Start");
  });
  await step("14-realai", async () => {
    await page.goto(BASE + "/play/realai");
    await click(page, "Start");
    await page.locator(".pair img").first().waitFor();
  });
  await step("15-realai-answered", async () => page.locator(".pair-side.pickable").nth(1).click());
  await step("16-emoji", async () => {
    await page.goto(BASE + "/play/emoji");
    await click(page, "Start");
  });
  await step("17-emoji-reveal", async () => click(page, "Reveal the answer"));
  await step("18-knowme", async () => page.goto(BASE + "/play/knowme"));
  await step("19-wyr", async () => page.goto(BASE + "/play/wyr"));
  await step("20-finish", async () => {
    await page.goto(BASE + "/play/trivia");
    await page.getByText(/^[3-6]$/).first().click();
    await click(page, "Start");
    for (let i = 0; i < 5; i++) {
      await page.locator(".option").first().click();
      await page.locator("#next-btn").click();
    }
  });
  await step("21-make-empty", async () => page.goto(BASE + "/make"));
  await step("22-make-error", async () => click(page, "Save game"));
  await step("23-settings", async () => page.goto(BASE + "/settings"));
  await step("24-menu", async () => page.getByRole("button", { name: "Menu" }).click());
  await page.keyboard.press("Escape");

  // Friends
  await step("25-names-friends", async () => {
    await page.goto(BASE + "/who");
    await click(page, "Friends are here");
    const inputs = page.locator(".namelist input");
    await inputs.nth(0).fill("Toba");
    await inputs.nth(1).fill("Mimi");
    await inputs.nth(2).fill("Dayo");
    await click(page, "Add a player");
    await page.locator(".namelist input").nth(3).fill("Kemi");
  });
  await step("26-library-friends", async () => click(page, "Pick a game"));
  await step("27-charades", async () => {
    await page.goto(BASE + "/play/charades");
    await click(page, "Start 60 seconds");
  });
  await step("27b-new-games-setup", async () => {
    for (const g of ["sports", "hol", "oddone", "years", "nhie", "bingo", "wordchain", "match", "draw", "bucket"]) {
      await page.goto(BASE + "/play/" + g);
      await page.waitForTimeout(300);
      await shot(page, w, "27b-" + g + "-setup");
    }
  });
  await step("27c-new-games-play", async () => {
    for (const g of ["sports", "hol", "oddone", "years", "bingo", "wordchain", "match", "draw"]) {
      await page.goto(BASE + "/play/" + g);
      await click(page, "Start");
      await shot(page, w, "27c-" + g + "-play");
    }
    await page.goto(BASE + "/play/bucket");
    await click(page, "New round");
    await shot(page, w, "27c-bucket-play");
    await page.goto(BASE + "/play/nhie");
    await shot(page, w, "27c-nhie-play");
  });
  await step("28-name5-setup", async () => page.goto(BASE + "/play/name5"));
  await step("29-offline", async () => {
    await ctx.setOffline(true);
    await page.goto(BASE + "/games").catch(() => {});
    await page.evaluate(() => dispatchEvent(new Event("offline")));
  });
  await ctx.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event("online")));
  await step("30-notfound", async () => page.goto(BASE + "/nope"));

  // Room mode
  await step("31-room-intro", async () => page.goto(BASE + "/room"));
  await step("32-room-lobby", async () => {
    await click(page, "Open a room");
    await page.locator(".room-code").waitFor();
  });
  const code =
    (await page
      .locator(".room-code")
      .textContent()
      .catch(() => "")) ?? "";
  const pctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" });
  const p2 = await pctx.newPage();
  try {
    await p2.goto(`${BASE}/join/${code}`);
    if (w === 375) await p2.screenshot({ path: `${OUT}/375-33-join.png`, fullPage: true });
    await p2.locator("#jname").fill("Dayo");
    await p2.getByRole("button", { name: "Join" }).click();
    await p2.getByText("Waiting for the host").waitFor({ timeout: 8000 });
    if (w === 375) await p2.screenshot({ path: `${OUT}/375-34-player-lobby.png`, fullPage: true });
  } catch (e) {
    problems.push(`${w} room join FAILED ${e.message.split("\n")[0]}`);
  }
  await step("35-room-pickgame", async () => page.locator(".joined li").first().waitFor({ timeout: 8000 }));
  await step("36-room-question", async () => {
    await page.locator(".ticket, .tile", { hasText: "Bible Trivia" }).click();
    await page.getByRole("group", { name: "How many" }).locator(".chip").first().click();
    await page.getByRole("button", { name: /Start with/ }).click();
    await page.locator(".room-clock").waitFor({ timeout: 8000 });
  });
  try {
    await p2.locator(".option").first().waitFor({ timeout: 8000 });
    if (w === 375) await p2.screenshot({ path: `${OUT}/375-37-player-question.png`, fullPage: true });
    await p2.locator(".option").nth(1).click();
    await p2.waitForTimeout(800);
    if (w === 375) await p2.screenshot({ path: `${OUT}/375-38-player-reveal.png`, fullPage: true });
  } catch (e) {
    problems.push(`${w} player answer FAILED ${e.message.split("\n")[0]}`);
  }
  await step("39-room-reveal", async () =>
    page.getByRole("button", { name: /Next question|See final/ }).waitFor({ timeout: 8000 }),
  );
  await step("40-room-final", async () => {
    for (let i = 0; i < 6; i++) {
      const b = page.getByRole("button", { name: /Next question|See final|Reveal now/ }).first();
      if (
        await page
          .getByText("Final scores")
          .or(page.getByText("wins!"))
          .isVisible()
          .catch(() => false)
      )
        break;
      await b.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page
        .getByRole("button", { name: "Reveal now" })
        .click({ timeout: 1500 })
        .catch(() => {});
      await page.waitForTimeout(400);
    }
  });
  await step("41-room-close", async () =>
    page.getByRole("button", { name: "End the game for everyone" }).first().click(),
  );
  await pctx.close();
  for (const e of errors) problems.push(`${w} console: ${e.slice(0, 160)}`);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/problems.txt`, problems.join("\n"));
console.log(problems.length ? problems.join("\n") : "no problems");
