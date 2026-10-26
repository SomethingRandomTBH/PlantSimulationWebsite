/**
 * Forecast Results & Multi-Week Telemetry Renderer
 * Preserves all element IDs depended on by prediction.js and prediction-output.js.
 */

import { INPUT_LABELS } from "../../core/config.js";
import { animateNumberValue } from "../../core/dom.js";

export function renderPrimaryForecast(result, animate = true) {
  const growth = Number(result.predicted_growth_inches);
  const leaves = Number(result.predicted_total_leaf_count);
  const roundedTotal = Number(result.rounded_predicted_total_leaf_count);
  const margin = Number(result.growth_margin_of_error_inches);
  const lower = Number(result.predicted_growth_lower_inches);
  const upper = Number(result.predicted_growth_upper_inches);

  const growthEl = document.getElementById("growth-result");
  const leafEl = document.getElementById("leaf-result");
  const roundedEl = document.getElementById("rounded-leaf-result");
  const lowerEl = document.getElementById("growth-lower-result");
  const upperEl = document.getElementById("growth-upper-result");
  const explanationEl = document.getElementById("result-explanation");

  const duration = animate ? 520 : 0;

  if (growthEl) animateNumberValue(growthEl, growth, 2, duration);
  if (leafEl) animateNumberValue(leafEl, leaves, 2, duration);
  if (roundedEl) animateNumberValue(roundedEl, roundedTotal, 0, duration);

  if (lowerEl && upperEl) {
    if (
      Number.isFinite(margin) &&
      Number.isFinite(lower) &&
      Number.isFinite(upper)
    ) {
      animateNumberValue(lowerEl, lower, 2, duration);
      animateNumberValue(upperEl, upper, 2, duration);
    } else {
      lowerEl.textContent = "Unavailable";
      upperEl.textContent = "Unavailable";
    }
  }

  if (explanationEl) {
    explanationEl.textContent =
      `The model estimates ${growth.toFixed(2)} inches of additional vine growth ` +
      `over the next seven days. Its estimated projected total is ` +
      `${leaves.toFixed(2)} leaves, or approximately ${roundedTotal} whole leaves. ` +
      `The leaf estimate is a projection of total leaves after 7 days (using 1.2 inches per leaf), ` +
      `not a separate machine-learning model.`;
  }
}

export function renderMultiweekForecast(result, animate = true) {
  const forecasts = result.weekly_forecasts;
  const multiweekExplanation = document.getElementById("multiweek-explanation");

  if (!Array.isArray(forecasts)) {
    if (multiweekExplanation) {
      multiweekExplanation.textContent =
        "These extended forecasts are not available for this saved " +
        "prediction. Please run a new forecast.";
    }
    return;
  }

  const week2 = forecasts.find((item) => item.week === 2);
  const week4 = forecasts.find((item) => item.week === 4);

  if (!week2 || !week4) {
    if (multiweekExplanation) {
      multiweekExplanation.textContent =
        "The extended forecast could not be loaded. Please run a new prediction.";
    }
    return;
  }

  const duration = animate ? 560 : 0;

  const w2Len = document.getElementById("week-2-length");
  const w2Growth = document.getElementById("week-2-growth");
  const w2Leaves = document.getElementById("week-2-leaves");
  const w4Len = document.getElementById("week-4-length");
  const w4Growth = document.getElementById("week-4-growth");
  const w4Leaves = document.getElementById("week-4-leaves");

  if (w2Len) animateNumberValue(w2Len, week2.projected_stem_length_inches, 2, duration);
  if (w2Growth) animateNumberValue(w2Growth, week2.cumulative_growth_inches, 2, duration);
  if (w2Leaves) animateNumberValue(w2Leaves, week2.rounded_projected_total_leaf_count, 0, duration);

  if (w4Len) animateNumberValue(w4Len, week4.projected_stem_length_inches, 2, duration);
  if (w4Growth) animateNumberValue(w4Growth, week4.cumulative_growth_inches, 2, duration);
  if (w4Leaves) animateNumberValue(w4Leaves, week4.rounded_projected_total_leaf_count, 0, duration);

  if (multiweekExplanation) {
    multiweekExplanation.textContent =
      "The 2-week and 4-week results are sequential projections. " +
      "Each simulated week updates plant age and vine length before " +
      "the next Random Forest prediction. New leaves are estimated " +
      "from predicted growth using the 1.2-inch average leaf-spacing " +
      "assumption; they are not independently predicted by the model.";
  }

  const margin = Number(result.growth_margin_of_error_inches);
  const week2Note = document.getElementById("week-2-range-note");
  const week4Note = document.getElementById("week-4-range-note");

  if (week2Note && week4Note) {
    if (Number.isFinite(margin) && margin >= 0) {
      const formattedMargin = margin.toFixed(2);
      week2Note.textContent =
        `Reference margin: ±${formattedMargin} inches per weekly ` +
        `prediction. Uncertainty can accumulate over two weeks; ` +
        `this is not a calibrated 90% interval for total growth.`;
      week4Note.textContent =
        `Reference margin: ±${formattedMargin} inches per weekly ` +
        `prediction. Uncertainty can accumulate over four weeks; ` +
        `this is not a calibrated 90% interval for total growth.`;
    } else {
      week2Note.textContent =
        "A calibrated weekly error margin is unavailable. Run a new prediction.";
      week4Note.textContent =
        "A calibrated weekly error margin is unavailable. Run a new prediction.";
    }
  }
}

export function renderInputsTable(inputs, photoMeta = null) {
  const body = document.getElementById("input-summary");
  if (!body) return;

  body.innerHTML = "";

  for (const [key, label, format] of INPUT_LABELS) {
    if (inputs[key] === undefined) continue;

    const row = document.createElement("tr");
    const th = document.createElement("th");
    const td = document.createElement("td");

    th.scope = "row";
    th.textContent = label;
    td.textContent = format(inputs[key]);

    row.append(th, td);
    body.appendChild(row);
  }

  const photoRow = document.createElement("tr");
  const photoTh = document.createElement("th");
  const photoTd = document.createElement("td");
  photoTh.scope = "row";
  photoTh.textContent = "Plant photo (Gemini input)";
  photoTd.textContent = photoMeta
    ? `${photoMeta.name} (${photoMeta.width}×${photoMeta.height}px)`
    : "None (telemetry only)";
  photoRow.append(photoTh, photoTd);
  body.appendChild(photoRow);
}
