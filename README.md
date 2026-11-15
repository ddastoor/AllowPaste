# AllowPaste

A small personal Chrome extension that lets you paste on sites that block paste
(for example a bank's password field). It does nothing until you click its icon,
and then only on that page.

## Install

1. Get this folder onto your computer (`git clone`, or download it from GitHub as a ZIP).
2. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the **`extension`** folder (not the whole repository).
4. Pin it so the icon is always visible: click the puzzle-piece icon in the toolbar,
   then the pin next to AllowPaste.

It never updates itself. To pick up a newer version, pull or download it again and
click the reload arrow on its card in `chrome://extensions`.

## Use

On a page that won't let you paste, click the AllowPaste icon, or press
**Alt+Shift+V** (Option+Shift+V on a Mac), then paste as usual. You can paste with
Ctrl+V, Cmd+V, Shift+Insert or right-click → Paste.

- A green **ON** badge on the icon means it's on for this page.
- It turns off again when you click once more, reload the page or go to another page.
  If a login asks for your password on a second page, click again there.
- A grey **×** badge means Chrome doesn't let extensions run on this page
  (`chrome://` pages and the Chrome Web Store).

To change the shortcut, go to `chrome://extensions/shortcuts`.

## How it works

Sites block paste with code that listens for the paste, or for Ctrl+V or the
right-click menu, and cancels it. While AllowPaste is on, it hears those events
first and stops them before they reach the site's code. Chrome then pastes as it
normally would. AllowPaste never reads or changes what you paste, and it leaves the
field's normal events alone, so sites still see what you pasted.

All the code is in `extension/`: `allow-paste.js` runs in the page and
`background.js` handles the icon. It's about 100 lines.

## Permissions

- **activeTab:** access to the current tab only when you click the icon or press
  the shortcut, and only until the tab goes to another page.
- **scripting:** lets that click run `allow-paste.js` in the page.

It has no access to any site you haven't clicked it on. It has no clipboard
permission, makes no network requests and stores nothing.

## What it can't do

- **Sites that clear the field after a paste.** Some sites spot the pasted text
  arriving and wipe it. AllowPaste can't stop that without stopping the site from
  seeing your input at all.
- **Login boxes embedded from another website.** A click only lets the extension
  into the page's own site.
- **On-screen keypads and one-box-per-character fields.** These don't take a paste.
- **Short length limits.** If the field is shorter than your password, the paste is cut off.
- **Phones.** Chrome on Android and iPhone doesn't run extensions.
- **Site code that runs first.** It's turned on after the page has loaded, so in
  rare cases a site's own code gets in first and still blocks the paste.

## Try it / test it

`tests/pages/blocked.html` is a page that blocks paste in each of the ways above.
To try it by hand:

```bash
python3 -m http.server 8000 -d tests/pages
```

Then open http://localhost:8000/blocked.html.

To run the automated test, which loads the extension into Chromium and checks every
field with AllowPaste off, on and off again, you need Node.js and Playwright:

```bash
node tests/run.cjs
```

The icons are drawn from `tools/icon.svg`. After changing it, run
`node tools/make-icons.cjs`.
