// Discourages copying photos from pages that show client work: no context menu,
// no dragging or saving, and the page is cleared when developer tools are opened.
// This is a deterrent only. Anything the browser downloads can still be captured,
// so real protection has to come from what the server sends.
(() => {
  const editable = (target) => target instanceof Element
    && Boolean(target.closest("input, textarea, select, [contenteditable]"));

  let locked = false;
  function lock() {
    if (locked) return;
    locked = true;
    try {
      document.documentElement.innerHTML = "";
      window.stop();
    } catch { /* The navigation below still leaves the page. */ }
    // Scripts can only close windows they opened; leaving the page is the closest equivalent.
    window.close();
    location.replace("about:blank");
  }

  document.addEventListener("contextmenu", (event) => {
    if (!editable(event.target)) event.preventDefault();
  });
  document.addEventListener("dragstart", (event) => {
    if (!editable(event.target)) event.preventDefault();
  });

  document.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    const devtools = key === "f12"
      || (command && event.shiftKey && ["i", "j", "c", "k"].includes(key))
      || (event.metaKey && event.altKey && ["i", "j", "c", "u"].includes(key))
      || (command && key === "u");
    if (devtools) {
      event.preventDefault();
      event.stopPropagation();
      lock();
      return;
    }
    if (command && ["s", "p"].includes(key)) event.preventDefault();
  }, true);

  // Developer tools opened from the browser menu pause on this statement; the
  // pause is what gives them away. Nothing happens while they are closed.
  setInterval(() => {
    const started = performance.now();
    debugger;
    if (performance.now() - started > 500) lock();
  }, 1000);
})();
