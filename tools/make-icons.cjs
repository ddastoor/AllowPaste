// Draws extension/icons/icon{16,32,48,128}.png from tools/icon.svg.
// Chrome needs PNG icons; run this again after changing the SVG:
//   node tools/make-icons.cjs
// Needs Node.js and Playwright (npm install -g playwright, then npx playwright install chromium).

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const svg = fs.readFileSync(path.join(__dirname, "icon.svg"), "utf8");
const outDir = path.join(__dirname, "..", "extension", "icons");

(async () => {
  const browser = await chromium.launch();
  try {
    for (const size of [16, 32, 48, 128]) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      const src = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}</style>` +
        `<img src="${src}" width="${size}" height="${size}" style="display:block">`);
      await page.locator("img").evaluate((img) => img.decode());
      await page.screenshot({ path: path.join(outDir, `icon${size}.png`), omitBackground: true });
      await page.close();
      console.log(`icon${size}.png`);
    }
  } finally {
    await browser.close();
  }
})();
