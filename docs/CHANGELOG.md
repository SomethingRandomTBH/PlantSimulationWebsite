# Changelog — Redesign, Gemini Pipeline Audit, & Optional Plant Photo Input

## 1. Visual Design & Earth-Grounded 2030s Instrument Redesign (Part 2)
- **Design System (`src/styles/tokens.css`, `base.css`, `layout.css`, `background.css`):**
  - Built a modular plain-CSS token system anchored on brand greens (`#116229`, `#234b35`), alabaster (`#F4F1EA`), clay/terracotta (`#B5654A`) for warnings, and lichen/mineral sage (`#A7C4A0`) for telemetry accents.
  - Added a dedicated night-soil dark theme (`#0F1612` to `#151E19` canvas with solid `#18231D` / `#1E2C24` opaque card surfaces) meeting WCAG AA contrast standards.
  - Loaded `Manrope` (UI sans), `IBM Plex Mono` (numbers, coordinates, and telemetry labels), and `Fraunces` (editorial headlines) with full system font fallbacks.
  - Added fine tick-mark rulers (`.tick-ruler`), hairline section grids, status dots, and telemetry pills (`FORECAST · 7D`, `CONFORMAL · 90%`).
  - Added a slow, low-contrast drifting topographic contour canvas (`src/scripts/core/background.js`) that pauses automatically when `document.hidden` is true and renders a single static frame under `prefers-reduced-motion: reduce`.
  - **Opaque Surface Guarantee:** Content cards, tiles, forms, and the Gemini box use 100% solid opaque surfaces without `backdrop-filter`.

## 2. Navigation, Page Registry, & Inline Predictor (Part 3)
- **Single Page Registry (`src/scripts/config/pages.js`):**
  - Centralized page metadata (`id`, `title`, `telemetryCode`, `description`, `href`, `icon`, `enabled`, `isPrimary`) into `PAGE_REGISTRY`.
  - Generated the home navigation tile grid (`src/scripts/components/tiles.js`) and sub-page topbar metadata + `← Home` back control (`src/scripts/components/topbar.js`) from `PAGE_REGISTRY`.
- **Slim Top Bar:**
  - Removed all horizontal tab bars across `mainPage.html` and `pages/*.html`, replacing them with a single slim topbar containing the wordmark, telemetry status badge, sub-page `← Home` back control, and `#theme-toggle` switch.
- **Predictor Moved to Home Page (`mainPage.html#predict`) + Standalone Report Compatibility:**
  - Moved the predictor into `<section id="predict">` on `src/mainPage.html` in a two-column desktop layout (collapsing to a single column on mobile).
  - **How results are shown:** Both the 7-day forecast (with 90% prediction interval), sequential 2-week and 4-week forecasts, count-up number animations, and the Gemini botanical summary render **inline directly inside `#predict` on `mainPage.html`** (the preferred flow). Simultaneously, predictions are saved to `sessionStorage` (`"pothosPrediction"`) and `src/pages/prediction-output.html` is restyled and kept 100% functional for standalone report viewing and backward compatibility.
  - Converted `src/pages/prediction.html` into an automatic redirect page pointing to `../mainPage.html#predict`.

## 3. Optional Plant Photo Upload & Backend Validation (Part 4)
- **Frontend (`src/scripts/features/predict/upload.js`):**
  - Added an optional drag-and-drop, click-to-browse, and mobile camera (`capture="environment"`) photo control inside `#prediction-form`.
  - Validates JPEG, PNG, and WebP formats using both MIME type and client-side magic bytes, rejecting unsupported formats with an accessible alert.
  - Downscales images in an offscreen `<canvas>` to a maximum of `1600px` on the long edge and re-encodes via `canvas.toBlob`, stripping EXIF metadata before upload.
  - Displays a thumbnail preview, pixel dimensions, compressed size in KB, and a Remove button.
- **Backend (`app.py`):**
  - Added `detect_image_mime_from_magic` and `validate_uploaded_image` in `app.py` to inspect real magic bytes (`\xff\xd8\xff` JPEG, `\x89PNG\r\n\x1a\n` PNG, `RIFF....WEBP` WebP), enforce a 5 MB file size limit and 4096px maximum dimension via `PIL.Image` in memory (`io.BytesIO`), never writing uploaded images to disk and never logging image bytes.
  - Updated `/api/summarize` to accept both `multipart/form-data` (fields + optional `photo` file) and the existing `application/json` body, passing the validated image as an `inline_data` part to Gemini alongside the text prompt.

## 4. Gemini Pipeline & Frontend Audit Fixes
1. **Model Identifier Fix (`app.py`):** Updated default `GEMINI_MODEL` from invalid `"gemini-3.5-flash-lite"` (which returned HTTP 404 on Google's Generative Language `v1beta` endpoint) to `"gemini-2.5-flash-lite"` with automatic fallback (`gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.0-flash`) on 404.
2. **Prompt Schema Alignment (`app.py` & `sysprmt.txt`):** Updated `build_user_prompt` to supply `Current_Date` in `YYYY-MM-DD` format (required by `sysprmt.txt`), `Stem_Length_Baseline_Leaf_Count`, the 90% prediction interval bounds, and the 2-week / 4-week sequential forecasts, plus visual inspection instructions when a plant photo is attached.
3. **Output Token Budget & Thinking Config (`app.py`):** Increased `GEMINI_MAX_OUTPUT_TOKENS` from `2048` to `4096` to prevent mid-report truncation and guarded `GEMINI_THINKING_BUDGET` against empty-string environment variables.
4. **Markdown Parser Fixes (`src/scripts/features/summary/gemini.js`):** Fixed nested list items indented by 4+ spaces, restored inline `<br>` tags inside Markdown table cells, and fixed double-escaping of link/image attributes.
5. **Input Validation & Missing Reset Button Fix (`src/scripts/features/predict/form.js`):** Aligned frontend `Age_Days` range (`[1, 750]`) and HTML `max="750"` with backend `LIMITS["Age_Days"] = (1, 750)`, and added `#reset-button` to the form markup to eliminate the previous uncaught `TypeError` in `prediction.js`.
