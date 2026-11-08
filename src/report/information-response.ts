// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Renders the Article 7 answer for one worker as Markdown or HTML.
 *
 * @packageDocumentation
 */

import { groupDecimalString } from '../core/decimal.js';
import { hasUnsafeText } from '../core/dataset.js';
import type { InformationResponse } from '../core/information-request.js';
import { NOT_LEGAL_ADVICE, articleUrl } from '../core/legal.js';
import { VERSION } from '../version.js';
import { attributionFooter, data, type Block } from './document.js';
import { htmlDocument, renderBlocksHtml } from './html.js';
import { amountText, basisLabel } from './labels.js';
import { renderBlocksMarkdown } from './markdown.js';

/** Options for the rendered answer. */
export interface InformationResponseTextOptions {
  readonly employer?: string;
  readonly currency?: string;
}

/** Document blocks of the Article 7 answer (shared by Markdown, HTML and the app). */
export function informationResponseBlocks(response: InformationResponse, options: InformationResponseTextOptions = {}): Block[] {
  if (options.employer !== undefined && (options.employer.length > 200 || hasUnsafeText(options.employer))) {
    throw new RangeError('employer must be at most 200 characters without control or invisible formatting characters');
  }
  if (options.currency !== undefined && !/^[A-Z]{3}$/.test(options.currency)) throw new RangeError('currency must be a three-letter ISO 4217 code');
  const unit = options.currency === undefined ? '' : ` (${options.currency})`;
  const out: Block[] = [
    { kind: 'heading', level: 1, text: ['Answer to your request for pay information'] },
    {
      kind: 'paragraph',
      content: [
        options.employer === undefined ? 'Your employer' : data(options.employer.trim()),
        ' gives you this information under ',
        { text: 'Article 7 of Directive (EU) 2023/970', url: articleUrl(7) },
        '. It shows your individual pay level and the average pay levels, broken down by sex, for your category of workers.',
      ],
    },
    { kind: 'paragraph', content: ['Category of workers: ', data(response.category), '.'] },
    {
      kind: 'table',
      head: ['Basis', `Your pay level${unit}`, `Average, female workers${unit}`, `Average, male workers${unit}`],
      rows: response.byBasis.map((b) => [
        basisLabel(b.basis),
        groupDecimalString(b.individualPayLevel, '.', ','),
        amountText(b.femaleAverage),
        amountText(b.maleAverage),
      ]),
    },
  ];
  if (response.byBasis.some((b) => b.femaleAverage.status === 'suppressed' || b.maleAverage.status === 'suppressed')) {
    out.push({
      kind: 'note',
      content: [
        'Some averages are withheld because the group is small and the figure could disclose the pay of an identifiable colleague. Depending on national law (',
        { text: 'Article 12(3)', url: articleUrl(12) },
        '), this information may be available through your workers’ representatives, the labour inspectorate or the equality body.',
      ],
    });
  }
  if (response.requestDate !== null) {
    out.push({
      kind: 'paragraph',
      content: [`Request received: ${response.requestDate}. Latest answer date under Article 7(4): ${response.answerDueBy ?? ''} (two months; indicative).`],
    });
  }
  out.push(
    {
      kind: 'paragraph',
      content: [
        'If this information is inaccurate or incomplete, you can ask, personally or through your workers’ representatives, for additional and reasonable clarifications and details and receive a substantiated reply (Article 7(2)). You may be asked not to use information other than about your own pay for any purpose other than exercising your right to equal pay (Article 7(6)).',
      ],
    },
    { kind: 'paragraph', content: [NOT_LEGAL_ADVICE] },
    attributionFooter(VERSION),
  );
  return out;
}

/** Renders the Article 7 answer as Markdown. */
export function renderInformationResponseMarkdown(response: InformationResponse, options: InformationResponseTextOptions = {}): string {
  return renderBlocksMarkdown(informationResponseBlocks(response, options));
}

/** Renders the Article 7 answer as a self-contained HTML page. */
export function renderInformationResponseHtml(response: InformationResponse, options: InformationResponseTextOptions = {}): string {
  return htmlDocument('Answer to your request for pay information', renderBlocksHtml(informationResponseBlocks(response, options)));
}
