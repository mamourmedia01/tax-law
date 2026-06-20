import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
execSync("mkdir -p assets");
const exe = execSync("ls /opt/pw-browsers/chromium-*/chrome-linux/chrome",{encoding:"utf8"}).trim();
const b = await chromium.launch({ executablePath: exe, args:["--no-sandbox"] });
async function render(svg, size, out){
  const p = await b.newPage({ viewport:{width:size,height:size}, deviceScaleFactor:1 });
  await p.setContent(`<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await p.screenshot({ path: out });
  await p.close(); console.log("wrote", out);
}
const mark = (s)=>`<rect x="${s*0.30}" y="${s*0.16}" width="${s*0.10}" height="${s*0.42}" rx="${s*0.05}" fill="#F2F4F4"/>
  <rect x="${s*0.16}" y="${s*0.30}" width="${s*0.42}" height="${s*0.10}" rx="${s*0.05}" fill="#F2F4F4"/>`;
// app icon: full-bleed teal gradient + off-white mark (centered-ish via viewBox)
const icon = (s)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#759EA8"/><stop offset="100%" stop-color="#3C6A75"/></linearGradient></defs>
  <rect width="${s}" height="${s}" fill="url(#g)"/>${mark(s)}</svg>`;
// splash: canvas bg, small centered mark
const splash = (s)=>{const m=s*0.34;const off=(s-m)/2;return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#759EA8"/><stop offset="100%" stop-color="#3C6A75"/></linearGradient></defs>
  <rect width="${s}" height="${s}" fill="#F2F4F4"/>
  <g transform="translate(${off},${off})"><rect width="${m}" height="${m}" rx="${m*0.22}" fill="url(#g)"/>
  <rect x="${m*0.30}" y="${m*0.16}" width="${m*0.10}" height="${m*0.42}" rx="${m*0.05}" fill="#F2F4F4"/>
  <rect x="${m*0.16}" y="${m*0.30}" width="${m*0.42}" height="${m*0.10}" rx="${m*0.05}" fill="#F2F4F4"/></g></svg>`};
await render(icon(1024), 1024, "assets/icon.png");
await render(icon(1024), 1024, "assets/icon-only.png");
await render(splash(2732), 2732, "assets/splash.png");
await render(splash(2732), 2732, "assets/splash-dark.png");
await b.close(); console.log("done");
