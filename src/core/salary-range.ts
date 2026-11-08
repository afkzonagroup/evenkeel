// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pay information for applicants: Article 5(1) of Directive (EU) 2023/970.
 *
 * Applicants have the right to receive "the initial pay or its range, based
 * on objective, gender-neutral criteria, to be attributed for the position
 * concerned" and, where applicable, the relevant provisions of the
 * collective agreement. The information may be given in the job vacancy
 * notice, before the interview or otherwise.
 *
 * This helper only formats the text. Deciding the range on objective,
 * gender-neutral criteria is the employer's task.
 *
 * @packageDocumentation
 */

import { hasUnsafeText } from './dataset.js';
import { formatFixed, groupDecimalString, parseDecimal, type Fixed } from './decimal.js';

/** Period the amounts relate to. */
export type PayPeriod = 'hour' | 'month' | 'year';

/** Input to {@link salaryRangeText}. */
export interface SalaryRangeInput {
  /** Lowest initial pay, a decimal string with "." as decimal separator, e.g. "3000" or "3000.50". */
  readonly minimum: string;
  /** Highest initial pay. Omit (or give the minimum) for a single amount. */
  readonly maximum?: string;
  /** ISO 4217 currency code, e.g. "EUR". */
  readonly currency: string;
  readonly period: PayPeriod;
  /** Optional reference to the collective agreement applied to the position (Article 5(1)(b)). */
  readonly collectiveAgreement?: string;
  /**
   * Optional custom wording with placeholders {minimum}, {maximum},
   * {currency} and {period}. Use it for other languages. Text is inserted
   * literally; no other syntax is interpreted.
   */
  readonly template?: string;
  /** Separators for the formatted amounts. Defaults: "." and ",". */
  readonly decimalSeparator?: string;
  readonly thousandsSeparator?: string;
}

const CURRENCY = /^[A-Z]{3}$/;
const PLACEHOLDER = /\{([a-z]+)\}/g;
const ALLOWED_PLACEHOLDERS = new Set(['minimum', 'maximum', 'currency', 'period']);
const PERIOD_WORDS: Readonly<Record<PayPeriod, string>> = { hour: 'per hour', month: 'per month', year: 'per year' };

function amount(value: string, name: string): Fixed {
  const parsed = parseDecimal(value, { decimalSeparator: '.', thousandsSeparator: 'none' });
  if (!parsed.ok) throw new RangeError(`${name}: ${parsed.reason}`);
  if (parsed.value <= 0n) throw new RangeError(`${name} must be greater than 0`);
  return parsed.value;
}

function checkText(value: string, name: string, max: number): void {
  if (value.length > max) throw new RangeError(`${name} must be at most ${max} characters`);
  if (hasUnsafeText(value)) throw new RangeError(`${name} must not contain control or invisible formatting characters`);
}

/**
 * Formats the initial pay or pay range for a job vacancy notice.
 *
 * @example
 * salaryRangeText({ minimum: '3000', maximum: '3600', currency: 'EUR', period: 'month' })
 * // "Pay range: EUR 3,000.00 – 3,600.00 gross per month."
 *
 * @throws RangeError on invalid amounts, currency, text or template.
 */
export function salaryRangeText(input: SalaryRangeInput): string {
  if (!CURRENCY.test(input.currency)) throw new RangeError('currency must be a three-letter ISO 4217 code such as EUR');
  if (!Object.hasOwn(PERIOD_WORDS, input.period)) throw new RangeError('period must be hour, month or year');
  const decimalSeparator = input.decimalSeparator ?? '.';
  const thousandsSeparator = input.thousandsSeparator ?? ',';
  checkText(decimalSeparator, 'decimalSeparator', 1);
  checkText(thousandsSeparator, 'thousandsSeparator', 1);
  if (decimalSeparator.length !== 1 || decimalSeparator === thousandsSeparator) {
    throw new RangeError('decimalSeparator must be one character, different from thousandsSeparator');
  }
  const min = amount(input.minimum, 'minimum');
  const max = input.maximum === undefined ? min : amount(input.maximum, 'maximum');
  if (max < min) throw new RangeError('maximum must not be lower than minimum');
  const fmt = (v: Fixed): string => groupDecimalString(formatFixed(v, 2), decimalSeparator, thousandsSeparator);
  const values: ReadonlyMap<string, string> = new Map([
    ['minimum', fmt(min)],
    ['maximum', fmt(max)],
    ['currency', input.currency],
    ['period', PERIOD_WORDS[input.period]],
  ]);

  let text: string;
  if (input.template !== undefined) {
    checkText(input.template, 'template', 500);
    for (const match of input.template.matchAll(PLACEHOLDER)) {
      if (!ALLOWED_PLACEHOLDERS.has(match[1] ?? '')) throw new RangeError(`template has an unknown placeholder {${match[1] ?? ''}}`);
    }
    text = input.template.replace(PLACEHOLDER, (_whole, key: string) => values.get(key) ?? '');
  } else if (min === max) {
    text = `Initial pay: ${input.currency} ${values.get('minimum') ?? ''} gross ${values.get('period') ?? ''}.`;
  } else {
    text = `Pay range: ${input.currency} ${values.get('minimum') ?? ''} – ${values.get('maximum') ?? ''} gross ${values.get('period') ?? ''}.`;
  }
  if (input.collectiveAgreement !== undefined && input.collectiveAgreement.trim().length > 0) {
    checkText(input.collectiveAgreement, 'collectiveAgreement', 300);
    text += ` Collective agreement: ${input.collectiveAgreement.trim()}.`;
  }
  return text;
}
