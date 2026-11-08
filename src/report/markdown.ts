// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Markdown renderer. Input data is escaped with {@link escapeMarkdown}, so it
 * cannot add links, images, HTML or table cells. Fixed text written by this
 * program is escaped with {@link escapeMarkdownLight}.
 *
 * @packageDocumentation
 */

import { reportBlocks, type Block, type Cell, type Inline } from './document.js';
import { escapeMarkdown, escapeMarkdownLight } from './escape.js';
import type { ReportV1 } from './model.js';

function cell(c: Cell): string {
  return typeof c === 'string' ? escapeMarkdownLight(c) : escapeMarkdown(c.data);
}

function inline(content: readonly Inline[]): string {
  return content.map((c) => (typeof c === 'string' || 'data' in c ? cell(c) : `[${escapeMarkdownLight(c.text)}](<${c.url}>)`)).join('');
}

/** Renders document blocks as Markdown. */
export function renderBlocksMarkdown(blocks: readonly Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case 'heading':
        out.push(`${'#'.repeat(b.level)} ${inline(b.text)}`, '');
        break;
      case 'paragraph':
        out.push(inline(b.content), '');
        break;
      case 'note':
        out.push(`> ${inline(b.content)}`, '');
        break;
      case 'footer':
        out.push('---', '', inline(b.content), '');
        break;
      case 'list':
        for (const item of b.items) out.push(`- ${escapeMarkdownLight(item)}`);
        out.push('');
        break;
      case 'table':
        out.push(`| ${b.head.map(escapeMarkdownLight).join(' | ')} |`);
        out.push(`|${b.head.map(() => ' --- ').join('|')}|`);
        for (const row of b.rows) out.push(`| ${row.map(cell).join(' | ')} |`);
        out.push('');
        break;
    }
  }
  return out.join('\n');
}

/** Renders a report as Markdown. */
export function renderMarkdown(report: ReportV1): string {
  return renderBlocksMarkdown(reportBlocks(report));
}
