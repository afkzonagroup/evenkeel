// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Self-contained HTML renderer. The page has no scripts and loads nothing:
 * its Content Security Policy is `default-src 'none'` with only the inline
 * stylesheet allowed by hash. All text is escaped with {@link escapeHtml}.
 *
 * @packageDocumentation
 */

import { reportBlocks, type Block, type Cell, type Inline } from './document.js';
import { escapeHtml } from './escape.js';
import type { ReportV1 } from './model.js';

/** The report stylesheet. Its SHA-256 is {@link REPORT_CSS_SHA256}; a test keeps them in step. */
export const REPORT_CSS = `:root{color-scheme:light;--ink:#1d2329;--muted:#5b6670;--line:#d9dee3;--soft:#f4f6f8;--accent:#1f5f8b}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px 48px}
h1{font-size:26px;line-height:1.25;margin:0 0 8px}
h2{font-size:19px;margin:36px 0 10px;padding-top:12px;border-top:1px solid var(--line)}
h3{font-size:16px;margin:22px 0 8px}
p{margin:0 0 12px;max-width:72ch}
a{color:var(--accent)}
.note{border-left:3px solid #b5651d;background:#fdf6ee;padding:10px 14px;margin:0 0 12px}
.scroll{overflow-x:auto;margin:0 0 14px}
table{border-collapse:collapse;min-width:100%;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--soft);font-weight:600;font-size:13px}
td+td,th+th{text-align:right}
ul{margin:0 0 12px;padding-left:20px}
footer{margin-top:36px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media print{main{padding:0}h2{break-after:avoid}}`;

/** Base64 SHA-256 of {@link REPORT_CSS}, used in the page's Content Security Policy. */
export const REPORT_CSS_SHA256 = 'wZRTkgoqOEf6clT2CM8TJn2IIgRxzC/m4dLQppQe9fw=';

/** The Content Security Policy of generated HTML reports. */
export const REPORT_CSP = `default-src 'none'; style-src 'sha256-${REPORT_CSS_SHA256}'; base-uri 'none'; form-action 'none'`;

function cell(c: Cell): string {
  return escapeHtml(typeof c === 'string' ? c : c.data);
}

function inline(content: readonly Inline[]): string {
  return content
    .map((c) => (typeof c === 'string' || 'data' in c ? cell(c) : `<a href="${escapeHtml(c.url)}" rel="noopener noreferrer">${escapeHtml(c.text)}</a>`))
    .join('');
}

/** Renders document blocks as HTML body content. */
export function renderBlocksHtml(blocks: readonly Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case 'heading':
        out.push(`<h${b.level}>${inline(b.text)}</h${b.level}>`);
        break;
      case 'paragraph':
        out.push(`<p>${inline(b.content)}</p>`);
        break;
      case 'note':
        out.push(`<p class="note">${inline(b.content)}</p>`);
        break;
      case 'footer':
        out.push(`<footer>${inline(b.content)}</footer>`);
        break;
      case 'list':
        out.push(`<ul>${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`);
        break;
      case 'table':
        out.push(
          `<div class="scroll"><table><thead><tr>${b.head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${b.rows
            .map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table></div>`,
        );
        break;
    }
  }
  return out.join('\n');
}

/** Wraps body content in a complete, self-contained HTML document. */
export function htmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">
<meta name="referrer" content="no-referrer">
<meta http-equiv="x-dns-prefetch-control" content="off">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

/** Renders a report as a self-contained HTML page. */
export function renderHtml(report: ReportV1): string {
  const title = report.employer === null ? 'Pay transparency report' : `Pay transparency report – ${report.employer}`;
  return htmlDocument(title, renderBlocksHtml(reportBlocks(report)));
}
