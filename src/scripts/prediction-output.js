// Reads the prediction saved by prediction.js and displays it.

const STORAGE_KEY = "pothosPrediction";

const noData = document.getElementById("no-data");
const output = document.getElementById("output");

const INPUT_LABELS = [
  ["Age_Days", "Plant age", (v) => `${v} days`],
  ["Stem_Length_Inches", "Total vine length", (v) => `${v} in`],
  ["Leaf_Count", "Current leaf count", (v) => `${v} leaves`],
  ["Pot_Size_Inches", "Pot diameter", (v) => `${v} in`],
  ["Light_Lux", "Light level", (v) => `${Number(v).toLocaleString()} lux`],
  ["Watering_Volume_mL", "Water per watering", (v) => `${v} mL`],
  ["Watering_Freq_Days", "Watering interval", (v) => `every ${v} days`],
  ["Temperature_F", "Temperature", (v) => `${v} °F`],
  ["Humidity_Level", "Humidity", (v) => String(v)]
];

function loadPrediction() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}


function showResults(result) {
  const growth = Number(
    result.predicted_growth_inches
  ).toFixed(2);

  const leaves = Number(
    result.predicted_total_leaf_count
  ).toFixed(2);

  const rounded = String(
    result.rounded_predicted_total_leaf_count
  );

  document.getElementById("growth-result").textContent =
    growth;

  document.getElementById("leaf-result").textContent =
    leaves;

  document.getElementById("rounded-leaf-result").textContent =
    rounded;

  const lowerElement = document.getElementById(
    "growth-lower-result"
  );

  const upperElement = document.getElementById(
    "growth-upper-result"
  );

  const margin = Number(
    result.growth_margin_of_error_inches
  );

  const lower = Number(
    result.predicted_growth_lower_inches
  );

  const upper = Number(
    result.predicted_growth_upper_inches
  );

  if (
    Number.isFinite(margin) &&
    Number.isFinite(lower) &&
    Number.isFinite(upper)
  ) {
    lowerElement.textContent = lower.toFixed(2);
    upperElement.textContent = upper.toFixed(2);
  } else {
    // Handles older predictions saved before intervals were added.
    lowerElement.textContent = "Unavailable";
    upperElement.textContent = "Unavailable";
  }

  document.getElementById("result-explanation").textContent =
    `The model estimates ${growth} inches of additional vine growth ` +
    `over the next seven days. Its estimated current total is ` +
    `${leaves} leaves, or approximately ${rounded} whole leaves. ` +
    `The leaf estimate is a prediction of total leaves, not the number ` +
    `of new leaves next week.`;
}



function showMultiweekForecast(result) {
  const forecasts = result.weekly_forecasts;

  if (!Array.isArray(forecasts)) {
    document.getElementById("multiweek-explanation").textContent =
      "These extended forecasts are not available for this saved " +
      "prediction. Please return to the prediction page and run a new forecast.";
    return;
  }

  const week2 = forecasts.find((item) => item.week === 2);
  const week4 = forecasts.find((item) => item.week === 4);

  if (!week2 || !week4) {
    document.getElementById("multiweek-explanation").textContent =
      "The extended forecast could not be loaded. Please run a new prediction.";
    return;
  }

  document.getElementById("week-2-length").textContent =
    Number(week2.projected_stem_length_inches).toFixed(2);

  document.getElementById("week-2-growth").textContent =
    Number(week2.cumulative_growth_inches).toFixed(2);

  document.getElementById("week-2-leaves").textContent =
    String(week2.rounded_projected_total_leaf_count);

  document.getElementById("week-4-length").textContent =
    Number(week4.projected_stem_length_inches).toFixed(2);

  document.getElementById("week-4-growth").textContent =
    Number(week4.cumulative_growth_inches).toFixed(2);

  document.getElementById("week-4-leaves").textContent =
    String(week4.rounded_projected_total_leaf_count);

  document.getElementById("multiweek-explanation").textContent =
    "The 2-week and 4-week results are sequential projections. " +
    "Each simulated week updates plant age and vine length before " +
    "the next Random Forest prediction. New leaves are estimated " +
    "from predicted growth using the 1.2-inch average leaf-spacing " +
    "assumption; they are not independently predicted by the model.";
      // Show the calibrated one-week error margin as a reference
  // for the sequential multiweek forecasts.
  const margin = Number(result.growth_margin_of_error_inches);

  const week2Note = document.getElementById("week-2-range-note");
  const week4Note = document.getElementById("week-4-range-note");

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


function showInputs(inputs) {
  const body = document.getElementById("input-summary");
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
}

// ---------------------------------------------------------------
// Safe Markdown renderer for Gemini summaries.
//
// Supports:
// - Headings, paragraphs, bold, italic, strikethrough
// - Inline code and fenced code blocks
// - Markdown tables with alignment
// - Blockquotes and ordered/unordered lists
// - Horizontal rules
// - <div align="center">, left, right, and justify wrappers
// - Common AI-generated HTML formatting tags such as <br>,
//   <hr>, <strong>, <em>, <b>, <i>, <code>, and <pre>
// - Links and images using safe URL protocols
//
// Raw HTML is escaped unless explicitly handled below.
// ---------------------------------------------------------------

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function safeUrl(value, allowImage = false) {
  const url = decodeHtmlEntities(value.trim());

  if (/^(https?:|mailto:)/i.test(url)) {
    return escapeHtml(url);
  }

  if (allowImage && /^data:image\/(?:png|gif|jpeg|webp);base64,/i.test(url)) {
    return escapeHtml(url);
  }

  return null;
}

function renderInlineMarkdown(text) {
  const codeSegments = [];

  let html = String(text).replace(/`([^`\n]+)`/g, (_, code) => {
    const index = codeSegments.length;
    codeSegments.push(`<code>${code}</code>`);
    return `\u0000INLINECODE${index}\u0000`;
  });

  // Escape Markdown links and images are handled before emphasis.
  html = html.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (match, alt, url, title) => {
      const safe = safeUrl(url, true);
      if (!safe) return match;

      const titleAttribute = title
        ? ` title="${escapeHtml(title)}"`
        : "";

      return `<img src="${safe}" alt="${escapeHtml(alt)}"${titleAttribute} loading="lazy">`;
    }
  );

  html = html.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (match, label, url, title) => {
      const safe = safeUrl(url);
      if (!safe) return match;

      const titleAttribute = title
        ? ` title="${escapeHtml(title)}"`
        : "";

      return `<a href="${safe}"${titleAttribute} target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
  );

  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");

  return html.replace(
    /\u0000INLINECODE(\d+)\u0000/g,
    (_, index) => codeSegments[Number(index)]
  );
}

function splitTableRow(line) {
  let text = line.trim();

  if (text.startsWith("|")) text = text.slice(1);

  if (text.endsWith("|") && !text.endsWith("\\|")) {
    text = text.slice(0, -1);
  }

  const cells = [];
  let cell = "";
  let escaped = false;
  let inCode = false;

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];

    if (character === "\\" && !escaped) {
      escaped = true;
      cell += character;
      continue;
    }

    if (character === "`" && !escaped) {
      inCode = !inCode;
      cell += character;
      continue;
    }

    if (character === "|" && !escaped && !inCode) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }

    escaped = false;
  }

  cells.push(cell.trim());

  return cells.map((value) => value.replace(/\\\|/g, "|"));
}

function isTableSeparator(line) {
  if (!line.includes("|")) return false;

  const cells = splitTableRow(line);

  return cells.length > 0 && cells.every((cell) =>
    /^:?-{3,}:?$/.test(cell.replace(/\s/g, ""))
  );
}

function renderTable(lines, startIndex) {
  if (startIndex + 1 >= lines.length) return null;
  if (!isTableSeparator(lines[startIndex + 1])) return null;

  const headers = splitTableRow(lines[startIndex]);
  const separators = splitTableRow(lines[startIndex + 1]);
  const columnCount = headers.length;

  const alignments = Array.from({ length: columnCount }, (_, i) => {
    const separator = (separators[i] || "---").replace(/\s/g, "");

    if (separator.startsWith(":") && separator.endsWith(":")) {
      return "center";
    }

    if (separator.endsWith(":")) return "right";

    return "left";
  });

  const rows = [];
  let index = startIndex + 2;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim() || !line.includes("|")) break;

    rows.push(splitTableRow(line));
    index += 1;
  }

  function renderCells(cells, tag) {
    return `<tr>${Array.from({ length: columnCount }, (_, i) => {
      const value = cells[i] || "";
      return `<${tag} style="text-align:${alignments[i]}">${renderInlineMarkdown(value)}</${tag}>`;
    }).join("")}</tr>`;
  }

  const html =
    `<div class="markdown-table-wrapper">` +
      `<table class="markdown-table">` +
        `<thead>${renderCells(headers, "th")}</thead>` +
        `<tbody>${rows.map((row) => renderCells(row, "td")).join("")}</tbody>` +
      `</table>` +
    `</div>`;

  return { html, nextIndex: index };
}

// Recognizes an escaped opening wrapper, for example:
// &lt;div align=&quot;center&quot;&gt;
function extractDivAlignment(line) {
  const decoded = decodeHtmlEntities(line).trim();

  const match = decoded.match(
    /^<div(?:\s+align\s*=\s*["']?(left|center|right|justify)["']?)?\s*>$/i
  );

  return match ? (match[1] || "left").toLowerCase() : null;
}

function isDivClosingTag(line) {
  return /^<\/div\s*>$/i.test(decodeHtmlEntities(line).trim());
}

function renderMarkdown(markdown) {
  // Escape all raw HTML first. Supported tags are recognized only
  // after decoding individual lines for comparison.
  const lines = escapeHtml(markdown)
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const blocks = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];
  let quoteLines = [];
  let divAlignments = [];
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeLines = [];

  function flushParagraph() {
    if (!paragraph.length) return;

    blocks.push(
      `<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`
    );

    paragraph = [];
  }

  function flushList() {
    if (!listType || !listItems.length) {
      listType = null;
      listItems = [];
      return;
    }

    blocks.push(
      `<${listType}>${listItems
        .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
        .join("")}</${listType}>`
    );

    listType = null;
    listItems = [];
  }

  function flushQuote() {
    if (!quoteLines.length) return;

    blocks.push(
      `<blockquote>${quoteLines
        .map((line) => `<p>${renderInlineMarkdown(line)}</p>`)
        .join("")}</blockquote>`
    );

    quoteLines = [];
  }

  function flushAll() {
    flushParagraph();
    flushList();
    flushQuote();
  }

  function closeOpenDivs() {
    flushAll();

    while (divAlignments.length) {
      blocks.push("</div>");
      divAlignments.pop();
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Fenced code blocks take priority: do not parse Markdown or wrappers
    // inside code fences.
    const fenceMatch = line.match(/^```([\w+-]*)\s*$/);

    if (fenceMatch && !inCodeBlock) {
      flushAll();
      inCodeBlock = true;
      codeLanguage = fenceMatch[1];
      codeLines = [];
      continue;
    }

    if (inCodeBlock) {
      if (/^```\s*$/.test(line)) {
        const languageClass = codeLanguage
          ? ` class="language-${escapeHtml(codeLanguage)}"`
          : "";

        blocks.push(
          `<pre><code${languageClass}>${codeLines.join("\n")}</code></pre>`
        );

        inCodeBlock = false;
        codeLanguage = "";
        codeLines = [];
      } else {
        codeLines.push(line);
      }

      continue;
    }

    // Supported <div align="..."> wrapper.
    const alignment = extractDivAlignment(line);

    if (alignment !== null) {
      flushAll();

      blocks.push(
        `<div class="markdown-aligned" style="text-align:${alignment}">`
      );

      divAlignments.push(alignment);
      continue;
    }

    // Supported closing wrapper.
    if (isDivClosingTag(line)) {
      flushAll();

      if (divAlignments.length) {
        blocks.push("</div>");
        divAlignments.pop();
      }

      continue;
    }

    // Markdown tables.
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      flushAll();

      const table = renderTable(lines, i);

      if (table) {
        blocks.push(table.html);
        i = table.nextIndex - 1;
        continue;
      }
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    // Headings, including trailing optional hashes.
    const headingMatch = line.match(
      /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
    );

    if (headingMatch) {
      flushAll();

      const level = headingMatch[1].length;

      blocks.push(
        `<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`
      );

      continue;
    }

    // Horizontal rules.
    if (/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushAll();
      blocks.push("<hr>");
      continue;
    }

    // Common standalone HTML formatting tags from AI output.
    const decodedLine = decodeHtmlEntities(line).trim();

    if (/^<br\s*\/?>$/i.test(decodedLine)) {
      flushAll();
      blocks.push("<br>");
      continue;
    }

    if (/^<hr\s*\/?>$/i.test(decodedLine)) {
      flushAll();
      blocks.push("<hr>");
      continue;
    }

    // Blockquotes.
    const quoteMatch = line.match(/^\s{0,3}&gt;\s?(.*)$/);

    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines.push(quoteMatch[1]);
      continue;
    }

    flushQuote();

    // Ordered and unordered lists.
    const unorderedMatch = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\s{0,3}\d+\.\s+(.+)$/);

    if (unorderedMatch || orderedMatch) {
      flushParagraph();

      const nextType = unorderedMatch ? "ul" : "ol";

      if (listType && listType !== nextType) flushList();
      if (!listType) listType = nextType;

      listItems.push((unorderedMatch || orderedMatch)[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  // Preserve incomplete fenced code blocks rather than losing their contents.
  if (inCodeBlock) {
    const languageClass = codeLanguage
      ? ` class="language-${escapeHtml(codeLanguage)}"`
      : "";

    blocks.push(
      `<pre><code${languageClass}>${codeLines.join("\n")}</code></pre>`
    );
  }

  flushAll();

  // Close wrappers left open by incomplete model output.
  while (divAlignments.length) {
    blocks.push("</div>");
    divAlignments.pop();
  }

  return blocks.join("\n");
}

// ---------------------------------------------------------------
// Gemini summary (served by /api/summarize in app.py)
// ---------------------------------------------------------------

const SUMMARY_URL = "/api/summarize";
const SUMMARY_TIMEOUT_MS = 45000;

const summaryLoading = document.getElementById("summary-loading");
const summaryText = document.getElementById("summary-text");
const summaryError = document.getElementById("summary-error");
const summaryErrorMessage = document.getElementById("summary-error-message");
const retryButton = document.getElementById("retry-button");
const repromptButton = document.getElementById("reprompt-button");
const copyButton = document.getElementById("copy-button");
const copyLabel = document.getElementById("copy-label");

let summaryInputs = null;
let summaryMarkdown = "";
let copyTimer = null;

// True from the moment a summary request starts until it succeeds, fails,
// or times out. Guards against overlapping requests even if something
// other than the button (Try again, a double-click race) calls loadSummary.
let isGenerating = false;

function setSummaryState(state, text = "") {
  summaryLoading.hidden = state !== "loading";
  summaryText.hidden = state !== "ready";
  summaryError.hidden = state !== "error";
  copyButton.disabled = state !== "ready";

  // Grayed out while a summary is generating. Also disabled if there are
  // no saved inputs, since there would be nothing to send.
  repromptButton.disabled = state === "loading" || !summaryInputs;

  if (state === "ready") {
    summaryMarkdown = text;
    summaryText.innerHTML = renderMarkdown(text);
  }

  if (state === "error") {
    summaryErrorMessage.textContent = text;
  }
}

async function loadSummary() {
  // Ignore the call if a summary is already being generated.
  if (isGenerating) return;

  if (!summaryInputs) {
    setSummaryState(
      "error",
      "Your entered conditions are missing. Run a new prediction to get a summary."
    );
    return;
  }

  isGenerating = true;
  setSummaryState("loading");

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    SUMMARY_TIMEOUT_MS
  );

  try {
    const response = await fetch(SUMMARY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(summaryInputs),
      signal: controller.signal
    });

    let payload = {};

    try {
      payload = await response.json();
    } catch (error) {
      // Non-JSON reply, such as a server error page.
    }

    if (!response.ok || !payload.summary) {
      throw new Error(
        payload.error || "The summary couldn't be generated."
      );
    }

    setSummaryState("ready", payload.summary);
  } catch (error) {
    let message = error.message;

    if (error.name === "AbortError") {
      message = "The summary took too long to generate.";
    } else if (error instanceof TypeError) {
      message = "Unable to reach the summary service.";
    }

    setSummaryState("error", message);
  } finally {
    clearTimeout(timer);
    isGenerating = false;
  }
}

async function copySummary() {
  const text = summaryMarkdown;
  let label = "Copied";

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const helper = document.createElement("textarea");

      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";

      document.body.appendChild(helper);
      helper.select();

      const copied = document.execCommand("copy");

      document.body.removeChild(helper);

      if (!copied) {
        throw new Error("Copy failed");
      }
    }
  } catch (error) {
    label = "Copy failed";
  }

  copyLabel.textContent = label;

  clearTimeout(copyTimer);

  copyTimer = setTimeout(() => {
    copyLabel.textContent = "Copy";
  }, 1800);
}

copyButton.addEventListener("click", copySummary);
retryButton.addEventListener("click", loadSummary);
repromptButton.addEventListener("click", loadSummary);

const saved = loadPrediction();

if (saved && saved.result) {
  showResults(saved.result);
  showMultiweekForecast(saved.result);
  showInputs(saved.inputs || {});

  output.hidden = false;

  summaryInputs = saved.inputs || null;
  loadSummary();
} else {
  noData.hidden = false;
}