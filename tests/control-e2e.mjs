// A second phone takes over the host controls through the control link.
import { chromium } from "playwright";
const BASE = process.argv[2];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const fail = (m) => {
  console.log("FAIL " + m);
  process.exit(1);
};
const c1 = await b.newContext({ viewport: { width: 1000, height: 800 } });
const host = await c1.newPage();
await host.goto(`${BASE}/room`, { waitUntil: "networkidle" });
await host.getByRole("button", { name: /Open a room/ }).click();
await host
  .getByText(/in the room|Waiting for players/)
  .first()
  .waitFor({ timeout: 15000 });
const hr = await host.evaluate(() => JSON.parse(localStorage.getItem("gn.hostroom")));
const c2 = await b.newContext({ viewport: { width: 375, height: 700 } });
const phone = await c2.newPage();
await phone.goto(`${BASE}/room?host=${hr.code}.${hr.hostKey}`, { waitUntil: "networkidle" });
await phone
  .getByText(hr.code.split("").join(""))
  .first()
  .waitFor({ timeout: 15000 })
  .catch(() => fail("phone did not show room " + hr.code));
if (!(await phone.getByRole("button", { name: /Control from a phone|Control link copied/ }).count()))
  fail("phone has no host controls");
if (phone.url().includes("host=")) fail("key left in the address bar");
console.log("ok control link hands over the host screen for room " + hr.code);
await b.close();
