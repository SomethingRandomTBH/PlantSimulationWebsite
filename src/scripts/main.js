(() => {
  "use strict";

  const STORAGE_KEY = "botanists-theme";
  const DARK = "dark";
  const LIGHT = "light";

  // Apply the saved theme immediately, before the browser renders the page.
  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved === DARK || saved === LIGHT) {
        return saved;
      }
    } catch (error) {
      // Fall back to the system preference.
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
      toggle.setAttribute(
        "aria-checked",
        String(selectedTheme === DARK)
      );
    }

    try {
      localStorage.setItem(STORAGE_KEY, selectedTheme);
    } catch (error) {
      // The theme still works for the current page without storage.
    }
  }

  function createThemeControl() {
    let toggle = document.getElementById("theme-toggle");

    if (toggle) {
      return toggle;
    }

    const header = document.querySelector("header, .site-header");

    if (!header) {
      return null;
    }

    const control = document.createElement("div");
    control.className = "theme-control";

    const label = document.createElement("label");
    label.className = "theme-switch";
    label.htmlFor = "theme-toggle";

    const labelText = document.createElement("span");
    labelText.className = "theme-switch-label";
    labelText.textContent = "Dark mode";

    toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.id = "theme-toggle";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", "Toggle dark mode");

    const track = document.createElement("span");
    track.className = "theme-switch-track";
    track.setAttribute("aria-hidden", "true");

    const thumb = document.createElement("span");
    thumb.className = "theme-switch-thumb";

    track.appendChild(thumb);
    label.append(labelText, toggle, track);
    control.appendChild(label);

    const nav = header.querySelector("nav, .site-nav");

    if (nav) {
      nav.insertAdjacentElement("afterend", control);
    } else {
      header.appendChild(control);
    }

    return toggle;
  }

  function initializeTheme() {
    const initialTheme = getSavedTheme();

    document.documentElement.dataset.theme = initialTheme;

    const toggle = createThemeControl();

    if (!toggle) {
      return;
    }

    toggle.checked = initialTheme === DARK;
    toggle.setAttribute("aria-checked", String(toggle.checked));

    toggle.addEventListener("change", () => {
      applyTheme(toggle.checked ? DARK : LIGHT);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTheme, {
      once: true
    });
  } else {
    initializeTheme();
  }
})();