/**
 * Core Theme Controller
 * Manages html[data-theme] ("light" | "dark") and #theme-toggle switch.
 */

import { STORAGE_KEYS } from "./config.js";

export const DARK = "dark";
export const LIGHT = "light";

export function getSavedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved === DARK || saved === LIGHT) {
      return saved;
    }
  } catch (error) {
    // Fall back to system color-scheme preference.
  }

  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? DARK
      : LIGHT;
  } catch (error) {
    return LIGHT;
  }
}

export function applyTheme(theme) {
  const selectedTheme = theme === DARK ? DARK : LIGHT;
  document.documentElement.dataset.theme = selectedTheme;

  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.checked = selectedTheme === DARK;
    toggle.setAttribute("aria-checked", String(selectedTheme === DARK));
  }

  try {
    localStorage.setItem(STORAGE_KEYS.THEME, selectedTheme);
  } catch (error) {
    // Works for current session even if storage is unavailable.
  }

  window.dispatchEvent(
    new CustomEvent("botanists:themechange", { detail: { theme: selectedTheme } })
  );
}

export function bindThemeToggle(toggleElement) {
  const toggle = toggleElement || document.getElementById("theme-toggle");
  if (!toggle || toggle.dataset.boundTheme === "true") {
    return;
  }

  const currentTheme = document.documentElement.dataset.theme || getSavedTheme();
  toggle.checked = currentTheme === DARK;
  toggle.setAttribute("aria-checked", String(toggle.checked));
  toggle.dataset.boundTheme = "true";

  toggle.addEventListener("change", () => {
    applyTheme(toggle.checked ? DARK : LIGHT);
  });
}
