import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

const BASE = "http://localhost:4173";
const OUT = "/home/user/tax-law/screenshots";
execSync(`mkdir -p ${OUT}`);

const exe = execSync("ls /opt/pw-browsers/chromium-*/chrome-linux/chrome", { encoding: "utf8" }).trim();

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
const page = await ctx.newPage();

async function shot(path, name, prep) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  if (prep) await prep();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name);
}

// 1. Home
await shot("/", "01-home");

// 2. Search
await shot("/search", "02-search");

// 3. Provider storefront
await shot("/p/jamies-mobile-valet", "03-provider");

// 4. Booking flow — step 1 (services). Pre-seed a selection by clicking a service.
await page.goto(BASE + "/p/jamies-mobile-valet/book", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.getByText("Full Valet").first().click().catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/04-book-services.png` });
console.log("captured 04-book-services");

// 5. Booking flow — step 2 (date & time)
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/05-book-datetime.png` });
console.log("captured 05-book-datetime");

// 6. pick a time and go to details
await page.locator("button:not([disabled])", { hasText: /AM|PM/ }).first().click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(400);
await page.fill('input[placeholder="Alex Morgan"]', "Sam Patel");
await page.fill('input[placeholder="07700 900123"]', "07700 900456");
await page.fill('input[placeholder="alex@example.com"]', "sam@example.com");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/06-book-details.png` });
console.log("captured 06-book-details");

// 7. review
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/07-book-review.png` });
console.log("captured 07-book-review");

// 8. confirmation
await page.getByRole("button", { name: "Confirm booking" }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/08-confirmed.png` });
console.log("captured 08-confirmed");

// 9. bookings list
await shot("/bookings", "09-bookings");

// 10. profile
await shot("/profile", "10-profile");

await browser.close();
console.log("done");
