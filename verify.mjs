import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
const OUT = "/home/user/tax-law/screenshots";
execSync(`mkdir -p ${OUT}`);
const exe = execSync("ls /opt/pw-browsers/chromium-*/chrome-linux/chrome", { encoding: "utf8" }).trim();
const B = "http://localhost:5173";
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(`[console] ${m.text()}`); });
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

async function shot(name, path) {
  if (path) { await page.goto(B + path, { waitUntil: "domcontentloaded" }); await wait(800); }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name);
}
async function code(label) {
  const t = await page.locator(`text=${label}`).first().innerText();
  return (t.match(/(\d{6})/) || [])[1];
}

// --- sign in a customer via Profile ---
await page.goto(`${B}/profile`, { waitUntil: "domcontentloaded" }); await wait(600);
await page.fill('input[placeholder="Mobile or email"]', "verify@example.com");
await page.getByRole("button", { name: "Send code" }).click(); await wait(800);
await page.fill('input[placeholder="••••••"]', await code("Sandbox code"));
await page.getByRole("button", { name: "Verify" }).click(); await wait(900);
// claim name
const pencil = page.locator('button[aria-label="Edit profile"]');
if (await pencil.count()) { await pencil.click(); await wait(300);
  await page.fill('input[placeholder="Full name"]', "Verify Tester"); await page.getByRole("button",{name:"Save"}).click(); await wait(500); }
await shot("v-profile");

// --- redeem a gift card so wallet > 0 ---
const buy = page.getByText("Buy a £25 gift card for a friend");
if (await buy.count()) {
  await buy.click(); await wait(700);
  const msg = await page.locator("text=Gift card created").first().innerText().catch(()=> "");
  const gc = (msg.match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/) || [])[0];
  if (gc) { await page.fill('input[placeholder="Gift card code"]', gc); await page.getByRole("button",{name:"Redeem"}).click(); await wait(700); }
}
await shot("v-wallet");

// --- garage: add a vehicle ---
await page.goto(`${B}/garage`, { waitUntil: "domcontentloaded" }); await wait(600);
await page.fill('input[placeholder="AB12 CDE"]', "VER1234");
await page.locator('button.btn-primary').first().click(); await wait(900);
await shot("v-garage");

// --- vehicle check ---
await page.goto(`${B}/vehicle`, { waitUntil: "domcontentloaded" }); await wait(400);
await page.fill('input[placeholder="AB12 CDE"]', "VER1234"); await page.getByRole("button",{name:"Check"}).click(); await wait(800);
await shot("v-vehicle");

// --- full booking with recurring + vehicle ---
await page.goto(`${B}/p/sparkle-on-wheels/book`, { waitUntil: "domcontentloaded" }); await wait(700);
await page.locator('button[aria-pressed]').first().click(); // pick a service
await page.getByRole("button", { name: "Continue" }).click(); await wait(700);
await page.locator("button:not([disabled])").filter({ hasText: /AM|PM/ }).first().click();
await page.getByRole("button", { name: "Continue" }).click(); await wait(500);
// details step — already identified (logged in) so Continue
await page.getByRole("button", { name: "Continue" }).click(); await wait(500);
// review: tick recurring, screenshot
const rc = page.getByText("Repeat weekly");
if (await rc.count()) await rc.click();
await shot("v-book-review");
await page.getByRole("button", { name: "Confirm booking" }).click(); await wait(1200);
await shot("v-book-confirmed");

// apply credit on the new booking
const applyBtn = page.getByRole("button", { name: /Apply wallet credit/ });
if (await applyBtn.count()) { await applyBtn.click(); await wait(700); }
await shot("v-booking-detail");

// --- bookings list ---
await shot("v-bookings", "/bookings");

// --- public content routes ---
for (const [n, p] of [["v-business","/business"],["v-concierge","/concierge"],["v-notifications","/notifications"],
  ["v-regulations","/legal/regulations"],["v-guide-provider","/guide/provider"]]) { await shot(n, p); }

// --- provider dashboard (sign out, sign in as growth provider) ---
await page.goto(`${B}/profile`, { waitUntil: "domcontentloaded" }); await wait(500);
const so = page.getByRole("button", { name: "Sign out" }); if (await so.count()) { await so.click(); await wait(600); }
await page.goto(`${B}/profile`, { waitUntil: "domcontentloaded" }); await wait(400);
await page.fill('input[placeholder="Mobile or email"]', "jamies-mobile-valet@provider.fableplus");
await page.getByRole("button", { name: "Send code" }).click(); await wait(800);
await page.fill('input[placeholder="••••••"]', await code("Sandbox code"));
await page.getByRole("button", { name: "Verify" }).click(); await wait(900);
await page.goto(`${B}/dashboard`, { waitUntil: "domcontentloaded" }); await wait(1200);
await shot("v-dashboard-top");
await page.evaluate(() => window.scrollTo(0, 900)); await wait(500); await shot("v-dashboard-mid");
await page.evaluate(() => window.scrollTo(0, 1800)); await wait(500); await shot("v-dashboard-low");
await page.evaluate(() => window.scrollTo(0, 3000)); await wait(500); await shot("v-dashboard-bottom");

await browser.close();
console.log("\n=== CONSOLE/PAGE ERRORS ===");
console.log(errors.length ? errors.join("\n") : "none");
