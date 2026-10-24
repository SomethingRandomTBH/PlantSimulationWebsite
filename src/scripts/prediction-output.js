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

// ---------------------------------------------------------------
// Safe Markdown renderer for the Gemini summary.
// Supports headings, paragraphs, bold, italic, strikethrough,
// inline code, fenced code blocks, blockquotes, and lists.
// Raw HTML is escaped before rendering.
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

function renderInlineMarkdown(text) {
  const inlineCode = [];

  let html = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const index = inlineCode.length;
    inlineCode.push(`<code>${code}</code>`);
    return `\u0000INLINECODE${index}\u0000`;
  });

  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>")
    .replace(
      /\u0000INLINECODE(\d+)\u0000/g,
      (_, index) => inlineCode[Number(index)]
    );

  return html;
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

    // Blank lines separate blocks.
    if (!line.trim()) {
      flushAll();
      continue;
    }

    // Headings: # through ######
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

    // Regular paragraph text
    flushList();
    paragraph.push(line);
  }

  flushAll();

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
      // Non-JSON reply (for example, a server error page).
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
  // Copy the original Markdown rather than the rendered HTML.
  const text = summaryMarkdown;
  let label = "Copied";

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for pages not served over HTTPS or localhost.
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