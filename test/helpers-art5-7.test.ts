// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { computeIndicators } from '../src/core/indicators.js';
import { informationRequestResponse } from '../src/core/information-request.js';
import { annualInformationNotice, payCriteriaStatement } from '../src/core/notices.js';
import { salaryRangeText } from '../src/core/salary-range.js';
import { renderInformationResponseHtml, renderInformationResponseMarkdown } from '../src/report/information-response.js';
import { BASE, ds, w } from './helpers.js';

describe('salaryRangeText (Article 5(1))', () => {
  it('writes a range or a single amount', () => {
    expect(salaryRangeText({ minimum: '3000', maximum: '3600', currency: 'EUR', period: 'month' })).toBe('Pay range: EUR 3,000.00 – 3,600.00 gross per month.');
    expect(salaryRangeText({ minimum: '21.5', currency: 'EUR', period: 'hour' })).toBe('Initial pay: EUR 21.50 gross per hour.');
    expect(salaryRangeText({ minimum: '40000', maximum: '40000', currency: 'SEK', period: 'year' })).toBe('Initial pay: SEK 40,000.00 gross per year.');
  });

  it('adds the collective agreement (Article 5(1)(b)) and custom separators', () => {
    expect(
      salaryRangeText({ minimum: '3000', maximum: '3600.5', currency: 'EUR', period: 'month', collectiveAgreement: 'Metal industry agreement 2026', decimalSeparator: ',', thousandsSeparator: '.' }),
    ).toBe('Pay range: EUR 3.000,00 – 3.600,50 gross per month. Collective agreement: Metal industry agreement 2026.');
  });

  it('fills a custom template literally', () => {
    expect(salaryRangeText({ minimum: '3000', maximum: '3600', currency: 'EUR', period: 'month', template: 'Atlyginimas: {minimum}–{maximum} {currency} ({period}) {minimum}' })).toBe(
      'Atlyginimas: 3,000.00–3,600.00 EUR (per month) 3,000.00',
    );
    expect(() => salaryRangeText({ minimum: '1', currency: 'EUR', period: 'month', template: '{constructor}' })).toThrow(/unknown placeholder/);
    // Only {minimum}, {maximum}, {currency} and {period} are placeholders; anything else stays literal text.
    expect(salaryRangeText({ minimum: '1', currency: 'EUR', period: 'month', template: '{__proto__} ${minimum}' })).toBe('{__proto__} $1.00');
  });

  it('rejects invalid input', () => {
    const base = { minimum: '3000', currency: 'EUR', period: 'month' } as const;
    expect(() => salaryRangeText({ ...base, minimum: '0' })).toThrow(/greater than 0/);
    expect(() => salaryRangeText({ ...base, minimum: '3,000' })).toThrow(RangeError);
    expect(() => salaryRangeText({ ...base, maximum: '2000' })).toThrow(/lower than minimum/);
    expect(() => salaryRangeText({ ...base, currency: 'eur' })).toThrow(/ISO 4217/);
    expect(() => salaryRangeText({ ...base, period: 'week' as 'month' })).toThrow(/period/);
    expect(() => salaryRangeText({ ...base, period: 'constructor' as 'month' })).toThrow(/period/);
    expect(() => salaryRangeText({ ...base, collectiveAgreement: 'x\u0000' })).toThrow(/control/);
    expect(() => salaryRangeText({ ...base, decimalSeparator: ',', thousandsSeparator: ',' })).toThrow(RangeError);
    expect(() => salaryRangeText({ ...base, template: 'x'.repeat(501) })).toThrow(/at most 500/);
  });
});

describe('informationRequestResponse (Article 7)', () => {
  // Category A: women 100, 110, 120, 130, 140, 120 (average 720 / 6 = 120); men 150 × 5 (average 150).
  // Category B: one woman (90) and five men.
  const data = () =>
    ds([
      ...['100', '110', '120', '130', '140', '120'].map((p, i) => w('female', p, '0', { category: 'A', id: `f${i}` })),
      ...Array.from({ length: 5 }, (_, i) => w('male', '150', '0', { category: 'A', id: `m${i}` })),
      w('female', '90', '0', { category: 'B', id: 'b0' }),
      ...Array.from({ length: 5 }, (_, i) => w('male', '100', '0', { category: 'B', id: `bm${i}` })),
      ...Array.from({ length: 5 }, (_, i) => w('female', '100', '0', { category: 'C', id: `c${i}` })),
    ]);
  const settings = { ...BASE, suppressSmallGroups: true };

  it("gives the worker's own pay level and the category averages by sex", () => {
    const d = data();
    const r = informationRequestResponse(d, computeIndicators(d, settings), 'f1', { payBases: ['annual'], annualPay: 'actual', decimals: 2, requestDate: '2027-01-31' });
    expect(r).toEqual({
      workerId: 'f1',
      category: 'A',
      byBasis: [{ basis: 'annual', individualPayLevel: '110.00', femaleAverage: { status: 'ok', value: '120.00' }, maleAverage: { status: 'ok', value: '150.00' } }],
      requestDate: '2027-01-31',
      // Article 7(4): at the latest two months from the request; 31 March.
      answerDueBy: '2027-03-31',
    });
  });

  it('withholds averages of small groups, including for the requesting worker', () => {
    const d = data();
    const r = informationRequestResponse(d, computeIndicators(d, settings), 'bm0', { payBases: ['annual'], annualPay: 'actual', decimals: 2 });
    expect(r.byBasis[0]?.femaleAverage).toEqual({ status: 'suppressed', reason: 'below-minimum-group-size' });
    expect(r.byBasis[0]?.maleAverage).toEqual({ status: 'ok', value: '100.00' });
    const md = renderInformationResponseMarkdown(r, { employer: 'Example', currency: 'EUR' });
    expect(md).toContain('withheld: small group');
    expect(md).toContain('Article 12(3)');
    expect(md).toContain('Evenkeel by AFKzona Group');
  });

  it('needs a category column', () => {
    const d = ds([w('female', '1', '0', { id: 'x' }), w('male', '1')]);
    expect(() => informationRequestResponse(d, computeIndicators(d, settings), 'x', { payBases: ['annual'], annualPay: 'actual', decimals: 2 })).toThrow(/columns\.category/);
  });

  it('rejects unknown workers and invalid dates', () => {
    const d = data();
    const ind = computeIndicators(d, settings);
    expect(() => informationRequestResponse(d, ind, 'nobody', { payBases: ['annual'], annualPay: 'actual', decimals: 2 })).toThrow(RangeError);
    expect(() => informationRequestResponse(d, ind, 'f1', { payBases: ['annual'], annualPay: 'actual', decimals: 2, requestDate: '31.01.2027' })).toThrow(RangeError);
  });

  it('renders escaped HTML and validates render options', () => {
    const d = data();
    const r = informationRequestResponse(d, computeIndicators(d, settings), 'f1', { payBases: ['annual'], annualPay: 'actual', decimals: 2 });
    const html = renderInformationResponseHtml(r, { employer: '<b>Acme</b>' });
    expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt;');
    expect(html).not.toContain('<script');
    expect(() => renderInformationResponseMarkdown(r, { currency: 'euro' })).toThrow(RangeError);
    expect(() => renderInformationResponseMarkdown(r, { employer: 'a\u202eb' })).toThrow(RangeError);
  });
});

describe('notices (Article 6(1) and 7(3))', () => {
  it('lays out pay criteria by scope with escaped text', () => {
    const md = payCriteriaStatement('Acme [Ltd]', [
      { name: 'Seniority', description: 'Years in role *capped* at 10', factor: 'other', appliesTo: ['pay-progression'] },
      { name: 'Job level', description: 'Level 1–5 from the job evaluation', factor: 'responsibility', appliesTo: ['pay', 'pay-levels'] },
    ]);
    expect(md).toContain('# Pay setting and pay progression criteria – Acme \\[Ltd\\]');
    expect(md).toContain('## Pay progression');
    expect(md).toContain('**Seniority** (Other relevant factor): Years in role \\*capped\\* at 10');
    expect(md).toContain('**Job level** (Responsibility)');
    expect(() => payCriteriaStatement('Acme', [])).toThrow(RangeError);
    expect(() => payCriteriaStatement('', [{ name: 'a', description: 'b', factor: 'skills', appliesTo: ['pay'] }])).toThrow(RangeError);
    expect(() => payCriteriaStatement('Acme', [{ name: 'a', description: 'b', factor: 'luck' as 'skills', appliesTo: ['pay'] }])).toThrow(RangeError);
  });

  it('writes the yearly notice of the right to information', () => {
    const md = annualInformationNotice({ employerName: 'Acme', howToRequest: 'Write to hr@example.com' });
    expect(md).toContain('within two months');
    expect(md).toContain('hr\\@example\\.com');
    expect(md).toContain('#art_7');
    expect(() => annualInformationNotice({ employerName: 'Acme', howToRequest: '\u0007' })).toThrow(RangeError);
  });
});
