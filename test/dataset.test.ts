// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/core/csv.js';
import { MAX_ISSUES, buildDataset, quoteExcerpt, type IssueCode } from '../src/core/dataset.js';
import { SCALE } from '../src/core/decimal.js';
import { config } from './helpers.js';

const HEADER = 'id,gender,category,basic,bonus,hours';

function build(text: string, overrides: Record<string, unknown> = {}) {
  const cfg = config(overrides);
  const t = parseCsv(text, cfg.csv.delimiter, cfg.csv.limits);
  if (!t.ok) throw new Error(t.error.message);
  return buildDataset(t.value, cfg);
}

function codes(text: string, overrides: Record<string, unknown> = {}): IssueCode[] {
  const r = build(text, overrides);
  return r.ok ? [] : r.issues.map((i) => i.code);
}

describe('buildDataset', () => {
  it('maps columns to typed worker records', () => {
    const r = build(`${HEADER}\n1,F,A,1000.50,,1720\n2, m ,B,2000,10.25,1720\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b] = r.dataset.workers;
    expect(a).toMatchObject({ id: '1', gender: 'female', category: 'A', basic: 1000_500000000000n, complementary: 0n, hours: 1720n * SCALE, lines: [2] });
    // Gender codes match case-insensitively after trimming; empty complementary cells count as zero.
    expect(b).toMatchObject({ gender: 'male', complementary: 10_250000000000n });
    expect(r.dataset.summary).toEqual({ dataRows: 2, rowsUsed: 2, rowsOtherPeriod: 0, workers: 2, female: 1, male: 1, other: 0 });
  });

  it('sums several pay columns', () => {
    const cfg = { columns: { workerId: 'id', gender: 'gender', basicPay: ['b1', 'b2'], complementaryPay: ['c1', 'c2'] }, payBases: ['annual'] };
    const r = build('id,gender,b1,b2,c1,c2\n1,F,100,50.5,1,2\n', cfg);
    expect(r.ok && r.dataset.workers[0]).toMatchObject({ basic: 150_500000000000n, complementary: 3n * SCALE });
  });

  it('reads locale decimals with a configured thousands separator', () => {
    const r = build('id;gender;category;basic;bonus;hours\n1;F;A;1.234,56;0,5;1.720\n', {
      csv: { delimiter: ';', decimalSeparator: ',', thousandsSeparator: '.' },
    });
    expect(r.ok && r.dataset.workers[0]).toMatchObject({ basic: 1234_560000000000n, complementary: 500000000000n, hours: 1720n * SCALE });
  });

  it('reports missing and ambiguous columns', () => {
    expect(codes('id,gender,basic\n1,F,1\n')).toEqual(['missing-column', 'missing-column', 'missing-column']);
    expect(codes(`${HEADER},basic\n1,F,A,1,1,1,1\n`)).toEqual(['ambiguous-column']);
  });

  it('gives one row-level error per problem, with the line number', () => {
    const text = [
      HEADER,
      '1,F,A,100,0,10',
      '2,F,A,100,0', // field count
      ',F,A,100,0,10', // empty id
      '4,,A,100,0,10', // empty gender
      '5,Q,A,100,0,10', // unknown gender
      '6,F,,100,0,10', // empty category
      '7,F,A,,0,10', // empty basic
      '8,F,A,1e3,0,10', // invalid amount
      '9,F,A,-5,0,10', // negative amount
      '10,F,A,100,0,0', // zero hours with hourly basis
      '11,F,A,100,0,9000', // too many hours
      '12,F,A,100,0,', // missing hours
      '13,F,A,100,0,x', // invalid hours
    ].join('\n');
    const r = build(text);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => [i.line, i.code])).toEqual([
      [3, 'field-count'],
      [4, 'empty-value'],
      [5, 'empty-value'],
      [6, 'unknown-gender'],
      [7, 'empty-value'],
      [8, 'empty-value'],
      [9, 'invalid-amount'],
      [10, 'negative-amount'],
      [11, 'invalid-hours'],
      [12, 'invalid-hours'],
      [13, 'invalid-hours'],
      [14, 'invalid-hours'],
    ]);
    // Messages never echo pay amounts.
    expect(r.issues.find((i) => i.code === 'negative-amount')?.message).not.toContain('-5');
  });

  it('rejects ids and categories with control or invisible characters', () => {
    expect(codes(`${HEADER}\n1\u001b[31m,F,A,1,0,1\n`)).toEqual(['invalid-text']);
    expect(codes(`${HEADER}\n1,F,A\u202eB,1,0,1\n`)).toEqual(['invalid-text']);
    expect(codes(`${HEADER}\n${'x'.repeat(101)},F,A,1,0,1\n`)).toEqual(['invalid-text']);
    // Lengths are UTF-16 code units; the Python package counts the same way.
    expect(codes(`${HEADER}\n${'\u{1F600}'.repeat(50)},F,A,1,0,1\n`)).toEqual([]);
    expect(codes(`${HEADER}\n${'\u{1F600}'.repeat(51)},F,A,1,0,1\n`)).toEqual(['invalid-text']);
    // Line separator, Arabic letter mark (bidirectional), soft hyphen, zero-width joiner.
    for (const ch of ['\u2028', '\u061c', '\u00ad', '\u200d']) expect(codes(`${HEADER}\n1,F,A${ch}B,1,0,1\n`), ch).toEqual(['invalid-text']);
  });

  it('applies the other-gender policy', () => {
    expect(codes(`${HEADER}\n1,X,A,1,0,1\n`, { otherGender: 'reject' })).toEqual(['other-gender-rejected']);
    const r = build(`${HEADER}\n1,X,A,1,0,1\n2,F,A,1,0,1\n`);
    expect(r.ok && r.dataset.summary).toMatchObject({ other: 1, female: 1 });
  });

  it('validates full-time equivalents', () => {
    const cfg = { columns: { workerId: 'id', gender: 'gender', basicPay: ['basic'], complementaryPay: [], fte: 'fte' }, payBases: ['annual'], annualPay: 'full-time-equivalent' };
    expect(codes('id,gender,basic,fte\n1,F,1,0\n2,F,1,1.01\n3,F,1,\n4,F,1,0.5\n', cfg)).toEqual(['invalid-fte', 'invalid-fte', 'invalid-fte']);
  });

  it('rejects duplicate worker ids by default and sums them when configured', () => {
    const text = `${HEADER}\n1,F,A,100,1,10\n1,F,A,50,2,5\n`;
    expect(codes(text)).toEqual(['duplicate-worker']);
    const r = build(text, { duplicateWorkerRows: 'sum' });
    expect(r.ok && r.dataset.workers).toEqual([
      { id: '1', gender: 'female', category: 'A', basic: 150n * SCALE, complementary: 3n * SCALE, hours: 15n * SCALE, fte: null, lines: [2, 3] },
    ]);
    expect(codes(`${HEADER}\n1,F,A,100,1,10\n1,M,A,50,2,5\n`, { duplicateWorkerRows: 'sum' })).toEqual(['inconsistent-duplicate']);
    expect(codes(`${HEADER}\n1,F,A,100,1,5000\n1,F,A,50,2,5000\n`, { duplicateWorkerRows: 'sum' })).toEqual(['invalid-hours']);
  });

  it('leaves out and counts rows of another period', () => {
    const cols = { workerId: 'id', gender: 'gender', basicPay: ['basic'], complementaryPay: [], period: 'year' };
    const r = build('id,gender,basic,year\n1,F,1,2026\n2,M,1,2025\n3,M,2,2026\n', { columns: cols, payBases: ['annual'], referencePeriod: '2026' });
    expect(r.ok && r.dataset.summary).toMatchObject({ dataRows: 3, rowsUsed: 2, rowsOtherPeriod: 1, workers: 2 });
    expect(codes('id,gender,basic,year\n2,M,1,2025\n', { columns: cols, payBases: ['annual'], referencePeriod: '2026' })).toEqual(['no-workers']);
  });

  it('caps the number of collected issues', () => {
    const rows = Array.from({ length: MAX_ISSUES + 50 }, (_, i) => `${i},Q,A,1,0,1`).join('\n');
    const r = build(`${HEADER}\n${rows}\n`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toHaveLength(MAX_ISSUES);
      expect(r.moreIssues).toBe(50);
    }
  });
});

describe('quoteExcerpt', () => {
  it('truncates and escapes control, invisible and quote characters', () => {
    expect(quoteExcerpt('abc')).toBe('"abc"');
    expect(quoteExcerpt('a"b\\c')).toBe('"a\\u{22}b\\u{5c}c"');
    expect(quoteExcerpt('\u001b[2J\u202e')).toBe('"\\u{1b}[2J\\u{202e}"');
    expect(quoteExcerpt('x'.repeat(30))).toBe(`"${'x'.repeat(24)}…"`);
  });
});
