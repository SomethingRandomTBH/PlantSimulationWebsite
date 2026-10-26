/**
 * Gemini Summary Controller & Safe Markdown Renderer
 * Audited & fixed for:
 * - Multi-space indented list items (4+ spaces under numbered items)
 * - Inline <br> tags inside Markdown table cells and paragraphs
 * - Double-escaping prevention on link/image attributes
 * - Multipart/form-data photo submission alongside JSON fallback
 */

import { API_ENDPOINTS } from "../../core/config.js";
import { dataUrlToBlob } from "../predict/upload.js";

const SUMMARY_TIMEOUT_MS = 45000;

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function decodeHtmlEntities(value) {
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

export function renderInlineMarkdown(text) {
  const codeSegments = [];

  let html = String(text).replace(/`([^`\n]+)`/g, (_, code) => {
    const index = codeSegments.length;
    codeSegments.push(`<code>${code}</code>`);
    return `\u0000INLINECODE${index}\u0000`;
  });

  // Restore safe inline <br> tags that Gemini emits inside table cells or prose.
  html = html.replace(/&lt;br\s*\/?&gt;/gi, "<br>");

  // Images and links (note: text is already HTML-escaped, so quotes may be &quot;)
  html = html.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|&quot;(.*?)&quot;))?\)/g,
    (match, alt, url, titleRaw, titleEsc) => {
      const safe = safeUrl(url, true);
      if (!safe) return match;
      const title = titleRaw || titleEsc || "";
      const titleAttribute = title ? ` title="${escapeHtml(decodeHtmlEntities(title))}"` : "";
      return `<img src="${safe}" alt="${alt}"${titleAttribute} loading="lazy">`;
    }
  );

  html = html.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+(?:"([^"]*)"|&quot;(.*?)&quot;))?\)/g,
    (match, label, url, titleRaw, titleEsc) => {
      const safe = safeUrl(url);
      if (!safe) return match;
      const title = titleRaw || titleEsc || "";
      const titleAttribute = title ? ` title="${escapeHtml(decodeHtmlEntities(title))}"` : "";
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
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")))
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
    if (separator.startsWith(":") && separator.endsWith(":")) return "center";
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

export function renderMarkdown(markdown) {
  const lines = escapeHtml(markdown)
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const blocks = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];
  let quoteLines = [];
  const divAlignments = [];
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeLines = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
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

    const alignment = extractDivAlignment(line);
    if (alignment !== null) {
      flushAll();
      blocks.push(
        `<div class="markdown-aligned" style="text-align:${alignment}">`
      );
      divAlignments.push(alignment);
      continue;
    }

    if (isDivClosingTag(line)) {
      flushAll();
      if (divAlignments.length) {
        blocks.push("</div>");
        divAlignments.pop();
      }
      continue;
    }

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

    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      blocks.push(
        `<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`
      );
      continue;
    }

    if (/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushAll();
      blocks.push("<hr>");
      continue;
    }

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

    const quoteMatch = line.match(/^\s{0,3}&gt;\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines.push(quoteMatch[1]);
      continue;
    }

    flushQuote();

    // Support both top-level and indented (4+ space) nested list items
    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);

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

  if (inCodeBlock) {
    const languageClass = codeLanguage
      ? ` class="language-${escapeHtml(codeLanguage)}"`
      : "";
    blocks.push(
      `<pre><code${languageClass}>${codeLines.join("\n")}</code></pre>`
    );
  }

  flushAll();

  while (divAlignments.length) {
    blocks.push("</div>");
    divAlignments.pop();
  }

  return blocks.join("\n");
}

export function createGeminiSummaryController() {
  const summaryLoading = document.getElementById("summary-loading");
  const summaryText = document.getElementById("summary-text");
  const summaryError = document.getElementById("summary-error");
  const summaryErrorMessage = document.getElementById("summary-error-message");
  const retryButton = document.getElementById("retry-button");
  const repromptButton = document.getElementById("reprompt-button");
  const copyButton = document.getElementById("copy-button");
  const copyLabel = document.getElementById("copy-label");

  let summaryInputs = null;
  let summaryPhoto = null;
  let summaryMarkdown = "";
  let copyTimer = null;
  let isGenerating = false;

  function setSummaryState(state, text = "") {
    if (summaryLoading) summaryLoading.hidden = state !== "loading";
    if (summaryText) summaryText.hidden = state !== "ready";
    if (summaryError) summaryError.hidden = state !== "error";
    if (copyButton) copyButton.disabled = state !== "ready";
    if (repromptButton) {
      repromptButton.disabled = state === "loading" || !summaryInputs;
    }

    if (state === "ready" && summaryText) {
      summaryMarkdown = text;
      summaryText.innerHTML = renderMarkdown(text);
    }

    if (state === "error" && summaryErrorMessage) {
      summaryErrorMessage.textContent = text;
    }
  }

  async function buildRequestOptions() {
    if (summaryPhoto && (summaryPhoto.blob || summaryPhoto.dataUrl)) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(summaryInputs)) {
        formData.append(key, String(value));
      }
      const blob =
        summaryPhoto.blob || (await dataUrlToBlob(summaryPhoto.dataUrl));
      formData.append("photo", blob, summaryPhoto.name || "plant-photo.jpg");

      return {
        method: "POST",
        body: formData
      };
    }

    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(summaryInputs)
    };
  }

  async function loadSummary() {
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
    const timer = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

    try {
      const reqOptions = await buildRequestOptions();
      reqOptions.signal = controller.signal;

      const response = await fetch(API_ENDPOINTS.SUMMARIZE, reqOptions);
      let payload = {};

      try {
        payload = await response.json();
      } catch (error) {
        // Non-JSON response
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
        if (!copied) throw new Error("Copy failed");
      }
    } catch (error) {
      label = "Copy failed";
    }

    if (copyLabel) {
      copyLabel.textContent = label;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyLabel.textContent = "Copy";
      }, 1800);
    }
  }

  if (copyButton && !copyButton.dataset.bound) {
    copyButton.dataset.bound = "true";
    copyButton.addEventListener("click", copySummary);
  }
  if (retryButton && !retryButton.dataset.bound) {
    retryButton.dataset.bound = "true";
    retryButton.addEventListener("click", loadSummary);
  }
  if (repromptButton && !repromptButton.dataset.bound) {
    repromptButton.dataset.bound = "true";
    repromptButton.addEventListener("click", loadSummary);
  }

  return {
    requestSummary(inputs, photo = null) {
      summaryInputs = inputs;
      summaryPhoto = photo;
      return loadSummary();
    },
    loadSummary
  };
}
