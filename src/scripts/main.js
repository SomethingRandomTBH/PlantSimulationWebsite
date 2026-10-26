(() => {
  "use strict";

  const STORAGE_KEY = "botanists-theme";
  const DARK = "dark";
  const LIGHT = "light";

  // 1. Apply the saved theme immediately before first paint to prevent FOUC.
  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === DARK || saved === LIGHT) {
        return saved;
      }
    } catch (error) {
      // Fall back to system preference.
    }

    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? DARK
        : LIGHT;
    } catch (error) {
      return LIGHT;
    }
  }

  const initialTheme = getSavedTheme();
  document.documentElement.dataset.theme = initialTheme;

  function applyTheme(theme) {
    const selectedTheme = theme === DARK ? DARK : LIGHT;
    document.documentElement.dataset.theme = selectedTheme;

    const toggle = document.getElementById("theme-toggle");
    if (toggle) {
      toggle.checked = selectedTheme === DARK;
      toggle.setAttribute("aria-checked", String(selectedTheme === DARK));
    }

    try {
      localStorage.setItem(STORAGE_KEY, selectedTheme);
    } catch (error) {
      // Theme still works for the current page without storage.
    }

    window.dispatchEvent(
      new CustomEvent("botanists:themechange", {
        detail: { theme: selectedTheme }
      })
    );
  }

  function bindExistingThemeControl() {
    const toggle = document.getElementById("theme-toggle");
    if (!toggle || toggle.dataset.boundTheme === "true") {
      return;
    }

    const current = document.documentElement.dataset.theme || getSavedTheme();
    toggle.checked = current === DARK;
    toggle.setAttribute("aria-checked", String(toggle.checked));
    toggle.dataset.boundTheme = "true";

    toggle.addEventListener("change", () => {
      applyTheme(toggle.checked ? DARK : LIGHT);
    });
  }

  // 2. Load the modular ES application bootstrap relative to this script.
  const currentScript = document.currentScript;
  const scriptBase = currentScript && currentScript.src
    ? new URL(".", currentScript.src).href
    : window.location.href;

  function initialize() {
    bindExistingThemeControl();
    if (window.location.protocol !== "file:") {
      import(new URL("./core/init.js", scriptBase).href).catch(() => {
        bindExistingThemeControl();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
