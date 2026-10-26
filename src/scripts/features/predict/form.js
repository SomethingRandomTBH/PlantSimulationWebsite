/**
 * Predictor Form Controller
 * Validates the 9 required inputs, calls /api/predict, renders inline forecast
 * results + multi-week projections + Gemini summary inside #predict, and persists
 * to sessionStorage for standalone report compatibility.
 */

import {
  ALLOWED_HUMIDITY,
  ALLOWED_POTS,
  API_ENDPOINTS,
  STORAGE_KEYS,
  VALIDATION_RANGES
} from "../../core/config.js";
import {
  renderInputsTable,
  renderMultiweekForecast,
  renderPrimaryForecast
} from "./results.js";
import { createPhotoUploadController } from "./upload.js";
import { createGeminiSummaryController } from "../summary/gemini.js";

function getNumber(formData, key) {
  return Number(formData.get(key));
}

export function validateInputs(data) {
  for (const [key, [min, max]] of Object.entries(VALIDATION_RANGES)) {
    const value = data[key];
    if (!Number.isFinite(value) || value < min || value > max) {
      return `${key.replaceAll("_", " ")} must be between ${min} and ${max}.`;
    }
  }

  if (!Number.isInteger(data.Age_Days)) {
    return "Plant age must be a whole number of days.";
  }

  if (!Number.isInteger(data.Leaf_Count)) {
    return "Leaf count must be a whole number.";
  }

  if (!ALLOWED_POTS.includes(data.Pot_Size_Inches)) {
    return "Choose a supported pot size.";
  }

  if (!ALLOWED_HUMIDITY.includes(data.Humidity_Level)) {
    return "Choose a valid humidity level.";
  }

  return null;
}

export function initPredictorForm() {
  const form = document.getElementById("prediction-form");
  if (!form || form.dataset.boundPredictor === "true") {
    return;
  }
  form.dataset.boundPredictor = "true";

  const predictButton = document.getElementById("predict-button");
  const resetButton = document.getElementById("reset-button");
  const errorBox = document.getElementById("form-error");
  const placeholder = document.getElementById("results-placeholder");
  const results = document.getElementById("results");
  const outputWrapper = document.getElementById("output");
  const loading = document.getElementById("loading");

  const photoController = createPhotoUploadController();
  const summaryController = createGeminiSummaryController();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (errorBox) errorBox.textContent = "";

    const formData = new FormData(form);
    const data = {
      Age_Days: getNumber(formData, "Age_Days"),
      Stem_Length_Inches: getNumber(formData, "Stem_Length_Inches"),
      Leaf_Count: getNumber(formData, "Leaf_Count"),
      Pot_Size_Inches: getNumber(formData, "Pot_Size_Inches"),
      Light_Lux: getNumber(formData, "Light_Lux"),
      Watering_Volume_mL: getNumber(formData, "Watering_Volume_mL"),
      Watering_Freq_Days: getNumber(formData, "Watering_Freq_Days"),
      Temperature_F: getNumber(formData, "Temperature_F"),
      Humidity_Level: formData.get("Humidity_Level")
    };

    const validationError = validateInputs(data);
    if (validationError) {
      if (errorBox) errorBox.textContent = validationError;
      return;
    }

    if (predictButton) predictButton.disabled = true;
    if (loading) loading.hidden = false;
    if (results) results.hidden = true;
    if (outputWrapper) outputWrapper.hidden = true;
    if (placeholder) placeholder.hidden = true;

    try {
      const response = await fetch(API_ENDPOINTS.PREDICT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "The prediction request failed.");
      }

      const preparedPhoto = photoController.getPreparedPhoto();
      const photoMetaForStorage = preparedPhoto
        ? {
            dataUrl: preparedPhoto.dataUrl,
            mimeType: preparedPhoto.mimeType,
            name: preparedPhoto.name,
            width: preparedPhoto.width,
            height: preparedPhoto.height
          }
        : null;

      try {
        sessionStorage.setItem(
          STORAGE_KEYS.PREDICTION,
          JSON.stringify({
            inputs: data,
            result,
            photo: photoMetaForStorage
          })
        );
      } catch (storageErr) {
        // If photo dataUrl exceeds sessionStorage quota, store inputs + result without dataUrl
        try {
          sessionStorage.setItem(
            STORAGE_KEYS.PREDICTION,
            JSON.stringify({ inputs: data, result })
          );
        } catch (_err) {
          // Ignore storage error
        }
      }

      // Render inline inside #predict when the full inline readout is present
      if (results) {
        renderPrimaryForecast(result, true);
        renderMultiweekForecast(result, true);
        renderInputsTable(data, preparedPhoto);
        results.hidden = false;
        if (outputWrapper) outputWrapper.hidden = false;
        summaryController.requestSummary(data, preparedPhoto);
      } else {
        window.location.href = "/pages/prediction-output.html";
      }
    } catch (error) {
      if (placeholder) placeholder.hidden = false;
      if (errorBox) {
        errorBox.textContent =
          error.message || "Unable to reach the prediction service.";
      }
    } finally {
      if (loading) loading.hidden = true;
      if (predictButton) predictButton.disabled = false;
    }
  });

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      form.reset();
      photoController.clearPhoto();
      if (errorBox) errorBox.textContent = "";
      if (results) results.hidden = true;
      if (outputWrapper) outputWrapper.hidden = true;
      if (placeholder) placeholder.hidden = false;
    });
  }
}
