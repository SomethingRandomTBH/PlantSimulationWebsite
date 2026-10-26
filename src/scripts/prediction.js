/**
 * Predictor Script Entry Point (scripts/prediction.js)
 * Delegates to the modular predictor controller in scripts/features/predict/form.js
 * while maintaining compatibility if loaded directly as a classic script.
 */

(() => {
  "use strict";

  const currentScript = document.currentScript;
  const scriptBase = currentScript && currentScript.src
    ? new URL(".", currentScript.src).href
    : window.location.href;

  function bootPredictor() {
    import(new URL("./features/predict/form.js", scriptBase).href)
      .then((mod) => {
        if (mod && typeof mod.initPredictorForm === "function") {
          mod.initPredictorForm();
        }
      })
      .catch((err) => {
        console.error("Failed to initialize predictor module:", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootPredictor, { once: true });
  } else {
    bootPredictor();
  }
})();
