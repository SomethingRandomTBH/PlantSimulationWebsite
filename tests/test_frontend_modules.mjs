import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PAGE_REGISTRY, SITE_META } from "../src/scripts/config/pages.js";
import {
  ALLOWED_HUMIDITY,
  ALLOWED_POTS,
  VALIDATION_RANGES
} from "../src/scripts/core/config.js";
import { validateInputs } from "../src/scripts/features/predict/form.js";
import { renderMarkdown } from "../src/scripts/features/summary/gemini.js";

// 1. Verify Page Registry
assert.equal(PAGE_REGISTRY.length, 5, "Expected 5 entries in PAGE_REGISTRY");
const ids = PAGE_REGISTRY.map((p) => p.id);
assert.deepEqual(ids, ["about", "planning", "team", "research", "predict"]);
for (const entry of PAGE_REGISTRY) {
  assert.ok(entry.title && entry.description && entry.href && entry.icon);
  assert.equal(entry.enabled, true);
}

// 2. Verify Frontend Input Validation matches Backend LIMITS
const validPayload = {
  Age_Days: 90,
  Stem_Length_Inches: 24,
  Leaf_Count: 20,
  Pot_Size_Inches: 6,
  Light_Lux: 2500,
  Watering_Volume_mL: 300,
  Watering_Freq_Days: 7,
  Temperature_F: 75,
  Humidity_Level: "Average"
};
assert.equal(validateInputs(validPayload), null);
assert.notEqual(
  validateInputs({ ...validPayload, Age_Days: 751 }),
  null,
  "Age_Days=751 must be rejected on frontend to match backend LIMITS (1..750)"
);
assert.notEqual(
  validateInputs({ ...validPayload, Age_Days: 45.5 }),
  null,
  "Non-integer Age_Days must be rejected"
);

// 3. Verify Audited Markdown Parser Fixes
const sampleReport = [
  '<div align="center">',
  "",
  "# Pothos Growth Analysis & Care Recommendations",
  "",
  "</div>",
  "",
  "| Parameter | Value | Context |",
  "|:---|:---:|---:|",
  "| Stem Length | 24 in | Line 1<br>Line 2 |",
  "",
  "## **1. Issues Found**",
  "",
  "1. **Seasonal Slowdown**",
  "    - **Observed Metrics:** 1.19 inches/week",
  "    - **Impact:** Healthy active growth",
].join("\n");

const rendered = renderMarkdown(sampleReport);
assert.ok(
  rendered.includes('<div class="markdown-aligned" style="text-align:center">'),
  "Expected centered div wrapper"
);
assert.ok(
  rendered.includes('<table class="markdown-table">'),
  "Expected rendered markdown table"
);
assert.ok(
  rendered.includes("Line 1<br>Line 2"),
  "Expected inline <br> inside table cell to be preserved as <br>"
);
assert.ok(
  rendered.includes("<li><strong>Observed Metrics:</strong> 1.19 inches/week</li>"),
  "Expected 4-space indented bullet to render as <li> rather than raw hyphen paragraph"
);

// 4. Verify No Content Card Uses backdrop-filter
const stylesDir = path.resolve("src/styles");
function getAllCssFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? getAllCssFiles(full) : full.endsWith(".css") ? [full] : [];
  });
}

for (const cssFile of getAllCssFiles(stylesDir)) {
  const rawContent = fs.readFileSync(cssFile, "utf8");
  const withoutComments = rawContent.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(
    !withoutComments.includes("backdrop-filter"),
    `Found forbidden backdrop-filter in ${cssFile}`
  );
}

console.log("All frontend module, validation, Markdown, and CSS surface checks passed.");
