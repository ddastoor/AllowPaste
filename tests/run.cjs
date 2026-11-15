// Loads the extension into a real Chromium and checks that each kind of paste
// blocking on tests/pages/blocked.html is beaten while AllowPaste is on, and
// back in place when it's off.
//
//   node tests/run.cjs
//
// Needs Node.js and Playwright (npm install -g playwright, then
// npx playwright install chromium).
//
// A test can't click the toolbar icon, and that click is what gives the
// extension Chrome's "activeTab" permission. So the test runs a copy of the
// extension that already has permission for http://localhost, and calls the
// same function the click calls. Everything else is the extension as shipped.

const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PAGES = path.join(__dirname, "pages");
const SECRET = "correct-horse-battery-staple-7!";

let failures = 0;
function check(ok, what) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
}

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(PAGES, path.basename(new URL(req.url, "http://x").pathname));
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

function testCopyOfExtension(tmp) {
  const dir = path.join(tmp, "extension");
  fs.cpSync(path.join(ROOT, "extension"), dir, { recursive: true });
  const manifestFile = path.join(dir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.host_permissions = ["http://localhost/*"];
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  fs.appendFileSync(path.join(dir, "background.js"), "\nself.testToggle = toggle;\n");
  return dir;
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const url = `http://localhost:${port}/blocked.html`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "allowpaste-test-"));
  const extDir = testCopyOfExtension(tmp);

  const context = await chromium.launchPersistentContext(path.join(tmp, "profile"), {
    channel: "chromium", // Chromium's full headless mode, which can run extensions
    headless: true,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });

  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    check(true, "extension loads");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://localhost:${port}` });

    const page = context.pages()[0] || await context.newPage();

    const activeTabId = () => worker.evaluate(async () =>
      (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
    const badge = async () => worker.evaluate((tabId) => chrome.action.getBadgeText({ tabId }), await activeTabId());
    const clickIcon = async () => worker.evaluate(async (tabId) => {
      await self.testToggle(await chrome.tabs.get(tabId));
    }, await activeTabId());

    const fields = {
      plain: page.locator("#plain"),
      inline: page.locator("#inline"),
      listener: page.locator("#listener"),
      document: page.locator("#document"),
      keys: page.locator("#keys"),
      beforeinput: page.locator("#beforeinput"),
      framework: page.locator("#framework"),
      shadow: page.locator("#shadow-host #inner"),
      sameOriginFrame: page.frameLocator("#same-origin-frame").locator("#framed"),
      crossOriginFrame: page.frameLocator("#cross-origin-frame").locator("#framed"),
    };

    async function pasteInto(field, keys = "ControlOrMeta+V") {
      await field.fill("");
      await field.click();
      await page.keyboard.press(keys);
      return field.inputValue();
    }

    async function load() {
      await page.goto(url);
      await fields.crossOriginFrame.waitFor();
      await fields.sameOriginFrame.waitFor();
      await page.evaluate((text) => navigator.clipboard.writeText(text), SECRET);
    }

    // --- Off: the test page really does block paste -------------------------
    await load();
    check(await badge() === "", "off: no badge");
    check(await pasteInto(fields.plain) === SECRET, "off: normal field pastes");
    for (const name of ["inline", "listener", "document", "keys", "beforeinput", "framework", "shadow",
                        "sameOriginFrame", "crossOriginFrame"]) {
      check(await pasteInto(fields[name]) === "", `off: paste blocked in "${name}"`);
    }
    await page.locator("h1").click({ button: "right" });
    check(await page.evaluate(() => window.blocked.contextmenu) === 1, "off: right-click menu blocked");

    // --- On ------------------------------------------------------------------
    await clickIcon();
    check(await badge() === "ON", "on: badge says ON");
    for (const name of ["plain", "inline", "listener", "document", "keys", "beforeinput", "framework", "shadow",
                        "sameOriginFrame"]) {
      check(await pasteInto(fields[name]) === SECRET, `on: paste works in "${name}"`);
    }
    check(await pasteInto(fields.keys, "Shift+Insert") === SECRET, `on: Shift+Insert works in "keys"`);
    check(await page.evaluate(() => window.frameworkValue) === SECRET,
      "on: framework-style site sees the pasted value");
    check(await pasteInto(fields.crossOriginFrame) === "",
      "on: frame from another site is left alone (expected limit)");

    const before = await page.evaluate(() => ({ ...window.blocked }));
    await page.locator("h1").click({ button: "right" });
    check(await page.evaluate(() => window.blocked.contextmenu) === before.contextmenu,
      "on: right-click menu no longer blocked");
    await page.locator("#listener").evaluate((el) =>
      el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true })));
    check(await page.evaluate(() => window.blocked.listener) === before.listener + 1,
      "on: the page's own made-up events are left alone");

    await clickIcon(); // running it twice in a row must not break anything
    await clickIcon();
    check(await badge() === "ON" && await pasteInto(fields.listener) === SECRET, "on: off-and-on again still works");

    // --- Off again -------------------------------------------------------------
    await clickIcon();
    check(await badge() === "", "off again: badge cleared");
    for (const name of ["listener", "keys", "shadow", "sameOriginFrame"]) {
      check(await pasteInto(fields[name]) === "", `off again: paste blocked again in "${name}"`);
    }

    // --- A new page forgets it -------------------------------------------------
    await clickIcon();
    await load();
    check(await badge() === "", "reload: badge cleared");
    check(await pasteInto(fields.listener) === "", "reload: paste blocked again");

    // --- Pages no extension may touch ----------------------------------------
    await page.goto("chrome://version");
    await clickIcon();
    check(await badge() === "×", "chrome:// page: badge shows it can't run there");
  } catch (err) {
    console.error(err);
    failures++;
  } finally {
    await context.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})();
