# AllowPaste

A small personal Chrome extension that lets you paste on sites that block paste
(for example a bank's password field). It does nothing until you click its icon,
and then only on that page. It never sees what you paste (see [Clipboard](#clipboard)).

## Install (or reinstall on a new computer)

1. Download **[AllowPaste.zip](https://github.com/ddastoor/AllowPaste/releases/latest/download/AllowPaste.zip)**.
   This link always gives the newest version.
2. Unzip it into a folder you'll keep, such as Documents. Chrome loads the extension
   from that folder every time it starts, so don't leave it in Downloads where it
   might get cleaned up.
3. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the **AllowPaste** folder: the one with
   `manifest.json` directly inside it. (Windows' "Extract All" can put it one level
   down, in `AllowPaste\AllowPaste`.)
5. Pin it so the icon is always visible: click the puzzle-piece icon in the toolbar,
   then the pin next to AllowPaste.

Chrome doesn't sync extensions loaded this way, so do this once on each computer
(and in each Chrome profile you want it in).

**To update:** download the zip again, replace the files in your AllowPaste folder
with the new ones, then click the reload arrow on AllowPaste's card in
`chrome://extensions`. It never updates itself.

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
normally would. AllowPaste leaves the field's normal events alone, so the site
still sees what you pasted.

All the code is in `extension/`: `allow-paste.js` runs in the page and
`background.js` handles the icon. It's about 90 lines.

## Clipboard

AllowPaste has no access to your clipboard, and it never looks at what you paste.

- **No clipboard permission.** It asks Chrome for only two permissions:
  - **activeTab:** access to the current tab only when you click the icon or press
    the shortcut, and only until the tab goes to another page.
  - **scripting:** lets that click run `allow-paste.js` in the page.

  Without the clipboard permissions, Chrome won't let an extension read the clipboard.
- **It never reads what you paste.** When you paste, the pasted text travels with the
  paste event to any code on the page that's listening, including the bank's own code.
  AllowPaste does listen to that event, but it reads only what kind of event it is and
  which keys were pressed. It never reads the text.
- **No network, no storage.** It makes no network requests and stores nothing, so
  there's nowhere for anything to go.

The tests enforce all of this and fail, which also blocks a release, if any change
ever:

- asks for another permission,
- uses any clipboard, page-text, network or storage feature,
- reads anything from an event besides its kind and keys, or
- looks at pasted data while you paste.

That last check counts every attempt from inside the extension during real pastes;
the count must be zero.

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
field with AllowPaste off, on and off again, plus the clipboard checks above, you need
Node.js, Python 3 and Playwright:

```bash
node tests/run.cjs
```

## Publishing a new version

1. Change the files in `extension/` and raise the `"version"` in `extension/manifest.json`.
2. Rebuild the zip, then run the tests:

   ```bash
   python3 tools/make-zip.py
   ```

   ```bash
   node tests/run.cjs
   ```

3. Merge into `main`. GitHub Actions (`.github/workflows/release.yml`) runs the tests
   again and publishes a release named after the version, with `AllowPaste.zip`
   attached. The download link above then gives the new version.

`AllowPaste.zip` in the repository is that same installable zip; the tests check that
it matches `extension/`.

The icons are drawn from `tools/icon.svg`. After changing it, run
`node tools/make-icons.cjs`.
