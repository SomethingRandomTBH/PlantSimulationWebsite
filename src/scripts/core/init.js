/**
 * Application Bootstrap Module (ES Module)
 * Orchestrates shared topbar, footer, contour background, home tiles, and predictor.
 */

import { renderTopbar } from "../components/topbar.js";
import { renderFooter } from "../components/footer.js";
import { renderHomeTiles } from "../components/tiles.js";
import { initContourBackground } from "./background.js";
import { initPredictorForm } from "../features/predict/form.js";

export function bootApplication() {
  renderTopbar();
  renderFooter();
  initContourBackground();
  renderHomeTiles("#home-tile-grid");
  initPredictorForm();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApplication, { once: true });
} else {
  bootApplication();
}
