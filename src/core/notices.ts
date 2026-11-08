// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Text helpers for Article 6 (transparency of pay setting and pay
 * progression) and Article 7(3) (annual notice of the right to information)
 * of Directive (EU) 2023/970. The output is Markdown with every input value
 * escaped.
 *
 * @packageDocumentation
 */

import { escapeMarkdown } from '../report/escape.js';
import { hasUnsafeText } from './dataset.js';
import { NOT_LEGAL_ADVICE, articleUrl } from './legal.js';

/** The four factors Article 4(4) names for gender-neutral criteria, plus other relevant factors. */
export type CriterionFactor = 'skills' | 'effort' | 'responsibility' | 'working-conditions' | 'other';

/** One criterion used to set pay, pay levels or pay progression. */
export interface PayCriterion {
  readonly name: string;
  readonly description: string;
  readonly factor: CriterionFactor;
  readonly appliesTo: readonly ('pay' | 'pay-levels' | 'pay-progression')[];
}

const FACTOR_LABEL: Readonly<Record<CriterionFactor, string>> = {
  skills: 'Skills',
  effort: 'Effort',
  responsibility: 'Responsibility',
  'working-conditions': 'Working conditions',
  other: 'Other relevant factor',
};

function text(value: string, name: string, max: number): string {
  const v = value.trim();
  if (v.length === 0 || v.length > max) throw new RangeError(`${name} must be 1 to ${max} characters`);
  if (hasUnsafeText(v)) throw new RangeError(`${name} must not contain control or invisible formatting characters`);
  return escapeMarkdown(v);
}

/**
 * Article 6(1): a statement of the criteria used to determine pay, pay
 * levels and pay progression, for making it easily accessible to workers.
 * Whether the criteria are objective and gender neutral is for the employer
 * to ensure; this function only lays them out.
 */
export function payCriteriaStatement(employerName: string, criteria: readonly PayCriterion[]): string {
  const employer = text(employerName, 'employerName', 200);
  if (criteria.length === 0 || criteria.length > 100) throw new RangeError('give 1 to 100 criteria');
  const lines = [
    `# Pay setting and pay progression criteria – ${employer}`,
    '',
    `This statement makes the criteria used to determine pay, pay levels and pay progression accessible to workers, as required by [Article 6(1) of Directive (EU) 2023/970](${articleUrl(6)}).`,
    '',
  ];
  for (const scope of ['pay', 'pay-levels', 'pay-progression'] as const) {
    const items = criteria.filter((c) => c.appliesTo.includes(scope));
    if (items.length === 0) continue;
    lines.push(`## ${scope === 'pay' ? 'Pay' : scope === 'pay-levels' ? 'Pay levels' : 'Pay progression'}`, '');
    for (const c of items) {
      if (!Object.hasOwn(FACTOR_LABEL, c.factor)) throw new RangeError('unknown factor');
      lines.push(`- **${text(c.name, 'criterion name', 200)}** (${FACTOR_LABEL[c.factor]}): ${text(c.description, 'criterion description', 2000)}`);
    }
    lines.push('');
  }
  lines.push(`_${NOT_LEGAL_ADVICE}_`, '');
  return lines.join('\n');
}

/** Input to {@link annualInformationNotice}. */
export interface AnnualNoticeInput {
  readonly employerName: string;
  /** How to make a request, e.g. "Write to hr@example.com" or the name of an internal form. */
  readonly howToRequest: string;
}

/**
 * Article 7(3): the yearly notice informing all workers of their right to
 * information under Article 7(1) and the steps to exercise it.
 */
export function annualInformationNotice(input: AnnualNoticeInput): string {
  const employer = text(input.employerName, 'employerName', 200);
  const how = text(input.howToRequest, 'howToRequest', 1000);
  return [
    `# Your right to pay information – ${employer}`,
    '',
    `Under [Article 7 of Directive (EU) 2023/970](${articleUrl(7)}) you can ask for, and receive in writing:`,
    '',
    '- your individual pay level, and',
    '- the average pay levels, broken down by sex, for the category of workers doing the same work as you or work of equal value.',
    '',
    `**How to ask:** ${how}`,
    '',
    'You can also ask through your workers’ representatives or through the equality body. We will answer within a reasonable time and at the latest within two months of your request. If the answer is inaccurate or incomplete, you can ask for clarifications and receive a substantiated reply.',
    '',
    'You are free to disclose your own pay to enforce the principle of equal pay.',
    '',
    `_${NOT_LEGAL_ADVICE}_`,
    '',
  ].join('\n');
}
