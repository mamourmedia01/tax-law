import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
const OUT = "/home/user/tax-law/screenshots";
execSync(`mkdir -p ${OUT}`);
const exe = execSync("ls /opt/pw-browsers/chromium-*/chrome-linux/chrome", { encoding: "utf8" }).trim();
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = "http://localhost:5173";
const shot = async (n) => { await wait(500); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("captured", n); };

await page.goto(`${B}/help`, { waitUntil: "domcontentloaded" }); await wait(700); await shot("w1-help");
await page.goto(`${B}/legal/privacy`, { waitUntil: "domcontentloaded" }); await wait(700); await shot("w1-privacy");
await page.goto(`${B}/p/gleamworks-detailing`, { waitUntil: "domcontentloaded" }); await wait(900); await shot("w1-themed-storefront");

// voice demo: sign in as fleet provider via profile, then open /voice
await page.goto(`${B}/profile`, { waitUntil: "domcontentloaded" }); await wait(600);
await page.fill('input[placeholder="Mobile or email"]', "gleamworks-detailing@provider.fableplus");
await page.getByRole("button", { name: "Send code" }).click(); await wait(900);
const t = await page.locator("text=Sandbox code").first().innerText();
const code = (t.match(/(\d{6})/) || [])[1];
await page.fill('input[placeholder="••••••"]', code);
await page.getByRole("button", { name: "Verify" }).click(); await wait(900);
await page.goto(`${B}/voice`, { waitUntil: "domcontentloaded" }); await wait(600);
await page.getByText("How much is a full valet?").click(); await wait(1200);
await shot("w1-voice");
await browser.close();
console.log("done");
