import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

const BASE = "http://localhost:5173";
const OUT = "/home/user/tax-law/screenshots";
execSync(`mkdir -p ${OUT}`);
const exe = execSync("ls /opt/pw-browsers/chromium-*/chrome-linux/chrome", { encoding: "utf8" }).trim();

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await wait(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name);
};

async function goto(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await wait(600);
}

// 1. Home, 2. Search, 3. Provider
await goto("/");
await shot("01-home");
await goto("/search");
await shot("02-search");
await goto("/p/jamies-mobile-valet");
await shot("03-provider");

// 4-8. Booking flow
await goto("/p/jamies-mobile-valet/book");
await page.getByText("Full Valet").first().click();
await shot("04-book-services");
await page.getByRole("button", { name: "Continue" }).click();
await wait(800);
await page.locator("button:not([disabled])").filter({ hasText: /AM|PM/ }).first().click();
await shot("05-book-datetime");
await page.getByRole("button", { name: "Continue" }).click();
await wait(500);
// details + OTP
await page.fill('input[placeholder="Alex Morgan"]', "Sam Patel");
await page.fill('input[placeholder="07700 900123 or alex@example.com"]', "sam@example.com");
await shot("06-book-details");
await page.getByRole("button", { name: "Send code" }).click();
await wait(900);
const codeText = await page.locator("text=your code is").first().innerText();
const code = (codeText.match(/(\d{6})/) || [])[1];
console.log("read sandbox code:", code);
await page.fill('input[aria-label="One-time code"]', code);
await shot("07-book-otp");
await page.getByRole("button", { name: "Verify & continue" }).click();
await wait(900);
await page.getByRole("button", { name: "Continue" }).click();
await wait(500);
await shot("08-book-review");
await page.getByRole("button", { name: "Confirm booking" }).click();
await wait(1200);
await shot("09-confirmed");

// 10. Booking detail with pay (navigate back to it)
await goto("/bookings");
await shot("10-bookings");
await page.locator("a[href^='/booking/']").first().click();
await wait(800);
await page.getByRole("button", { name: /Pay in app/ }).click();
await wait(900);
await shot("11-booking-paid");

// 12. Profile (signed in)
await goto("/profile");
await shot("12-profile");

// 13. Provider dashboard — sign out, sign in as provider
await page.getByRole("button", { name: "Sign out" }).click().catch(() => {});
await wait(600);
await goto("/profile");
await page.fill('input[placeholder="Mobile or email"]', "jamies-mobile-valet@provider.fableplus");
await page.getByRole("button", { name: "Send code" }).click();
await wait(900);
const pText = await page.locator("text=Sandbox code").first().innerText();
const pcode = (pText.match(/(\d{6})/) || [])[1];
console.log("provider code:", pcode);
await page.fill('input[placeholder="••••••"]', pcode);
await page.getByRole("button", { name: "Verify" }).click();
await wait(900);
await goto("/dashboard");
await shot("13-dashboard");

await browser.close();
console.log("done");
