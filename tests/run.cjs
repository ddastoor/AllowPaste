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
const { spawnSync } = require("child_process");
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

// --- No clipboard access ------------------------------------------------------
// AllowPaste must never be able to see what you copy or paste. These checks
// fail (and so block a release) if a change ever gives it a way to.
// The words are banned in comments too, so that nothing can hide behind a comment.
const BANNED = /clipboard|getData|readText|execCommand|dataTransfer|getSelection|\.value\b|innerText|textContent|innerHTML|\bfetch\b|XMLHttpRequest|WebSocket|sendBeacon|postMessage|sendMessage|storage|indexedDB|offscreen|world\s*:/gi;
// Everything the code may read from an event: what kind of event, and which keys.
const EVENT_READS = ["isTrusted", "type", "inputType", "key", "code", "ctrlKey", "metaKey", "altKey", "shiftKey",
                     "stopImmediatePropagation"];

function checkNoClipboardAccess() {
  const dir = path.join(ROOT, "extension");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  check(JSON.stringify(manifest.permissions) === '["activeTab","scripting"]',
    `no clipboard: manifest asks only for activeTab and scripting (asks for: ${manifest.permissions})`);
  const allowedKeys = ["action", "background", "commands", "description", "icons", "manifest_version", "name",
                       "permissions", "version"];
  const extra = Object.keys(manifest).filter((k) => !allowedKeys.includes(k));
  check(extra.length === 0, "no clipboard: manifest has no other way to get access" + (extra.length ? ` (found: ${extra})` : ""));

  const jsFiles = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(".js"));
  check(jsFiles.length === 2, `no clipboard: extension has exactly the 2 code files reviewed (${jsFiles})`);
  for (const file of jsFiles) {
    const code = fs.readFileSync(path.join(dir, file), "utf8");
    const banned = code.match(BANNED) || [];
    check(banned.length === 0, `no clipboard: ${file} uses no clipboard, page-text, network or storage feature` +
      (banned.length ? ` (found: ${[...new Set(banned)]})` : ""));
    const reads = [...code.matchAll(/\b(?:event|e)\s*\.\s*([A-Za-z_$]+)/g)].map((m) => m[1]);
    const odd = reads.filter((r) => !EVENT_READS.includes(r));
    const computed = /\b(?:event|e)\s*\[/.test(code);
    check(odd.length === 0 && !computed, `no clipboard: ${file} reads only an event's type and keys` +
      (odd.length || computed ? ` (also reads: ${[...new Set(odd)]}${computed ? " [computed]" : ""})` : ""));
  }
}

// Runs inside the extension's own private view of the page (the same one AllowPaste
// runs in) and counts every attempt from there to look at pasted or copied data,
// call a clipboard function, or read a field.
function clipboardSpy() {
  if (globalThis.__touches) return;
  const touches = (globalThis.__touches = []);
  const getter = (proto, prop) => {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (d && d.get) Object.defineProperty(proto, prop, { ...d, get() { touches.push(prop); return d.get.call(this); } });
  };
  const method = (proto, name) => {
    const f = proto[name];
    if (typeof f === "function") proto[name] = function (...args) { touches.push(name); return f.apply(this, args); };
  };
  getter(ClipboardEvent.prototype, "clipboardData");
  getter(InputEvent.prototype, "data");
  getter(InputEvent.prototype, "dataTransfer");
  getter(DragEvent.prototype, "dataTransfer");
  for (const p of ["items", "files", "types"]) getter(DataTransfer.prototype, p);
  method(DataTransfer.prototype, "getData");
  getter(Navigator.prototype, "clipboard");
  for (const m of ["read", "readText", "write", "writeText"]) method(Clipboard.prototype, m);
  method(Document.prototype, "execCommand");
  method(Document.prototype, "getSelection");
  getter(HTMLInputElement.prototype, "value");
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
  const zipCheck = spawnSync("python3", [path.join(ROOT, "tools", "make-zip.py"), "--check"], { encoding: "utf8" });
  check(zipCheck.status === 0, "AllowPaste.zip matches extension/" +
    (zipCheck.status === 0 ? "" : ` (${(zipCheck.stdout + zipCheck.stderr).trim()})`));
  checkNoClipboardAccess();

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
    const granted = await worker.evaluate(() => chrome.permissions.getAll());
    check(JSON.stringify(granted.permissions.sort()) === '["activeTab","scripting"]',
      `no clipboard: Chrome gave the extension only activeTab and scripting (gave: ${granted.permissions})`);
    check(await worker.evaluate(() => typeof navigator.clipboard) === "undefined",
      "no clipboard: the extension's background part has no clipboard to reach");
    // Lets the test page put text on the clipboard. No page or extension gets to read it.
    await context.grantPermissions(["clipboard-write"], { origin: `http://localhost:${port}` });

    const page = context.pages()[0] || await context.newPage();

    const activeTabId = () => worker.evaluate(async () =>
      (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
    const badge = async () => worker.evaluate((tabId) => chrome.action.getBadgeText({ tabId }), await activeTabId());
    const clickIcon = async () => worker.evaluate(async (tabId) => {
      await self.testToggle(await chrome.tabs.get(tabId));
    }, await activeTabId());
    // Runs a function in the extension's own view of every frame it can reach; returns one result per frame.
    const inExtensionView = async (func) => worker.evaluate(`(async () => {
      const results = await chrome.scripting.executeScript({
        target: { tabId: ${await activeTabId()}, allFrames: true }, func: ${func.toString()},
      });
      return results.map((r) => r.result);
    })()`);

    const fields = {
      plain: page.locator("#plain"),
      inline: page.locator("#inline"),
      listener: page.locator("#listener"),
      document: page.locator("#document"),
      keys: page.locator("#keys"),
      pageKeys: page.locator("#page-keys"),
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
    for (const name of ["inline", "listener", "document", "keys", "pageKeys", "beforeinput", "framework", "shadow",
                        "sameOriginFrame", "crossOriginFrame"]) {
      check(await pasteInto(fields[name]) === "", `off: paste blocked in "${name}"`);
    }
    await page.locator("h1").click({ button: "right" });
    check(await page.evaluate(() => window.blocked.contextmenu) === 1, "off: right-click menu blocked");

    // --- On ------------------------------------------------------------------
    await clickIcon();
    check(await badge() === "ON", "on: badge says ON");
    await inExtensionView(clipboardSpy);
    for (const name of ["plain", "inline", "listener", "document", "keys", "pageKeys", "beforeinput", "framework", "shadow",
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

    const touches = await inExtensionView(() => globalThis.__touches);
    check(touches.length === 2 && touches.every((t) => Array.isArray(t) && t.length === 0),
      `no clipboard: during all those pastes the extension never looked at pasted data or the clipboard ` +
      `(${touches.length} frames, touches: ${JSON.stringify(touches)})`);
    const control = await inExtensionView(() => {
      void new ClipboardEvent("paste", { clipboardData: new DataTransfer() }).clipboardData;
      return globalThis.__touches.length;
    });
    check(control.every((n) => n === 1), "no clipboard: (the counter does notice when something looks)");

    await clickIcon(); // running it twice in a row must not break anything
    await clickIcon();
    check(await badge() === "ON" && await pasteInto(fields.listener) === SECRET, "on: off-and-on again still works");

    // --- Off again -------------------------------------------------------------
    await clickIcon();
    check(await badge() === "", "off again: badge cleared");
    for (const name of ["listener", "keys", "pageKeys", "shadow", "sameOriginFrame"]) {
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
