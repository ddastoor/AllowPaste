// The part of AllowPaste that runs inside the web page.
//
// Chrome copies this one function into each frame of the tab and runs it there,
// in the extension's own private view of the page (the page's scripts can't see
// or change it). So it must not use anything defined outside the function.
//
// How it works: a site blocks paste by listening for it (the paste itself,
// Ctrl+V, or the right-click menu) and cancelling it. We listen first - on the
// window, in the "capture" phase, which runs before the listeners on the
// page's fields - and stop the event from going any further. The site's code
// never hears about it, so it can't cancel it, and Chrome pastes as usual.
//
// We never cancel anything ourselves, and we leave the "input" event alone:
// that is how sites (React, Angular, ...) notice what's in a field. Stopping it
// would leave the field looking filled while the site thinks it is empty.
//
// Returns whether AllowPaste is now on in this frame.
export function setAllowPaste(on) {
  const EVENTS = ["paste", "beforeinput", "keydown", "keyup", "contextmenu"];
  const state = (globalThis.__allowPaste ??= { on: false, listener: null });
  if (on === state.on) return on;

  if (on) {
    state.listener = (event) => {
      if (!event.isTrusted) return; // only real user actions, never the page's own made-up events
      if (event.type === "beforeinput" && !event.inputType.startsWith("insertFromPaste")) return;
      if (event.type.startsWith("key") && !isPasteKey(event)) return;
      event.stopImmediatePropagation();
    };
    for (const type of EVENTS) window.addEventListener(type, state.listener, true);
  } else {
    for (const type of EVENTS) window.removeEventListener(type, state.listener, true);
    state.listener = null;
  }
  state.on = on;
  return on;

  // Ctrl+V / Cmd+V (also with Shift: paste as plain text) and Shift+Insert.
  // e.code catches V on non-Latin keyboard layouts too.
  function isPasteKey(e) {
    const v = e.key === "v" || e.key === "V" || e.code === "KeyV";
    return (v && (e.ctrlKey || e.metaKey) && !e.altKey) ||
           (e.key === "Insert" && e.shiftKey && !e.ctrlKey && !e.metaKey);
  }
}
