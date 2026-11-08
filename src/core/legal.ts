// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * References to the official text of Directive (EU) 2023/970.
 * Source: EUR-Lex, OJ L 132, 17.5.2023, p. 21.
 *
 * @packageDocumentation
 */

/** The directive this toolkit implements. */
export const DIRECTIVE = {
  title:
    'Directive (EU) 2023/970 of the European Parliament and of the Council of 10 May 2023 to strengthen the application of the principle of equal pay for equal work or work of equal value between men and women through pay transparency and enforcement mechanisms',
  shortTitle: 'Directive (EU) 2023/970',
  celex: '32023L0970',
  officialJournal: 'OJ L 132, 17.5.2023, p. 21',
  url: 'https://eur-lex.europa.eu/eli/dir/2023/970/oj',
  /** Article 34(1): Member States bring national measures into force by this date. */
  transpositionDeadline: '2026-06-07',
} as const;

const HTML_URL = 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970';

/** Link to an article of the official English text on EUR-Lex. */
export function articleUrl(article: number): string {
  if (!Number.isInteger(article) || article < 1 || article > 37) throw new RangeError('article must be 1 to 37');
  return `${HTML_URL}#art_${article}`;
}

/** Link to a recital of the official English text on EUR-Lex. */
export function recitalUrl(recital: number): string {
  if (!Number.isInteger(recital) || recital < 1 || recital > 66) throw new RangeError('recital must be 1 to 66');
  return `${HTML_URL}#rct_${recital}`;
}

/** Product attribution required by LICENSE-ADDITIONAL-TERMS.md (AGPL-3.0 section 7(b)). */
export const ATTRIBUTION = {
  text: 'Evenkeel by AFKzona Group',
  url: 'https://afkzonagroup.lt',
} as const;

/** Source code and documentation of this project. */
export const PROJECT_URL = 'https://github.com/afkzonagroup/evenkeel';

/** Statement included in every generated document. */
export const NOT_LEGAL_ADVICE =
  'This document was produced with software. It is not legal advice and does not by itself show compliance with Directive (EU) 2023/970 or national law. National law transposing the directive may set further or different rules.';
