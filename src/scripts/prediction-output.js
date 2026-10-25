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
  const growth = Number(result.predicted_growth_inches).toFixed(2);
  const leaves = Number(result.predicted_total_leaf_count).toFixed(2);
  const rounded = String(result.rounded_predicted_total_leaf_count);

  document.getElementById("growth-result").textContent = growth;
  document.getElementById("leaf-result").textContent = leaves;
  document.getElementById("rounded-leaf-result").textContent = rounded;

  document.getElementById("result-explanation").textContent =
    `The model estimates ${growth} inches of additional vine growth ` +
    `over the next seven days. Its estimated current total is ` +
    `${leaves} leaves, or approximately ${rounded} whole leaves. ` +
    `The leaf estimate is a prediction of total leaves, not the number ` +
    `of new leaves next week.`;
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

// Escape HTML before processing Markdown to prevent raw HTML injection.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderInlineMarkdown(text) {
  const codeSegments = [];

  let html = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const index = codeSegments.length;
    codeSegments.push(`<code>${code}</code>`);
    return `\u0000INLINECODE${index}\u0000`;
  });

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

// Splits a Markdown table row while respecting escaped pipes and code spans.
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
  const headerCells = splitTableRow(lines[startIndex]);
  const separatorCells = splitTableRow(lines[startIndex + 1]);

  if (
    headerCells.length === 0 ||
    !isTableSeparator(lines[startIndex + 1])
  ) {
    return null;
  }

  const columnCount = headerCells.length;
  const alignments = Array.from({ length: columnCount }, (_, index) => {
    const separator = (separatorCells[index] || "---").replace(/\s/g, "");

    if (separator.startsWith(":") && separator.endsWith(":")) {
      return "center";
    }

    if (separator.endsWith(":")) {
      return "right";
    }

    return "left";
  });

  const rows = [];
  let index = startIndex + 2;

  while (index < lines.length && lines[index].includes("|")) {
    const cells = splitTableRow(lines[index]);

    if (cells.length === 1 && cells[0] === "") break;

    rows.push(cells);
    index += 1;
  }

  const renderCells = (cells, tag) => {
    const normalizedCells = Array.from(
      { length: columnCount },
      (_, i) => cells[i] || ""
    );

    return `<tr>${normalizedCells.map((cell, i) =>
      `<${tag} style="text-align:${alignments[i]}">` +
      `${renderInlineMarkdown(cell)}</${tag}>`
    ).join("")}</tr>`;
  };

  const html =
    `<div class="markdown-table-wrapper">` +
    `<table class="markdown-table">` +
    `<thead>${renderCells(headerCells, "th")}</thead>` +
    `<tbody>${rows.map((row) => renderCells(row, "td")).join("")}</tbody>` +
    `</table></div>`;

  return { html, nextIndex: index };
}

function renderMarkdown(markdown) {
  const lines = escapeHtml(markdown)
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const blocks = [];

  let paragraph = [];
  let listType = null;
  let listItems = [];
  let quoteLines = [];

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

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(/^```([\w-]*)\s*$/);

    // Fenced code blocks
    if (fenceMatch) {
      flushAll();

      const language = fenceMatch[1];
      const codeLines = [];

      i += 1;

      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }

      const languageClass = language
        ? ` class="language-${language}"`
        : "";

      blocks.push(
        `<pre><code${languageClass}>${codeLines.join("\n")}</code></pre>`
      );

      continue;
    }

    // Markdown tables: header row followed by a separator row.
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

    // Headings
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

    // Horizontal rules
    if (/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushAll();
      blocks.push("<hr>");
      continue;
    }

    // Blockquotes
    const quoteMatch = line.match(/^\s{0,3}&gt;\s?(.*)$/);

    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines.push(quoteMatch[1]);
      continue;
    }

    flushQuote();

    // Ordered and unordered lists
    const unorderedMatch = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\s{0,3}\d+\.\s+(.+)$/);

    if (unorderedMatch || orderedMatch) {
      flushParagraph();

      const nextType = unorderedMatch ? "ul" : "ol";

      if (listType && listType !== nextType) {
        flushList();
      }

      if (!listType) {
        listType = nextType;
      }

      listItems.push((unorderedMatch || orderedMatch)[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushAll();

  return blocks.join("\n");
}

// Gemini summary
const SUMMARY_URL = "/api/summarize";
const SUMMARY_TIMEOUT_MS = 45000;

const summaryLoading = document.getElementById("summary-loading");
const summaryText = document.getElementById("summary-text");
const summaryError = document.getElementById("summary-error");
const summaryErrorMessage = document.getElementById("summary-error-message");
const retryButton = document.getElementById("retry-button");
const copyButton = document.getElementById("copy-button");
const copyLabel = document.getElementById("copy-label");

let summaryInputs = null;
let summaryMarkdown = "";
let copyTimer = null;

function setSummaryState(state, text = "") {
  summaryLoading.hidden = state !== "loading";
  summaryText.hidden = state !== "ready";
  summaryError.hidden = state !== "error";
  copyButton.disabled = state !== "ready";

  if (state === "ready") {
    summaryMarkdown = text;
    summaryText.innerHTML = renderMarkdown(text);
  }

  if (state === "error") {
    summaryErrorMessage.textContent = text;
  }
}

async function loadSummary() {
  if (!summaryInputs) {
    setSummaryState(
      "error",
      "Your entered conditions are missing. Run a new prediction to get a summary."
    );
    return;
  }

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
      // The server returned a non-JSON response.
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

      if (!copied) throw new Error("Copy failed");
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

const saved = loadPrediction();

if (saved && saved.result) {
  showResults(saved.result);
  showInputs(saved.inputs || {});

  output.hidden = false;

  summaryInputs = saved.inputs || null;
  loadSummary();
} else {
  noData.hidden = false;
}