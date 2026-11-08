// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Human-readable labels shared by the Markdown, HTML and app views.
 *
 * @packageDocumentation
 */

import { groupDecimalString } from '../core/decimal.js';
import type { Figure, NotApplicableReason, SuppressionReason, ThresholdResult } from '../core/indicators.js';
import type { PayBasis } from '../core/config.js';

const SUPPRESSION: Readonly<Record<SuppressionReason, string>> = {
  'below-minimum-group-size': 'withheld: small group',
  'few-recipients': 'withheld: few recipients',
  'secondary-suppression': 'withheld: protects a small group',
};

const NOT_APPLICABLE: Readonly<Record<NotApplicableReason, string>> = {
  'no-female-workers': 'no female workers',
  'no-male-workers': 'no male workers',
  'no-female-recipients': 'no female recipients',
  'no-male-recipients': 'no male recipients',
  'no-workers': 'no workers',
  'male-average-is-zero': 'male average is 0',
  'male-median-is-zero': 'male median is 0',
};

/** Label for a withheld or not computable figure. */
export function statusLabel(figure: Exclude<Figure, { status: 'ok' }>): string {
  return figure.status === 'suppressed' ? SUPPRESSION[figure.reason] : NOT_APPLICABLE[figure.reason];
}

/** Formats an amount figure with thousands separators. */
export function amountText(figure: Figure): string {
  return figure.status === 'ok' ? groupDecimalString(figure.value, '.', ',') : statusLabel(figure);
}

/** Formats a percentage figure. */
export function percentText(figure: Figure): string {
  return figure.status === 'ok' ? `${figure.value} %` : statusLabel(figure);
}

/** Basis heading. */
export function basisLabel(basis: PayBasis): string {
  return basis === 'annual' ? 'Annual pay' : 'Hourly pay';
}

/** Article 10(1)(a) result label. */
export function thresholdLabel(result: ThresholdResult): string {
  switch (result) {
    case 'met':
      return '5 % or more';
    case 'not-met':
      return 'below 5 %';
    case 'withheld':
      return 'withheld';
    case 'not-determinable':
      return 'cannot be determined';
  }
}

/** Explanation of the withheld labels, for report legends. */
export function legend(minimumGroupSize: number): readonly string[] {
  return [
    `withheld: small group – the group has fewer than ${minimumGroupSize} workers.`,
    `withheld: few recipients – fewer than ${minimumGroupSize} workers in the group received complementary or variable components, so their amounts could be derived.`,
    'withheld: protects a small group – shown figures would otherwise let a withheld figure be worked out by subtraction.',
    'A positive gap means female workers are paid less on average than male workers; a negative gap means they are paid more.',
  ];
}
