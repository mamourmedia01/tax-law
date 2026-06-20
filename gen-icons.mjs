import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
const exe = execSync("ls /opt/pw-browsers/chromium-*/chrome-linux/chrome", { encoding: "utf8" }).trim();
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

const mark = (bg) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#759EA8"/><stop offset="100%" stop-color="#4E7A85"/></linearGradient></defs>
  ${bg ? `<rect x="0" y="0" width="100" height="100" fill="url(#g)"/>` : `<rect x="2" y="2" width="96" height="96" rx="22" fill="url(#g)"/>`}
  <rect x="42" y="20" width="16" height="60" rx="8" fill="#F2F4F4"/>
  <rect x="20" y="42" width="60" height="16" rx="8" fill="#F2F4F4"/>
</svg>`;

async function render(svg, size, out) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;padding:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
  console.log("wrote", out);
}

await render(mark(false), 192, "public/pwa-192.png");
await render(mark(false), 512, "public/pwa-512.png");
await render(mark(true), 512, "public/pwa-maskable-512.png"); // full-bleed for maskable
await render(mark(false), 180, "public/apple-touch-icon.png");
await browser.close();
console.log("done");
