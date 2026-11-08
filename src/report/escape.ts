// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Output encoding for every report format. All text that comes from input
 * data (category names, employer names) passes through one of these.
 *
 * @packageDocumentation
 */

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

// A plain number such as "41,000.00", "-5.25" or "12.5 %" cannot form
// Markdown syntax inside a table cell or sentence, so it is left readable.
const PLAIN_NUMBER = /^-?[0-9][0-9,]*(?:\.[0-9]+)?(?: %)?$/;

/**
 * Escapes text for Markdown: every ASCII punctuation character gets a
 * backslash (CommonMark allows this for all of them), so input can never
 * create links, autolinks, images, HTML, emphasis or table cells. Line
 * breaks become spaces. Plain numbers are returned unchanged.
 */
export function escapeMarkdown(text: string): string {
  if (PLAIN_NUMBER.test(text)) return text;
  return text.replace(/[\r\n]+/g, ' ').replace(/[!-/:-@[-`{-~]/g, (c) => `\\${c}`);
}

/**
 * Light Markdown escaping for fixed text written by this program: escapes
 * the characters that start inline markup (backslash, backtick, emphasis,
 * brackets, angle brackets, pipes, tildes, ampersands, exclamation marks).
 * Never use it for input data; use {@link escapeMarkdown}.
 */
export function escapeMarkdownLight(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/[\\`*_[\]<>|~&!]/g, (c) => `\\${c}`);
}

const STRICT_NUMBER = /^-?[0-9]+(?:\.[0-9]+)?$/;
// Characters that make spreadsheet programs treat a cell as a formula,
// including full-width forms, after optional leading whitespace.
const FORMULA_START = /^[\s\u3000]*[=+\-@\uff1d\uff0b\uff0d\uff20]|^[\t\r]/;

/**
 * Encodes one CSV cell. Protects against formula (CSV) injection: a cell
 * that starts with =, +, -, @, a tab or a carriage return (after optional
 * whitespace) is prefixed with a single quote so spreadsheet programs show
 * it as text. Plain numbers such as "-5.25" are left unchanged. Cells with
 * the delimiter, quotes or line breaks are quoted.
 */
export function csvCell(value: string, delimiter = ','): string {
  let v = value;
  if (!STRICT_NUMBER.test(v) && FORMULA_START.test(v)) v = `'${v}`;
  if (v.includes(delimiter) || /["\r\n]/.test(v) || v !== v.trim()) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Encodes a CSV row with CRLF line ending (RFC 4180). */
export function csvRow(cells: readonly string[], delimiter = ','): string {
  return `${cells.map((c) => csvCell(c, delimiter)).join(delimiter)}\r\n`;
}
