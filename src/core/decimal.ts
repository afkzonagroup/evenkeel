// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Exact decimal arithmetic for pay data.
 *
 * Why not JavaScript numbers: binary floating point cannot represent most
 * decimal amounts (0.1 + 0.2 !== 0.3) and sums of many amounts drift. A
 * pay gap of 4.9999999 % versus 5 % decides whether the Article 10(1)(a)
 * threshold is met, so drift is not acceptable.
 *
 * Why not exact fractions everywhere: hourly pay is annual pay divided by
 * hours. Every worker has different hours, so exact fractions would carry
 * denominators that grow with every addition (the least common multiple of
 * thousands of different hour counts) and become very slow.
 *
 * The approach:
 * - Every per-worker amount is a `Fixed`: a bigint counting units of
 *   10^-12. Input amounts (at most {@link MAX_FRACTION_DIGITS} decimals) are
 *   parsed into it exactly, with no rounding.
 * - A division that creates a per-worker value (hourly pay, pay per full-time
 *   equivalent) is rounded once, to the nearest 10^-12, half away from zero.
 *   The error is at most 0.0000000000005 per worker.
 * - Sums, counts and comparisons of `Fixed` values are exact integer
 *   operations.
 * - Results (averages, medians, gaps, proportions) are exact `Ratio`s of two
 *   bigints. They are rounded only when formatted for display, half away
 *   from zero, to a configured number of decimals.
 *
 * @packageDocumentation
 */

/** Number of decimal digits held by a {@link Fixed} value. */
export const SCALE_DIGITS = 12;

/** 10^12: one unit of currency (or one hour) as a {@link Fixed} value. */
export const SCALE = 10n ** BigInt(SCALE_DIGITS);

/** Maximum number of integer digits accepted when parsing a decimal. */
export const MAX_INTEGER_DIGITS = 15;

/** Maximum number of fraction digits accepted when parsing a decimal. */
export const MAX_FRACTION_DIGITS = 6;

/** A decimal value held as an integer number of 10^-12 units. */
export type Fixed = bigint;

/** An exact fraction `num / den`. `den` is always positive. */
export interface Ratio {
  readonly num: bigint;
  readonly den: bigint;
}

/** Characters accepted as a decimal separator. */
export type DecimalSeparator = '.' | ',';

/** Thousands separator handling. `none` rejects any grouping character. */
export type ThousandsSeparator = 'none' | ' ' | '.' | ',' | "'";

/** Options for {@link parseDecimal}. */
export interface DecimalFormat {
  readonly decimalSeparator: DecimalSeparator;
  readonly thousandsSeparator: ThousandsSeparator;
}

/** Result of {@link parseDecimal}. */
export type ParseDecimalResult =
  | { readonly ok: true; readonly value: Fixed }
  | { readonly ok: false; readonly reason: string };

const DIGITS = /^[0-9]+$/;
const GROUPED = /^[0-9]{1,3}(?:G[0-9]{3})+$/;

/**
 * Parses a decimal string exactly into a {@link Fixed} value.
 *
 * Accepted: optional leading minus sign, digits, an optional thousands
 * separator in groups of three (only when configured), and an optional
 * decimal separator followed by 1 to {@link MAX_FRACTION_DIGITS} digits.
 * Rejected: exponents, currency symbols, plus signs, leading or trailing
 * separators, empty strings. Surrounding ASCII spaces are ignored.
 *
 * @example
 * parseDecimal('1 234,56', { decimalSeparator: ',', thousandsSeparator: ' ' })
 * // { ok: true, value: 1234560000000000n }
 */
export function parseDecimal(text: string, format: DecimalFormat): ParseDecimalResult {
  if (format.thousandsSeparator !== 'none' && format.thousandsSeparator === format.decimalSeparator) {
    return { ok: false, reason: 'decimal and thousands separators must differ' };
  }
  let s = trimAsciiSpaces(text);
  if (s.length === 0) return { ok: false, reason: 'empty value' };
  if (s.length > 64) return { ok: false, reason: 'value is too long' };
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const decimalIndex = s.indexOf(format.decimalSeparator);
  if (decimalIndex !== s.lastIndexOf(format.decimalSeparator)) {
    return { ok: false, reason: `more than one decimal separator "${format.decimalSeparator}"` };
  }
  let intPart = decimalIndex === -1 ? s : s.slice(0, decimalIndex);
  const fracPart = decimalIndex === -1 ? '' : s.slice(decimalIndex + 1);
  if (decimalIndex !== -1 && !DIGITS.test(fracPart)) {
    return { ok: false, reason: 'expected digits after the decimal separator' };
  }
  if (fracPart.length > MAX_FRACTION_DIGITS) {
    return { ok: false, reason: `more than ${MAX_FRACTION_DIGITS} decimal places` };
  }
  if (format.thousandsSeparator !== 'none') {
    const sep = format.thousandsSeparator;
    // A configured space also accepts the no-break spaces that spreadsheet
    // programs insert as thousands separators.
    const normalised = sep === ' ' ? intPart.replace(/[ \u00a0\u202f]/g, 'G') : intPart.split(sep).join('G');
    if (normalised.includes('G')) {
      if (!GROUPED.test(normalised)) {
        return { ok: false, reason: 'thousands separators must separate groups of three digits' };
      }
      intPart = normalised.split('G').join('');
    }
  }
  if (!DIGITS.test(intPart)) {
    return {
      ok: false,
      reason: `expected a number like 1234${format.decimalSeparator}56 (digits, optional "${format.decimalSeparator}" decimal separator)`,
    };
  }
  const significant = intPart.replace(/^0+(?=[0-9])/, '');
  if (significant.length > MAX_INTEGER_DIGITS) {
    return { ok: false, reason: `more than ${MAX_INTEGER_DIGITS} digits before the decimal separator` };
  }
  const magnitude = BigInt(intPart) * SCALE + BigInt(fracPart.padEnd(SCALE_DIGITS, '0'));
  return { ok: true, value: negative ? -magnitude : magnitude };
}

/** Converts a non-negative safe integer to {@link Fixed}. */
export function fixedFromInteger(value: number): Fixed {
  if (!Number.isSafeInteger(value)) throw new RangeError('expected a safe integer');
  return BigInt(value) * SCALE;
}

/**
 * Integer division rounded to the nearest integer, halves away from zero.
 *
 * @throws RangeError when `den` is zero.
 */
export function roundDiv(num: bigint, den: bigint): bigint {
  if (den === 0n) throw new RangeError('division by zero');
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const negative = num < 0n;
  const abs = negative ? -num : num;
  const q = abs / den;
  const r = abs % den;
  const rounded = r * 2n >= den ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/**
 * Divides two fixed values and rounds once to 10^-12, half away from zero.
 * Used for hourly pay (pay / hours) and pay per full-time equivalent.
 */
export function divideFixed(a: Fixed, b: Fixed): Fixed {
  return roundDiv(a * SCALE, b);
}

/** Sums fixed values exactly. */
export function sumFixed(values: Iterable<Fixed>): Fixed {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/** Compares two fixed values for sorting. */
export function compareFixed(a: Fixed, b: Fixed): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/**
 * Creates a reduced ratio.
 *
 * @throws RangeError when `den` is zero.
 */
export function ratio(num: bigint, den: bigint): Ratio {
  if (den === 0n) throw new RangeError('ratio with zero denominator');
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return g > 1n ? { num: num / g, den: den / g } : { num, den };
}

/** A fixed value as an exact ratio in currency units (or hours). */
export function fixedToRatio(value: Fixed): Ratio {
  return ratio(value, SCALE);
}

/** a + b */
export function addRatio(a: Ratio, b: Ratio): Ratio {
  return ratio(a.num * b.den + b.num * a.den, a.den * b.den);
}

/** a - b */
export function subtractRatio(a: Ratio, b: Ratio): Ratio {
  return ratio(a.num * b.den - b.num * a.den, a.den * b.den);
}

/** a * b */
export function multiplyRatio(a: Ratio, b: Ratio): Ratio {
  return ratio(a.num * b.num, a.den * b.den);
}

/**
 * a / b
 *
 * @throws RangeError when `b` is zero.
 */
export function divideRatio(a: Ratio, b: Ratio): Ratio {
  if (b.num === 0n) throw new RangeError('division by zero');
  return ratio(a.num * b.den, a.den * b.num);
}

/** Absolute value. */
export function absRatio(a: Ratio): Ratio {
  return a.num < 0n ? { num: -a.num, den: a.den } : a;
}

/** Compares two ratios exactly: -1, 0 or 1. */
export function compareRatio(a: Ratio, b: Ratio): number {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Formats a ratio as a decimal string with exactly `decimals` digits after
 * the point, rounding half away from zero. Never returns "-0.00".
 *
 * @example
 * formatRatio(ratio(1n, 8n), 2) // "0.13"
 * formatRatio(ratio(-1n, 8n), 2) // "-0.13"
 */
export function formatRatio(value: Ratio, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
    throw new RangeError('decimals must be an integer from 0 to 12');
  }
  const scaled = roundDiv(value.num * 10n ** BigInt(decimals), value.den);
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(decimals + 1, '0');
  const intPart = digits.slice(0, digits.length - decimals);
  const fracPart = digits.slice(digits.length - decimals);
  const body = decimals === 0 ? intPart : `${intPart}.${fracPart}`;
  return negative ? `-${body}` : body;
}

/** Formats a fixed value with `decimals` digits (see {@link formatRatio}). */
export function formatFixed(value: Fixed, decimals: number): string {
  return formatRatio(fixedToRatio(value), decimals);
}

/**
 * Inserts a thousands separator into a plain decimal string produced by
 * {@link formatRatio} and swaps the decimal point if required.
 */
export function groupDecimalString(plain: string, decimalSeparator: string, thousandsSeparator: string): string {
  const negative = plain.startsWith('-');
  const body = negative ? plain.slice(1) : plain;
  const [intPart = '0', fracPart] = body.split('.');
  let grouped = '';
  for (let i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 === 0) grouped += thousandsSeparator;
    grouped += intPart.charAt(i);
  }
  const out = fracPart === undefined ? grouped : `${grouped}${decimalSeparator}${fracPart}`;
  return negative ? `-${out}` : out;
}

/**
 * Removes leading and trailing ASCII spaces in one linear pass. A `/ +$/` expression backtracks
 * quadratically on long runs of spaces that are not at the end of the value.
 */
function trimAsciiSpaces(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) === 0x20) start++;
  while (end > start && text.charCodeAt(end - 1) === 0x20) end--;
  return text.slice(start, end);
}
