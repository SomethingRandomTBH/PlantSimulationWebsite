/**
 * Home Navigation Tile Grid Component
 * Dynamically renders the navigation tiles from PAGE_REGISTRY.
 */

import { PAGE_REGISTRY } from "../core/config.js";
import { resolveHref } from "../core/dom.js";

export function renderHomeTiles(containerSelector = "#home-tile-grid") {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const enabledPages = PAGE_REGISTRY.filter((entry) => entry.enabled);

  container.innerHTML = enabledPages
    .map((entry, idx) => {
      const href = resolveHref(entry.href);
      const primaryClass = entry.isPrimary ? "nav-tile-primary" : "";
      const delayClass = `reveal-delay-${Math.min(idx + 1, 4)}`;

      return `
        <a
          class="nav-tile ${primaryClass} reveal-item ${delayClass}"
          href="${href}"
          data-page-id="${entry.id}"
        >
          <div class="nav-tile-top">
            <span class="nav-tile-code">${entry.telemetryCode}</span>
            <span class="nav-tile-icon">${entry.icon}</span>
          </div>
          <div class="nav-tile-body">
            <h3>${entry.title}</h3>
            <p>${entry.description}</p>
          </div>
          <div class="nav-tile-footer">
            <span>${entry.ctaLabel || "Open module"}</span>
            <span class="nav-tile-arrow" aria-hidden="true">→</span>
          </div>
        </a>
      `;
    })
    .join("");
}
