# Random Forest Model, Data Pipeline, and Frontend Contract Notes

This document records the complete investigation of the existing Random Forest (RF) growth model setup, data generation, training/calibration pipeline, Flask API endpoints, frontend-to-output data contract, Gemini summary pipeline, and the complete DOM ID / attribute / CSS hook inventory prior to any UI redesign changes.

---

## 1. Where the Model is Loaded and Validated (`app.py`)

### Path Configuration (`app.py`, lines 15–26)
- `BASE_DIR` is resolved to the directory containing `app.py` (`line 15`).
- `MODEL_PATH` points to `os.path.join(BASE_DIR, "pothos_rf_models.joblib")` (`line 22`).
- `TRAIN_SCRIPT` points to `os.path.join(BASE_DIR, "train_pothos_models.py")` (`line 23`).
  - *Audit note:* In the repository root, the actual training script is named `pothosRandomForestPredictions.py`, whereas `app.py:23` references `train_pothos_models.py`. Because `pothos_rf_models.joblib` already exists on disk, `ensure_model_exists()` (`lines 68–92`) exits early at `lines 69–71` (`if os.path.isfile(MODEL_PATH): return`).

### Bundle Loading and Startup Checks (`app.py`, lines 94–138)
1. `ensure_model_exists()` is called at module import time (`line 94`).
2. `bundle = joblib.load(MODEL_PATH)` loads the serialized dictionary from `pothos_rf_models.joblib` (`line 96`).
3. Startup validation verifies:
   - `isinstance(bundle, dict)` (`lines 98–99`).
   - Both `"growth_model"` and `"feature_columns"` exist in `bundle` (`lines 101–105`).
   - `growth_model = bundle["growth_model"]` (`line 107`) — a `scikit-learn` `RandomForestRegressor`.
   - `feature_columns = list(bundle["feature_columns"])` (`line 108`), verified non-empty (`lines 110–111`).
   - `"growth_margin_of_error_90"` exists in `bundle` (`lines 116–120`), is cast to `float` (`lines 122–124`), and is verified finite and non-negative (`not np.isfinite(growth_margin_of_error_90) or growth_margin_of_error_90 < 0`, `lines 126–132`).

---

## 2. Inputs, Validation Ranges, and Feature Engineering (`app.py`)

### Required Request Fields (`app.py`, lines 29–53)
`REQUIRED_FIELDS` (`lines 43–53`) defines the 9 required keys in the input payload:
1. `Age_Days` — integer in `[1, 750]` (`LIMITS["Age_Days"] = (1, 750)`, `line 34`; integer check at `lines 173–174`).
   - *Frontend discrepancy note:* `src/pages/prediction.html` (`lines 61–63`) sets `min="1" max="358"` on `#age`, while `src/scripts/prediction.js` (`line 18`) checks `Age_Days: [1, 751]`. Thus `751` passes client validation in `prediction.js` but fails `app.py` with HTTP 400 (`1` to `750`), while the HTML input restricts native validation to `358`.
2. `Stem_Length_Inches` — float in `[0.1, 500]` (`line 35`).
3. `Leaf_Count` — integer in `[0, 500]` (`line 36`; integer check at `lines 176–177`).
4. `Pot_Size_Inches` — numeric in `ALLOWED_POTS = [4, 6, 8, 10, 12]` (`line 29`, checked at `lines 179–180`).
5. `Light_Lux` — float in `[300, 10000]` (`line 37`).
6. `Watering_Volume_mL` — float in `[100, 600]` (`line 38`).
7. `Watering_Freq_Days` — float in `[4, 14]` (`line 39`).
8. `Temperature_F` — float in `[62, 85]` (`line 40`).
9. `Humidity_Level` — string in `ALLOWED_HUMIDITY = ["Low", "Average", "High"]` (`line 30`, checked at `lines 182–184`).

### Parsing & Validation (`parse_inputs`, `app.py`, lines 146–186)
- Checks `isinstance(payload, dict)` (`lines 147–148`).
- Checks for any missing keys from `REQUIRED_FIELDS` (`lines 150–152`).
- Converts all 8 non-humidity fields to `float` and verifies `np.isfinite(value)` (`lines 154–165`).
- Enforces `(minimum, maximum)` bounds for all 7 keys in `LIMITS` (`lines 167–171`).
- Enforces `.is_integer()` on `Age_Days` (`lines 173–174`) and `Leaf_Count` (`lines 176–177`).
- Checks `Pot_Size_Inches in ALLOWED_POTS` (`lines 179–180`) and `Humidity_Level in ALLOWED_HUMIDITY` (`lines 182–184`).
- Returns `{**numeric, "Humidity_Level": humidity}` (`line 186`).

### Feature Engineering & Column Ordering (`run_model`, `app.py`, lines 189–208)
- **Exclusion of `Leaf_Count` from RF features:** `row` (`lines 190–199`) includes only the 8 predictor variables (`Age_Days`, `Stem_Length_Inches`, `Pot_Size_Inches`, `Light_Lux`, `Watering_Volume_mL`, `Watering_Freq_Days`, `Temperature_F`, `Humidity_Level`). `Leaf_Count` is **not** passed into the Random Forest regressor; it is used only post-prediction to compute projected total leaf count (`lines 217–219`).
- **One-Hot Encoding:** `features = pd.DataFrame([row])` (`line 201`) is one-hot encoded via `pd.get_dummies(features, columns=["Humidity_Level"], dtype=int)` (`lines 202–204`).
- **Column Reindexing:** `features = features.reindex(columns=feature_columns, fill_value=0)` (`lines 205–207`) aligns the single-row DataFrame to the exact 10-column training order stored in `pothos_rf_models.joblib` (matching `pothos_rf_feature_importance.csv` and `pothosRandomForestPredictions.py:92–100`):
  1. `Age_Days`
  2. `Stem_Length_Inches`
  3. `Pot_Size_Inches`
  4. `Light_Lux`
  5. `Watering_Volume_mL`
  6. `Watering_Freq_Days`
  7. `Temperature_F`
  8. `Humidity_Level_Average`
  9. `Humidity_Level_High`
  10. `Humidity_Level_Low`

---

## 3. 7-Day Forecast, Sequential 2/4-Week Forecasts, 90% Prediction Interval, and Leaf Rounding

### Single-Period (7-Day) Forecast (`run_model`, `app.py`, lines 209–250)
1. **Raw Stem Growth Prediction (`lines 209–211`):**
   - `predicted_growth = max(0.0, float(growth_model.predict(features)[0]))`
   - Clamped at `0.0` so predicted stem growth is never negative.
2. **New Leaf Estimation (`lines 31, 212–215`):**
   - Uses constant `AVERAGE_LEAF_SPACING_INCHES = 1.2` (`line 31`).
   - `predicted_new_leaves = predicted_growth / AVERAGE_LEAF_SPACING_INCHES` (`lines 212–214`).
   - Half-up whole-leaf rounding: `rounded_new_leaves = int(np.floor(predicted_new_leaves + 0.5))` (`line 215`).
3. **Total Leaf Count Calculation (`lines 217–222`):**
   - Adds unrounded `predicted_new_leaves` to the integer `inputs["Leaf_Count"]`:
     `predicted_total_leaves = int(inputs["Leaf_Count"]) + predicted_new_leaves` (`lines 217–219`).
   - Half-up whole-leaf rounding:
     `rounded_total_leaves = int(np.floor(predicted_total_leaves + 0.5))` (`lines 220–222`).
4. **90% Prediction Interval Bounds (`lines 224–231`):**
   - Lower bound clamped at `0.0`:
     `growth_lower = max(0.0, predicted_growth - growth_margin_of_error_90)` (`lines 224–227`).
   - Upper bound:
     `growth_upper = predicted_growth + growth_margin_of_error_90` (`lines 229–231`).
5. **Returned Dictionary & Rounding (`lines 234–250`):**
   - All continuous quantities are rounded to 2 decimal places (`round(..., 2)`):
     - `predicted_growth_inches`: `round(predicted_growth, 2)`
     - `predicted_new_leaves`: `round(predicted_new_leaves, 2)`
     - `rounded_predicted_new_leaves`: `int`
     - `predicted_total_leaf_count`: `round(predicted_total_leaves, 2)`
     - `rounded_predicted_total_leaf_count`: `int`
     - `growth_margin_of_error_inches`: `round(growth_margin_of_error_90, 2)`
     - `predicted_growth_lower_inches`: `round(growth_lower, 2)`
     - `predicted_growth_upper_inches`: `round(growth_upper, 2)`

### Sequential Multi-Week Forecast (`run_multiweek_forecast`, `app.py`, lines 253–306)
- Called by `/api/predict` (`line 525`) after `run_model(inputs)` (`line 522`) and merged via `result.update(...)`.
- Initializes state (`lines 256–262`):
  - `current = dict(inputs)`
  - `starting_length = inputs["Stem_Length_Inches"]`
  - `starting_leaves = inputs["Leaf_Count"]`
  - `cumulative_growth = 0.0`
  - `cumulative_new_leaves = 0.0`
- Iterates `for week in range(1, 5):` (`lines 264–300`):
  1. Calls `weekly_result = run_model(current)` (`line 266`).
  2. Uses the **rounded** 2-decimal weekly growth: `weekly_growth = weekly_result["predicted_growth_inches"]` (`line 268`).
  3. Computes `weekly_new_leaves = weekly_growth / AVERAGE_LEAF_SPACING_INCHES` (`lines 269–271`).
     - *Subtlety:* Because `run_model` divides the **unrounded** `predicted_growth` by `1.2` (`line 213`) whereas `run_multiweek_forecast` divides the **2-decimal rounded** `weekly_result["predicted_growth_inches"]` by `1.2` (`line 270`), `predicted_new_leaves` (`1.0` for default inputs where `predicted_growth = 1.194...`) can differ by `0.01` from `week_1["estimated_new_leaves_this_week"]` (`1.19 / 1.2 = 0.9916 -> 0.99`).
  4. Accumulates `cumulative_growth += weekly_growth` (`line 273`) and `cumulative_new_leaves += weekly_new_leaves` (`line 274`).
  5. Computes `projected_length = starting_length + cumulative_growth` (`line 276`) and `projected_leaves = starting_leaves + cumulative_new_leaves` (`line 277`).
  6. Appends a weekly forecast dict (`lines 279–294`) with:
     - `week` (`1..4`)
     - `weekly_growth_inches`: `round(weekly_growth, 2)`
     - `cumulative_growth_inches`: `round(cumulative_growth, 2)`
     - `projected_stem_length_inches`: `round(projected_length, 2)`
     - `estimated_new_leaves_this_week`: `round(weekly_new_leaves, 2)`
     - `cumulative_estimated_new_leaves`: `round(cumulative_new_leaves, 2)`
     - `projected_total_leaf_count`: `round(projected_leaves, 2)`
     - `rounded_projected_total_leaf_count`: `int(np.floor(projected_leaves + 0.5))`
  7. Advances simulated plant state for the next iteration (`lines 297–299`):
     - `current["Age_Days"] += 7`
     - `current["Stem_Length_Inches"] = projected_length` (note: unrounded float sum of `starting_length + cumulative_growth`)
     - `current["Leaf_Count"] = projected_leaves`
     - Environmental parameters (`Pot_Size_Inches`, `Light_Lux`, `Watering_Volume_mL`, `Watering_Freq_Days`, `Temperature_F`, `Humidity_Level`) remain constant.
- Returns (`lines 301–306`):
  - `"week_1": forecasts[0]`
  - `"week_2": forecasts[1]`
  - `"week_4": forecasts[3]`
  - `"weekly_forecasts": forecasts` (all 4 weeks).

### How the 90% Split-Conformal Prediction Interval is Computed (`pothosRandomForestPredictions.py`, lines 105–229)
- **Group-aware data split (`lines 113–160`):**
  - Uses two `GroupShuffleSplit` passes grouped by `Plant_ID` (`random_state=42` with `test_size=0.20`, then `random_state=43` with `test_size=0.25` of the remaining 80%) to partition whole plants into **60% training**, **20% calibration**, and **20% test** sets with zero plant overlap (`assert train_plants.isdisjoint(calibration_plants)`, etc., `lines 158–160`).
- **RF Hyperparameters (`lines 175–183`):**
  - `RandomForestRegressor(n_estimators=100, max_depth=15, min_samples_leaf=5, random_state=42, n_jobs=-1)` fitted on `(X_train, y_train)`.
- **Conformal Calibration (`lines 194–220`):**
  - Predicts on held-out calibration plants, clamped at `0.0`: `calibration_predictions = np.maximum(0.0, growth_model.predict(X_calibration))` (`lines 194–197`).
  - Computes absolute residuals: `calibration_errors = np.abs(y_calibration.to_numpy() - calibration_predictions)` (`lines 199–201`).
  - Computes finite-sample split-conformal quantile rank (1-based):
    `quantile_rank = min(n_calibration, int(np.ceil((n_calibration + 1) * 0.90)))` (`lines 210–216`).
   - Extracts threshold:
     `growth_margin_of_error_90 = float(np.sort(calibration_errors)[quantile_rank - 1])` (`lines 218–220`).
- **Serialized Bundle Values in `pothos_rf_models.joblib` (`pothosRandomForestPredictions.py:322–332`):**
  - `growth_margin_of_error_90`: `0.1921429958330295` inches (rounded to `0.19` in API output and `0.1921` in startup log).
  - `prediction_interval_coverage`: `0.9`
  - `calibration_sample_count`: `41600` (400 calibration plants × 104 weeks)
  - `calibration_quantile_rank`: `37441` (`ceil((41600 + 1) * 0.90) = 37441`)
  - `training_random_state`: `42`

---

## 4. What the Synthetic Training Data Implies (`pothos_growth_model.py`)

### Simulation Structure (`pothos_growth_model.py`, lines 13–44, 131–256)
- Despite the header comment mentioning `5,000 plants x 52 weeks = 260,000 rows` (`line 7`), the actual constants are `NUM_PLANTS = 2000` (`line 15`), `NUM_WEEKS = 104` (`line 16`), and `PERIOD_DAYS = 7` (`line 17`), producing `2000 × 104 = 208,000` rows with seed `rng = np.random.default_rng(42)` (`line 13`).
- Each plant starts at `age_days` in `[1, 30]` (`line 133`) and is tracked for 104 seven-day periods (`728` days), so maximum `Age_Days` in the dataset reaches up to `30 + 103 × 7 = 751` days.
- Environmental conditions (`pot_inches`, `light_lux`, `water_volume_ml`, `watering_frequency_days`, `temperature_f`, `humidity`) are sampled once per plant at initialization (`lines 136–141`) and held static across all 104 weeks.

### Multiplicative Growth Model (`lines 20–42, 47–115, 168–209`)
Weekly growth is governed by a multiplicative efficiency product (`lines 182–200`):
$$\text{expected\_growth} = 0.2 \times 7 \times \text{efficiency} \times \text{plant\_vigor} \times \sqrt{\text{active\_tips}}$$
where $\text{efficiency} = \text{light\_mod} \times \text{temp\_mod} \times \text{water\_mod} \times \text{humidity\_mod} \times \text{pot\_mod} \times \text{size\_mod} \times \text{age\_mod}$:
1. **Light (`calculate_light_modifier`, `lines 47–52`):** Peaks at `OPTIMAL_LIGHT_LUX = 2500.0` (`modifier = 1.0`). Linearly scales from `0.1` to `1.0` below 2,500 lux, and linearly decays above 2,500 lux down to `0.0` at `7,500+` lux (`1.0 - (lux - 2500) / 5000`). **Implication:** In this synthetic world, any light reading $\ge 7,500\text{ lux}$ yields `light_mod = 0.0` and near-zero expected growth (only positive Gaussian noise).
2. **Temperature (`calculate_temperature_modifier`, `lines 55–60`):** Gaussian bell curve centered at `OPTIMAL_TEMP_F = 80.0` with `TEMP_STD_F = 15.0`.
3. **Water (`calculate_water_modifier`, `lines 63–73`):** Optimal daily water scales linearly with pot diameter: $(\text{pot\_inches} / 6.0) \times 43.0\text{ mL/day}$. Uses a quadratic penalty $1 - \text{ratio}^2$ clamped at `0.0`.
4. **Humidity (`calculate_humidity_modifier`, `lines 76–77`):** `"Low": 0.95`, `"Average": 1.0`, `"High": 1.0` — very small effect, which explains why `Humidity_Level_*` has $<0.5\%$ total feature importance in `pothos_rf_feature_importance.csv`.
5. **Pot crowding (`calculate_pot_modifier`, `lines 80–86`):** Depends on `pot_inches` and `leaf_count` (`capacity = max(8.0, 7.0 * pot_inches ** 1.5)`), floored at `0.35`. Note that since `Leaf_Count` is omitted from `BASE_FEATURES` in `pothosRandomForestPredictions.py` (`lines 38–47`), the RF model must infer crowding indirectly from `Stem_Length_Inches`, `Age_Days`, and `Pot_Size_Inches`.
6. **Size slowdown (`calculate_size_modifier`, `lines 89–93`):** $1 / (1 + \text{stem\_inches} / 48.0)$, floored at `0.30` — longer vines elongate more slowly per tip.
7. **Maturity ramp (`calculate_age_modifier`, `lines 95–114`):** Plants under `MATURITY_START_DAYS = 90` start at `0.15` and ramp up via power curve `1.7` to `1.0` at day 90.
8. **Unobserved latent variables (aleatoric uncertainty):**
   - `plant_vigor ~ Lognormal(0, 0.15)` (`line 143`) is constant per plant but unobserved in features.
   - `active_tips` starts at `1` (`line 160`) and stochastically branches up to `MAX_BRANCH_TIPS = 8` (`lines 220–230`), multiplying growth by $\sqrt{\text{active\_tips}}$ (`line 192`), also unobserved in features.
   - Additive Gaussian noise $\mathcal{N}(0, (0.04\sqrt{7})^2)$ (`lines 202–204`).
   - Because `plant_vigor` and `active_tips` are latent variables not present in the 8 input features, older plants with more branching exhibit wider variance in true growth, which the split-conformal 90% interval captures globally.
9. **Zero leaf loss (`lines 232, 252–255`):** Healthy-plant assumption means leaves never decrease and new leaves strictly come from stem growth crossing sampled node spacing ($\sim \mathcal{N}(1.2, 0.12^2)$, floored at $0.7\text{ in}$).

---

## 5. Frontend-to-Output Contract (`scripts/prediction.js` & `scripts/prediction-output.js`)

### How Results Travel (`scripts/prediction.js`, lines 86–141)
1. On `#prediction-form` submit (`line 86`), `prediction.js` reads the 9 fields via `FormData` (`lines 90–102`), runs `validateInputs(data)` (`lines 16–52`), and sends `POST /api/predict` with `Content-Type: application/json` and `body: JSON.stringify(data)` (`lines 117–123`).
2. When the response succeeds (`lines 125–132`), `prediction.js` writes to `sessionStorage` under the key `"pothosPrediction"`:
   ```js
   sessionStorage.setItem("pothosPrediction", JSON.stringify({ inputs: data, result }));
   window.location.href = "/pages/prediction-output.html";
   ```
3. Note: `prediction.js` also contains a dead `displayResults(data)` function (`lines 54–84`) from an earlier single-page design before the redirect to `/pages/prediction-output.html` was added, plus an unguarded `document.getElementById("reset-button").addEventListener(...)` at `line 143` which throws a `TypeError` because `#reset-button` is missing from `prediction.html`.

### How `prediction-output.js` Consumes the Contract (`scripts/prediction-output.js`, lines 1–185, 660–817)
1. Reads `sessionStorage.getItem("pothosPrediction")` (`STORAGE_KEY = "pothosPrediction"`, `lines 3, 20–27`).
2. Expects an object `{ inputs, result }`:
   - If `!saved || !saved.result`, unhides `#no-data` (`lines 806, 815–817`).
   - Otherwise:
     - Calls `showResults(saved.result)` (`lines 30–91`) to populate `#growth-result`, `#leaf-result`, `#rounded-leaf-result`, `#growth-lower-result`, `#growth-upper-result`, and `#result-explanation`.
     - Calls `showMultiweekForecast(saved.result)` (`lines 95–164`) to find `week === 2` and `week === 4` in `result.weekly_forecasts` and populate `#week-2-length`, `#week-2-growth`, `#week-2-leaves`, `#week-2-range-note`, `#week-4-length`, `#week-4-growth`, `#week-4-leaves`, `#week-4-range-note`, and `#multiweek-explanation`.
     - Calls `showInputs(saved.inputs || {})` (`lines 167–185`) to render table rows into `<tbody id="input-summary">`.
     - Unhides `#output` (`line 811`).
     - Sets `summaryInputs = saved.inputs || null` and calls `loadSummary()` (`lines 813–814`), which sends `POST /api/summarize` with `JSON.stringify(summaryInputs)` (`lines 723–728`) and renders the returned `{ summary }` Markdown into `#summary-text` (`lines 691–694`).

---

## 6. Audit of the Gemini Pipeline (`app.py`, `sysprmt.txt`, `prediction-output.js`)

1. **Invalid default model identifier (`app.py:55–57`):**
   - `GEMINI_MODEL` defaults to `"gemini-3.5-flash-lite"`, which is not a valid model ID on Google's Generative Language `v1beta` endpoint (returns HTTP 404). Valid flash-lite/flash models are `gemini-2.5-flash-lite` / `gemini-2.5-flash`. We should default to `gemini-2.5-flash-lite` and provide automatic fallback if a configured model returns 404.
2. **Prompt schema mismatches between `build_user_prompt` (`app.py:346–379`) and `sysprmt.txt`:**
   - `sysprmt.txt` (`lines 40, 413, 427`) explicitly requires `Current_Date` in `YYYY-MM-DD` format (`The appended Current_Date is supplied in YYYY-MM-DD format. Always use this exact date to determine the Northern Hemisphere calendar season.`). `build_user_prompt` only sent a localized timestamp string without `Current_Date: YYYY-MM-DD`.
   - `sysprmt.txt` (`lines 125–141, 178, 430, 513`) references exact schema keys (`Age_Days`, `Stem_Length_Inches`, `Leaf_Count`, `Stem_Length_Baseline_Leaf_Count`, `Predicted_Growth_Inches`, `Predicted_Total_Leaf_Count`, `Rounded_Predicted_Total_Leaf_Count`), whereas `build_user_prompt` omitted `Stem_Length_Baseline_Leaf_Count`, omitted the 90% prediction interval (`predicted_growth_lower_inches`, `predicted_growth_upper_inches`, `growth_margin_of_error_inches`), and omitted the 2-week and 4-week sequential forecasts (`run_multiweek_forecast`).
3. **Token budget truncation & finishReason handling (`app.py:63, 382–409`):**
   - `GEMINI_MAX_OUTPUT_TOKENS = 2048` can truncate the 4-section report (especially when thinking tokens are consumed or when analyzing both telemetry and a plant photo). Increasing to `4096` and inspecting `finishReason` / safety blocks improves reliability.
   - `GEMINI_THINKING_BUDGET` (`app.py:433–439`): if set to an empty string `""` in the environment, `int("")` raises a 500 error instead of treating it as unset.
4. **Markdown renderer bugs in `prediction-output.js` (`lines 238–287, 409–654`):**
   - Nested/indented list items: `line 614` (`/^\s{0,3}[-*+]\s+(.+)$/`) rejects list items indented by 4 or more spaces (common under numbered issues in Gemini output), causing `flushList()` to run and rendering the sub-bullets as raw `<p>    - ...</p>` text.
   - Inline `<br>` tags inside Markdown table cells or paragraphs are escaped by `escapeHtml(markdown)` at `line 412` and only restored when `<br>` is on a line by itself (`line 590`), leaving literal `<br>` text inside rendered tables.
   - Double-escaping of `alt` and `title` attributes in `renderInlineMarkdown` (`lines 255, 258, 269`) because `escapeHtml` was already applied globally at `line 412`.

---

## 7. Complete Inventory of Element IDs, Form Name Attributes, and CSS Hooks (Rule 3)

### A. Element IDs Depended On by Scripts
| Element ID | File(s) Referencing It | Purpose |
|---|---|---|
| `theme-toggle` | `scripts/main.js` (`lines 37, 55, 80`), `mainPage.html` (`line 33`) | Checkbox input (`role="switch"`) controlling `document.documentElement.dataset.theme` (`"light"` / `"dark"`). |
| `prediction-form` | `scripts/prediction.js` (`line 2`), `pages/prediction.html` (`line 57`) | Predictor `<form>` element. |
| `predict-button` | `scripts/prediction.js` (`line 3`), `pages/prediction.html` (`line 135`) | Submit button disabled during `/api/predict` request. |
| `reset-button` | `scripts/prediction.js` (`line 143`) | Form reset button (referenced in `prediction.js:143`, previously missing in HTML). |
| `form-error` | `scripts/prediction.js` (`line 4`), `pages/prediction.html` (`line 132`) | Validation and API error container (`role="alert" aria-live="polite"`). |
| `results-placeholder` | `scripts/prediction.js` (`line 6`), `pages/prediction.html` (`line 156`) | Empty state shown before a prediction is run. |
| `results` | `scripts/prediction.js` (`line 7`), `pages/prediction.html` (`line 165`) | Results container toggled via `.hidden`. |
| `loading` | `scripts/prediction.js` (`line 8`), `pages/prediction.html` (`line 194`) | Loading state toggled via `.hidden` during `/api/predict`. |
| `results-title` | `pages/prediction.html` (`line 150`) | Heading referenced by `aria-labelledby="results-title"`. |
| `age` | `pages/prediction.html` (`line 61`) | Input for `Age_Days`. |
| `stem` | `pages/prediction.html` (`line 68`) | Input for `Stem_Length_Inches`. |
| `leaves` | `pages/prediction.html` (`line 75`) | Input for `Leaf_Count`. |
| `pot` | `pages/prediction.html` (`line 82`) | Select for `Pot_Size_Inches`. |
| `light` | `pages/prediction.html` (`line 93`) | Input for `Light_Lux`. |
| `water-volume` | `pages/prediction.html` (`line 100`) | Input for `Watering_Volume_mL`. |
| `frequency` | `pages/prediction.html` (`line 108`) | Input for `Watering_Freq_Days`. |
| `temperature` | `pages/prediction.html` (`line 116`) | Input for `Temperature_F`. |
| `humidity` | `pages/prediction.html` (`line 124`) | Select for `Humidity_Level`. |
| `no-data` | `scripts/prediction-output.js` (`line 5`), `pages/prediction-output.html` (`line 35`) | Fallback section when no prediction is stored. |
| `output` | `scripts/prediction-output.js` (`line 6`), `pages/prediction-output.html` (`line 49`) | Wrapper shown when prediction data exists. |
| `growth-result` | `scripts/prediction.js` (`line 60`), `scripts/prediction-output.js` (`line 43`) | 7-day predicted stem growth value (`predicted_growth_inches`). |
| `growth-lower-result` | `scripts/prediction-output.js` (`line 53`), `pages/prediction-output.html` (`line 77`) | 90% interval lower bound (`predicted_growth_lower_inches`). |
| `growth-upper-result` | `scripts/prediction-output.js` (`line 57`), `pages/prediction-output.html` (`line 79`) | 90% interval upper bound (`predicted_growth_upper_inches`). |
| `leaf-result` | `scripts/prediction.js` (`line 64`), `scripts/prediction-output.js` (`line 46`) | Unrounded total leaf count (`predicted_total_leaf_count`). |
| `rounded-leaf-result` | `scripts/prediction.js` (`line 70`), `scripts/prediction-output.js` (`line 49`) | Whole-leaf estimate. |
| `result-explanation` | `scripts/prediction.js` (`line 73`), `scripts/prediction-output.js` (`line 85`) | Plain-language explanation paragraph for 7-day results. |
| `multiweek-section` | `pages/prediction-output.html` (`line 117`) | Section wrapping 2-week and 4-week forecasts. |
| `week-2-length` | `scripts/prediction-output.js` (`line 114`), `pages/prediction-output.html` (`line 130`) | Week 2 projected stem length (`projected_stem_length_inches`). |
| `week-2-growth` | `scripts/prediction-output.js` (`line 117`), `pages/prediction-output.html` (`line 139`) | Week 2 cumulative growth (`cumulative_growth_inches`). |
| `week-2-leaves` | `scripts/prediction-output.js` (`line 120`), `pages/prediction-output.html` (`line 144`) | Week 2 rounded total leaves (`rounded_projected_total_leaf_count`). |
| `week-2-range-note` | `scripts/prediction-output.js` (`line 142`), `pages/prediction-output.html` (`line 132`) | Week 2 reference margin note. |
| `week-4-length` | `scripts/prediction-output.js` (`line 123`), `pages/prediction-output.html` (`line 152`) | Week 4 projected stem length (`projected_stem_length_inches`). |
| `week-4-growth` | `scripts/prediction-output.js` (`line 126`), `pages/prediction-output.html` (`line 161`) | Week 4 cumulative growth (`cumulative_growth_inches`). |
| `week-4-leaves` | `scripts/prediction-output.js` (`line 129`), `pages/prediction-output.html` (`line 166`) | Week 4 rounded total leaves (`rounded_projected_total_leaf_count`). |
| `week-4-range-note` | `scripts/prediction-output.js` (`line 143`), `pages/prediction-output.html` (`line 154`) | Week 4 reference margin note. |
| `multiweek-explanation` | `scripts/prediction-output.js` (`lines 99, 109, 132`), `pages/prediction-output.html` (`line 171`) | Multiweek methodology explanation paragraph. |
| `summary-section` | `pages/prediction-output.html` (`line 175`) | Section wrapping Gemini summary (`aria-labelledby="summary-title"`). |
| `summary-title` | `pages/prediction-output.html` (`line 176`) | Heading for Gemini summary section. |
| `reprompt-button` | `scripts/prediction-output.js` (`lines 668, 689, 802`), `pages/prediction-output.html` (`line 192`) | Regenerate summary button. |
| `reprompt-label` | `pages/prediction-output.html` (`line 214`) | Label span inside `#reprompt-button`. |
| `copy-button` | `scripts/prediction-output.js` (`lines 669, 685, 800`), `pages/prediction-output.html` (`line 218`) | Copy summary markdown button. |
| `copy-label` | `scripts/prediction-output.js` (`lines 670, 791, 796`), `pages/prediction-output.html` (`line 239`) | Label span inside `#copy-button`. |
| `summary-loading` | `scripts/prediction-output.js` (`lines 663, 682`), `pages/prediction-output.html` (`line 245`) | Loading indicator for Gemini summary. |
| `summary-text` | `scripts/prediction-output.js` (`lines 664, 683, 693`), `pages/prediction-output.html` (`line 252`) | Rendered Markdown output container. |
| `summary-error` | `scripts/prediction-output.js` (`lines 665, 684`), `pages/prediction-output.html` (`line 257`) | Error box for Gemini summary. |
| `summary-error-message` | `scripts/prediction-output.js` (`lines 666, 697`), `pages/prediction-output.html` (`line 258`) | Paragraph inside `#summary-error`. |
| `retry-button` | `scripts/prediction-output.js` (`lines 667, 801`), `pages/prediction-output.html` (`line 260`) | Retry button inside `#summary-error`. |
| `input-summary` | `scripts/prediction-output.js` (`line 168`), `pages/prediction-output.html` (`line 272`) | `<tbody>` receiving the user's entered input rows. |

### B. Form `name` Attributes (`prediction.html` & `prediction.js`)
All 9 form control `name` attributes map 1-to-1 to the backend `REQUIRED_FIELDS`:
- `Age_Days`
- `Stem_Length_Inches`
- `Leaf_Count`
- `Pot_Size_Inches`
- `Light_Lux`
- `Watering_Volume_mL`
- `Watering_Freq_Days`
- `Temperature_F`
- `Humidity_Level`

### C. DOM/CSS Hooks Depended On by Scripts
- `html[data-theme="light"]` / `html[data-theme="dark"]` (`document.documentElement.dataset.theme` in `scripts/main.js:30, 35, 109`).
- `localStorage` key `"botanists-theme"` (`scripts/main.js:4`).
- `sessionStorage` key `"pothosPrediction"` (`scripts/prediction.js:131`, `scripts/prediction-output.js:3`).
- `header, .site-header` and `nav, .site-nav` (`scripts/main.js:61, 95`).
- `.theme-control`, `.theme-switch`, `.theme-switch-label`, `.theme-switch-track`, `.theme-switch-thumb` (`scripts/main.js:68–89`).
- `.markdown-body`, `.markdown-aligned`, `.markdown-table-wrapper`, `.markdown-table` (`scripts/prediction-output.js:253, 383–384, 522`).
- `.growth-range-note`, `.result-grid`, `.result-card`, `.result-card-highlight`, `.result-label`, `.result-value`, `.result-unit`, `.input-table`, `.llm-box`, `.llm-box-header`, `.llm-box-label`, `.llm-box-actions`, `.copy-button`, `.llm-box-body`, `.llm-loading`, `.llm-spinner`, `.llm-text`, `.llm-error`, `.llm-retry` (`pages/prediction-output.html`, `styles/prediction-output.css`).
