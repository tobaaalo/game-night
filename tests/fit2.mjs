import { chromium } from "playwright";
const BASE=process.argv[2]||"http://localhost:4173";
const b=await chromium.launch({executablePath:process.env.PW_CHROME});
const page=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await page.goto(BASE+"/who"); await page.getByText("Friends are here").click();
const i=page.locator(".namelist input"); await i.nth(0).fill("Toba"); await i.nth(1).fill("Mimi"); await i.nth(2).fill("Dayo");
await page.getByRole("button",{name:"Pick a game"}).click();
const ov=()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
const btn=(n)=>page.getByRole("button",{name:n}).first();
const vis=(l)=>l.isVisible({timeout:300}).catch(()=>false);
const ids=["world","emoji","proverbs","clues","faces","sports","charades","taboo","name5","bingo","match","wordchain","ladder","draw","npat","nhie","wyr","knowme","likely","twotruths","hotseat"];
for(const id of ids){
  await page.goto(BASE+"/play/"+id); await page.waitForSelector("main");
  const r=[];
  const s=page.getByRole("button",{name:/^Start$/}); if(await vis(s)) await s.click();
  await page.waitForTimeout(500); r.push(await ov());
  if(id==="emoji"||id==="proverbs"){ await btn(/Reveal the answer/).click(); await page.waitForTimeout(500); r.push(await ov()); }
  if(id==="clues"){ await btn(/No guess yet/).click(); await btn(/No guess yet/).click(); await page.waitForTimeout(300); r.push(await ov()); await btn(/Someone guessed/).click().catch(()=>{}); r.push(await ov()); }
  if(id==="charades"||id==="taboo"||id==="name5"){ await btn(/^Start \d+ seconds/).click(); await page.waitForTimeout(400); r.push(await ov()); }
  if(id==="bingo"){ await page.locator(".bingo-cell").first().click(); await page.waitForTimeout(300); r.push(await ov()); }
  if(id==="draw"){ await btn(/Show me the word/).click(); await btn(/Start drawing/).click(); await page.waitForTimeout(300); r.push(await ov()); }
  console.log(id.padEnd(10), JSON.stringify(r));
}
await b.close();
