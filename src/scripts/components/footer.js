/**
 * Shared Instrument Footer Component
 */

import { SITE_META } from "../core/config.js";

export function renderFooter() {
  const footer = document.querySelector("footer, .site-footer");
  if (!footer) return;

  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="footer-inner">
      <div class="footer-meta">
        <span class="status-dot" aria-hidden="true"></span>
        <p>&copy; ${SITE_META.copyrightYear} ${SITE_META.title} · Golden Pothos Growth Instrument</p>
      </div>
      <span class="footer-telemetry">SYNTHETIC RF · 90% CONFORMAL · GEMINI DIAGNOSTICS</span>
    </div>
  `;
}
