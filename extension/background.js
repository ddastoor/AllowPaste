// AllowPaste does nothing until you click its toolbar icon (or press its
// keyboard shortcut). That click is what lets it into the current tab - Chrome's
// "activeTab" permission - and only until the tab goes to another page.
//
// The badge on the icon is the record of whether it's on: "ON" while it is, and
// Chrome clears it by itself when the tab goes to another page, which is also
// when the page forgets everything AllowPaste did.

import { setAllowPaste } from "./allow-paste.js";

const LOOKS = {
  on: { text: "ON", color: "#188038", title: "AllowPaste is ON for this page. Click to turn it off." },
  off: { text: "", color: "#188038", title: "AllowPaste: click to allow paste on this page" },
  error: { text: "×", color: "#5f6368", title: "AllowPaste can't run on this page" },
};

async function show(tabId, look, detail) {
  const { text, color, title } = LOOKS[look];
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text }),
    chrome.action.setBadgeBackgroundColor({ tabId, color }),
    chrome.action.setTitle({ tabId, title: detail ? `${title} (${detail})` : title }),
  ]);
}

async function toggle(tab) {
  const turnOn = (await chrome.action.getBadgeText({ tabId: tab.id })) !== LOOKS.on.text;
  try {
    // Every frame of the page we may enter: the page itself and any frames
    // from the same site. Frames from other sites are skipped.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: setAllowPaste,
      args: [turnOn],
    });
    await show(tab.id, turnOn ? "on" : "off");
  } catch (err) {
    // e.g. chrome:// pages and the Chrome Web Store, where no extension may run.
    await show(tab.id, "error", err.message);
  }
}

chrome.action.onClicked.addListener(toggle);
