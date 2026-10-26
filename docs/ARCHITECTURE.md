# Architecture & Developer Guide — The Botanists' Plant Simulation

## 1. Repository Layout

The static frontend lives inside `src/` and is served by `app.py` (Flask) via `send_from_directory`:

```text
PlantSimulationWebsite/
├── app.py                              # Flask backend (/api/predict, /api/summarize, static routes)
├── pothos_growth_model.py              # Synthetic dataset generator (2,000 plants × 104 weeks)
├── pothosRandomForestPredictions.py    # RF training & 90% split-conformal interval calibration
├── pothos_rf_models.joblib             # Serialized RF model + feature_columns + 90% error margin
├── sysprmt.txt                         # Botanical physiologist system prompt for Gemini
├── outputs/
│   └── rf_model_notes.md               # Detailed investigation of RF model & frontend contracts
├── docs/
│   ├── ARCHITECTURE.md                 # This architecture and extension guide
│   ├── CHANGELOG.md                    # Redesign, Gemini audit, and photo pipeline changelog
│   └── rf_model_notes.md               # Copy of RF model notes
├── tests/
│   └── test_rf_regression.py           # Mandatory RF regression + image validation + API test suite
└── src/
    ├── mainPage.html                   # Home hub + navigation tile grid + inline #predict instrument
    ├── pages/
    │   ├── about.html                  # System overview sub-page
    │   ├── planning.html               # Development roadmap sub-page
    │   ├── team.html                   # Research & engineering team sub-page
    │   ├── research.html               # Plant physiology notes sub-page
    │   ├── prediction.html             # Redirect page to ../mainPage.html#predict
    │   └── prediction-output.html      # Standalone full-page forecast report view
    ├── styles/
    │   ├── style.css                   # Master entry stylesheet (@imports all modules below)
    │   ├── prediction.css              # Predictor stylesheet entry
    │   ├── prediction-output.css       # Forecast output stylesheet entry
    │   ├── tokens.css                  # Light & dark theme CSS custom properties, typography, spacing
    │   ├── base.css                    # Reset, WCAG focus rings, reduced-motion rules
    │   ├── layout.css                  # Containers, tick-mark rulers, two-column workspace grids
    │   ├── background.css              # Slow topographic contour backdrop
    │   ├── components/
    │   │   ├── topbar.css              # Slim topbar, sub-page "Home" back control, theme switch
    │   │   ├── footer.css              # Shared instrument footer
    │   │   ├── button.css              # Primary, secondary, and ghost buttons
    │   │   ├── card.css                # Solid opaque instrument cards and result telemetry cards
    │   │   ├── tile.css                # Home navigation tile grid
    │   │   ├── field.css               # Form inputs, selects, unit tags, terracotta error alerts
    │   │   ├── pill.css                # Telemetry pills, eyebrows, and status dots
    │   │   ├── upload.css              # Drag-and-drop photo upload, thumbnail preview, remove control
    │   │   └── gemini-box.css          # Gemini summary box and rendered Markdown tables/typography
    │   └── pages/
    │       ├── home.css                # Editorial hero and specimen reference card
    │       ├── predict.css             # #predict section banner, empty/loading states, input log table
    │       ├── about.css               # About page specification cards
    │       ├── plan.css                # Roadmap phase timeline cards
    │       ├── team.css                # Researcher dossier cards
    │       └── research.css            # Physiological reference cards
    └── scripts/
        ├── main.js                     # Synchronous theme pre-loader + ES module bootstrap loader
        ├── prediction.js               # Predictor entry point (delegates to features/predict/form.js)
        ├── prediction-output.js        # Standalone report controller
        ├── config/
        │   └── pages.js                # Single Page Registry (PAGE_REGISTRY & SITE_META)
        ├── core/
        │   ├── init.js                 # Hydrates topbar, footer, contour canvas, tiles, and predictor
        │   ├── config.js               # Validation bounds, allowed pots/humidity, API endpoints
        │   ├── dom.js                  # Path resolution, reduced-motion check, count-up animator
        │   ├── theme.js                # Light/dark theme state and #theme-toggle binding
        │   └── background.js           # Low-contrast drifting contour canvas (pauses when hidden)
        ├── components/
        │   ├── topbar.js               # Shared slim topbar + sub-page "Home" back control
        │   ├── footer.js               # Shared instrument footer
        │   └── tiles.js                # Dynamic home tile grid generator
        └── features/
            ├── predict/
            │   ├── form.js             # Input validation, /api/predict submission, inline rendering
            │   ├── results.js          # 7-day, 90% interval, 14-day/28-day, and input table renderer
            │   └── upload.js           # Client-side magic-byte check & 1600px canvas downscaler
            └── summary/
                └── gemini.js           # Audited Markdown parser + /api/summarize client
```

---

## 2. Shared Top Bar, Footer, and Theme Architecture

Because `app.py` serves static HTML files directly from `src/` and `src/pages/` using `send_from_directory` (and developers may also preview `src/` with a static server), shared chrome is managed in one place via injected ES module components (`src/scripts/components/topbar.js` and `src/scripts/components/footer.js`), orchestrated by `src/scripts/core/init.js`:

1. **Zero-FOUC Theme Initialization (`src/scripts/main.js`):**
   - Loaded synchronously in `<head>` on every page.
   - Reads `localStorage.getItem("botanists-theme")` (falling back to `prefers-color-scheme`) and sets `document.documentElement.dataset.theme` (`"light"` or `"dark"`) **before** the browser paints `<body>`.
2. **Shared Slim Top Bar (`src/scripts/components/topbar.js`):**
   - Replaces legacy horizontal tab bars with a single slim instrument header containing:
     - The wordmark (`The Botanists' Plant Simulation`) and online status indicator.
     - Active module telemetry code (resolved from `PAGE_REGISTRY`).
     - A **"Home" back control** (`← Home`) rendered automatically on sub-pages (`isSubPage() === true`).
     - The accessible dark-mode switch (`#theme-toggle`, `role="switch"`).

---

## 3. How to Add a New Page

Adding a new page to the site requires only **two steps**:

1. **Register the page in `src/scripts/config/pages.js`:**
   Add an entry to `PAGE_REGISTRY`:
   ```js
   {
     id: "calibration",
     title: "Calibration",
     telemetryCode: "MOD · 05",
     description: "Split-conformal residual distributions across held-out test plants.",
     href: "pages/calibration.html",
     ctaLabel: "Open calibration data",
     enabled: true,
     isPrimary: false,
     icon: `<svg width="18" height="18" viewBox="0 0 24 24" ...>...</svg>`
   }
   ```
   - `src/scripts/components/tiles.js` will automatically generate a new tile on `mainPage.html` when `enabled: true`.
   - `src/scripts/components/topbar.js` will automatically display `MOD · 05` and the `← Home` back control when visiting `pages/calibration.html`.

2. **Create `src/pages/<page-name>.html`:**
   Include the shared stylesheet and `main.js` in `<head>`:
   ```html
   <link rel="stylesheet" href="../styles/style.css">
   <script src="../scripts/main.js"></script>
   ```
   Include `<header class="topbar site-header"></header>`, `<main id="main-content" class="instrument-main">...</main>`, and `<footer class="site-footer"></footer>`.

---

## 4. How to Add a New Component

1. **Styles:** Create `src/styles/components/<component>.css` using only theme tokens from `src/styles/tokens.css` (never hardcode theme-specific colors or use `backdrop-filter` on content cards; all content surfaces must remain solid opaque). Import the new file in `src/styles/style.css`.
2. **Behavior (if interactive):** Create an ES module in `src/scripts/components/<component>.js` (for shared UI) or `src/scripts/features/<feature>/<component>.js` (for feature-specific logic) and initialize it from `src/scripts/core/init.js`.
