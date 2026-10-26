/**
 * Shared Slim Top Bar Component
 * Renders wordmark, telemetry badge, sub-page "Home" back control (from registry),
 * and the theme toggle switch. Removes legacy horizontal tab bars.
 */

import { PAGE_REGISTRY, SITE_META } from "../core/config.js";
import { isSubPage, resolveHref } from "../core/dom.js";
import { bindThemeToggle, DARK, getSavedTheme } from "../core/theme.js";

function getActivePageMeta() {
  const path = window.location.pathname.replace(/\\/g, "/").toLowerCase();
  for (const entry of PAGE_REGISTRY) {
    if (entry.href && !entry.href.startsWith("#") && path.endsWith(entry.href.toLowerCase())) {
      return entry;
    }
  }
  if (path.endsWith("prediction-output.html")) {
    return {
      title: "Growth Forecast Report",
      telemetryCode: "REPORT · 7D/28D"
    };
  }
  return null;
}

export function renderTopbar() {
  const header = document.querySelector("header, .site-header, .topbar");
  if (!header) return;

  header.className = "topbar site-header";
  const homeUrl = resolveHref(SITE_META.homeHref);
  const subPage = isSubPage();
  const activeMeta = getActivePageMeta();
  const badgeText = activeMeta ? activeMeta.telemetryCode : SITE_META.instrumentCode;
  const isDark = (document.documentElement.dataset.theme || getSavedTheme()) === DARK;

  const backControlHtml = subPage
    ? `<a class="topbar-back-link" href="${homeUrl}" aria-label="Return to Home Instrument Hub">
         <span aria-hidden="true">←</span>
         <span>Home</span>
       </a>`
    : "";

  header.innerHTML = `
    <div class="topbar-inner">
      <div class="topbar-brand-group">
        <a class="topbar-wordmark" href="${homeUrl}">
          <span class="topbar-status-dot" aria-hidden="true"></span>
          <h1>${SITE_META.title}</h1>
        </a>
        <span class="topbar-telemetry-tag">${badgeText}</span>
      </div>

      <div class="topbar-actions">
        ${backControlHtml}
        <div class="theme-control">
          <label class="theme-switch" for="theme-toggle">
            <span class="theme-switch-label">Dark mode</span>
            <input
              type="checkbox"
              id="theme-toggle"
              role="switch"
              aria-label="Toggle dark mode"
              ${isDark ? "checked" : ""}
              aria-checked="${String(isDark)}"
            >
            <span class="theme-switch-track" aria-hidden="true">
              <span class="theme-switch-thumb"></span>
            </span>
          </label>
        </div>
      </div>
    </div>
  `;

  bindThemeToggle(header.querySelector("#theme-toggle"));
}
