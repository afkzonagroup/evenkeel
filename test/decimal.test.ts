// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  SCALE,
  absRatio,
  addRatio,
  compareFixed,
  compareRatio,
  divideFixed,
  divideRatio,
  fixedFromInteger,
  formatFixed,
  formatRatio,
  groupDecimalString,
  multiplyRatio,
  parseDecimal,
  ratio,
  roundDiv,
  subtractRatio,
  sumFixed,
} from '../src/core/decimal.js';

const DOT = { decimalSeparator: '.', thousandsSeparator: 'none' } as const;
const COMMA = { decimalSeparator: ',', thousandsSeparator: 'none' } as const;

function parsed(text: string, format: Parameters<typeof parseDecimal>[1] = DOT): bigint {
  const r = parseDecimal(text, format);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

describe('parseDecimal', () => {
  it('parses integers and decimals exactly', () => {
    expect(parsed('0')).toBe(0n);
    expect(parsed('12')).toBe(12n * SCALE);
    expect(parsed('1234.56')).toBe(1234_560000000000n);
    expect(parsed('0.000001')).toBe(1_000000n);
    expect(parsed('  42.5 ')).toBe(42_500000000000n);
    // Only ASCII spaces are ignored (the same rule as the Python implementation).
    expect(parseDecimal('\t42.5', DOT).ok).toBe(false);
    expect(parseDecimal('42.5\u00a0', DOT).ok).toBe(false);
    expect(parsed('-3.25')).toBe(-3_250000000000n);
    expect(parsed('007.10')).toBe(7_100000000000n);
  });

  it('handles locale decimal commas', () => {
    expect(parsed('1234,56', COMMA)).toBe(1234_560000000000n);
    expect(parseDecimal('1234.56', COMMA).ok).toBe(false);
    expect(parseDecimal('1234,56', DOT).ok).toBe(false);
  });

  it('handles configured thousands separators in groups of three', () => {
    expect(parsed('1 234,56', { decimalSeparator: ',', thousandsSeparator: ' ' })).toBe(1234_560000000000n);
    expect(parsed('1\u00a0234\u202f567,5', { decimalSeparator: ',', thousandsSeparator: ' ' })).toBe(1234567_500000000000n);
    expect(parsed('1.234.567,5', { decimalSeparator: ',', thousandsSeparator: '.' })).toBe(1234567_500000000000n);
    expect(parsed('1,234.5', { decimalSeparator: '.', thousandsSeparator: ',' })).toBe(1234_500000000000n);
    expect(parsed("1'234.5", { decimalSeparator: '.', thousandsSeparator: "'" })).toBe(1234_500000000000n);
    // Wrong grouping is rejected instead of guessed.
    expect(parseDecimal('12,34.5', { decimalSeparator: '.', thousandsSeparator: ',' }).ok).toBe(false);
    expect(parseDecimal('1,2345', { decimalSeparator: '.', thousandsSeparator: ',' }).ok).toBe(false);
    // Without a configured thousands separator, grouping is an error, never a silent decimal.
    expect(parseDecimal('1,234', DOT).ok).toBe(false);
    expect(parseDecimal('1.234,5', COMMA).ok).toBe(false);
    expect(parseDecimal('1.5', { decimalSeparator: '.', thousandsSeparator: '.' }).ok).toBe(false);
  });

  it('rejects anything that is not a plain decimal', () => {
    for (const bad of ['', ' ', '-', '.5', '5.', '1e5', '1E-3', '+5', '€5', '5€', '0x10', 'NaN', 'Infinity', '1..2', '1.2.3', '--1', '1 000', '١٢٣', '1.0000001']) {
      expect(parseDecimal(bad, DOT).ok, bad).toBe(false);
    }
    expect(parseDecimal('9'.repeat(16), DOT).ok).toBe(false);
    expect(parsed('9'.repeat(15))).toBe(BigInt('9'.repeat(15)) * SCALE);
    expect(parseDecimal('1'.repeat(70), DOT).ok).toBe(false);
  });
});

describe('rounding and division', () => {
  it('rounds half away from zero', () => {
    expect(roundDiv(5n, 2n)).toBe(3n); // 2.5 -> 3
    expect(roundDiv(-5n, 2n)).toBe(-3n); // -2.5 -> -3
    expect(roundDiv(7n, 3n)).toBe(2n); // 2.33 -> 2
    expect(roundDiv(8n, 3n)).toBe(3n); // 2.67 -> 3
    expect(roundDiv(5n, -2n)).toBe(-3n);
    expect(() => roundDiv(1n, 0n)).toThrow(RangeError);
  });

  it('divides fixed values with one rounding at 10^-12', () => {
    // 1000 / 3 = 333.333333333333|33… -> 333.333333333333
    expect(divideFixed(1000n * SCALE, 3n * SCALE)).toBe(333_333333333333n);
    // 2 / 3 = 0.666666666666|67 -> 0.666666666667
    expect(divideFixed(2n * SCALE, 3n * SCALE)).toBe(666666666667n);
  });

  it('formats ratios with exact half-away-from-zero rounding and no negative zero', () => {
    expect(formatRatio(ratio(1n, 8n), 2)).toBe('0.13'); // 0.125
    expect(formatRatio(ratio(-1n, 8n), 2)).toBe('-0.13');
    expect(formatRatio(ratio(12345n, 1000n), 2)).toBe('12.35'); // 12.345
    expect(formatRatio(ratio(-1n, 1000n), 2)).toBe('0.00');
    expect(formatRatio(ratio(200n, 3n), 2)).toBe('66.67');
    expect(formatRatio(ratio(5n, 1n), 0)).toBe('5');
    expect(formatRatio(ratio(1n, 3n), 6)).toBe('0.333333');
    expect(() => formatRatio(ratio(1n, 3n), 13)).toThrow(RangeError);
    expect(() => formatRatio(ratio(1n, 3n), 1.5)).toThrow(RangeError);
  });

  it('keeps sums exact where binary floating point drifts', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in floating point; exact here.
    expect(formatFixed(sumFixed([parsed('0.1'), parsed('0.2')]), 12)).toBe('0.300000000000');
    // Ten thousand times 0.01 is exactly 100.
    expect(sumFixed(Array.from({ length: 10_000 }, () => parsed('0.01')))).toBe(100n * SCALE);
  });

  it('does exact ratio arithmetic and comparison', () => {
    const third = ratio(1n, 3n);
    expect(addRatio(third, third)).toEqual({ num: 2n, den: 3n });
    expect(subtractRatio(third, ratio(1n, 2n))).toEqual({ num: -1n, den: 6n });
    expect(multiplyRatio(third, ratio(3n, 1n))).toEqual({ num: 1n, den: 1n });
    expect(divideRatio(third, ratio(2n, 1n))).toEqual({ num: 1n, den: 6n });
    expect(() => divideRatio(third, ratio(0n, 1n))).toThrow(RangeError);
    expect(compareRatio(ratio(1n, 3n), ratio(33n, 100n))).toBe(1);
    expect(compareRatio(ratio(2n, 4n), ratio(1n, 2n))).toBe(0);
    expect(absRatio(ratio(-1n, 2n))).toEqual({ num: 1n, den: 2n });
    expect(ratio(2n, -4n)).toEqual({ num: -1n, den: 2n });
    expect(() => ratio(1n, 0n)).toThrow(RangeError);
    expect(compareFixed(1n, 2n)).toBe(-1);
    expect(compareFixed(2n, 2n)).toBe(0);
  });

  it('converts integers and groups digits', () => {
    expect(fixedFromInteger(3)).toBe(3n * SCALE);
    expect(() => fixedFromInteger(1.5)).toThrow(RangeError);
    expect(groupDecimalString('1234567.89', '.', ',')).toBe('1,234,567.89');
    expect(groupDecimalString('-1234.5', ',', ' ')).toBe('-1 234,5');
    expect(groupDecimalString('123', '.', ',')).toBe('123');
    expect(groupDecimalString('0.50', '.', ',')).toBe('0.50');
  });
});

describe('parseDecimal on long runs of spaces', () => {
  it('trims surrounding ASCII spaces in linear time', () => {
    const hostile = `${' '.repeat(200_000)}x`;
    const t0 = performance.now();
    expect(parseDecimal(hostile, DOT).ok).toBe(false);
    expect(parseDecimal(`  12.5  `, DOT)).toEqual({ ok: true, value: parsed('12.5') });
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
