/**
 * Standalone Prediction Output Page Controller (scripts/prediction-output.js)
 * Reads the prediction saved in sessionStorage ("pothosPrediction") and renders
 * the 7-day forecast, 90% prediction interval, 2/4-week sequential projections,
 * input summary table, and Gemini botanical summary (with optional photo support).
 */

(() => {
  "use strict";

  const currentScript = document.currentScript;
  const scriptBase = currentScript && currentScript.src
    ? new URL(".", currentScript.src).href
    : window.location.href;

  async function initOutputPage() {
    try {
      const [{ STORAGE_KEYS }, resultsMod, geminiMod] = await Promise.all([
        import(new URL("./core/config.js", scriptBase).href),
        import(new URL("./features/predict/results.js", scriptBase).href),
        import(new URL("./features/summary/gemini.js", scriptBase).href)
      ]);

      const noData = document.getElementById("no-data");
      const output = document.getElementById("output");

      let saved = null;
      try {
        const raw = sessionStorage.getItem(STORAGE_KEYS.PREDICTION);
        saved = raw ? JSON.parse(raw) : null;
      } catch (err) {
        saved = null;
      }

      if (saved && saved.result) {
        resultsMod.renderPrimaryForecast(saved.result, true);
        resultsMod.renderMultiweekForecast(saved.result, true);
        resultsMod.renderInputsTable(saved.inputs || {}, saved.photo || null);

        if (output) output.hidden = false;
        if (noData) noData.hidden = true;

        const summaryController = geminiMod.createGeminiSummaryController();
        summaryController.requestSummary(saved.inputs || null, saved.photo || null);
      } else {
        if (noData) noData.hidden = false;
        if (output) output.hidden = true;
      }
    } catch (error) {
      console.error("Failed to initialize prediction output page:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOutputPage, { once: true });
  } else {
    initOutputPage();
  }
})();
