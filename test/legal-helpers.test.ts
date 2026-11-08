// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { addMonths, daysInMonth, formatIsoDate, parseIsoDate } from '../src/core/dates.js';
import { computeIndicators } from '../src/core/indicators.js';
import { assessJointPayAssessment } from '../src/core/joint-assessment.js';
import { DIRECTIVE, articleUrl, recitalUrl } from '../src/core/legal.js';
import { reportingObligation } from '../src/core/obligations.js';
import { BASE, ds, w } from './helpers.js';

describe('reportingObligation (Article 9(2)–(5))', () => {
  it('places employers in the size bands of the directive', () => {
    expect(reportingObligation(99, 2027)).toMatchObject({ sizeBand: 'fewer-than-100', legalBasis: 'Article 9(5)', frequencyYears: null, reportDueInYear: false, subjectToReporting: false });
    expect(reportingObligation(0, 2027).sizeBand).toBe('fewer-than-100');
    expect(reportingObligation(100, 2031)).toMatchObject({ sizeBand: '100-to-149', legalBasis: 'Article 9(4)', frequencyYears: 3 });
    expect(reportingObligation(149, 2031).sizeBand).toBe('100-to-149');
    expect(reportingObligation(150, 2027)).toMatchObject({ sizeBand: '150-to-249', legalBasis: 'Article 9(3)', frequencyYears: 3 });
    expect(reportingObligation(249, 2027).sizeBand).toBe('150-to-249');
    expect(reportingObligation(250, 2027)).toMatchObject({ sizeBand: '250-or-more', legalBasis: 'Article 9(2)', frequencyYears: 1 });
  });

  it('250 or more: by 7 June 2027 and every year thereafter, on the previous calendar year', () => {
    expect(reportingObligation(300, 2026).reportDueInYear).toBe(false);
    for (const year of [2027, 2028, 2029, 2035]) {
      expect(reportingObligation(300, year)).toMatchObject({ reportDueInYear: true, deadline: `${year}-06-07`, referenceYear: year - 1 });
    }
  });

  it('150 to 249: by 7 June 2027 and every three years thereafter', () => {
    const due = [2026, 2027, 2028, 2029, 2030, 2031, 2033].map((y) => reportingObligation(200, y).reportDueInYear);
    expect(due).toEqual([false, true, false, false, true, false, true]);
  });

  it('100 to 149: by 7 June 2031 and every three years thereafter', () => {
    const due = [2027, 2030, 2031, 2032, 2034, 2037].map((y) => reportingObligation(120, y).reportDueInYear);
    expect(due).toEqual([false, false, true, false, true, true]);
    expect(reportingObligation(120, 2031).deadline).toBe('2031-06-07');
  });

  it('rejects invalid input', () => {
    expect(() => reportingObligation(-1, 2027)).toThrow(RangeError);
    expect(() => reportingObligation(1.5, 2027)).toThrow(RangeError);
    expect(() => reportingObligation(1, 1999)).toThrow(RangeError);
  });
});

describe('dates', () => {
  it('parses and validates ISO dates', () => {
    expect(parseIsoDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    for (const bad of ['2027-02-29', '2027-13-01', '2027-00-10', '2027-1-1', '27-01-01', '2027-01-32', 'x', '1899-01-01']) expect(parseIsoDate(bad), bad).toBeNull();
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2027, 4)).toBe(30);
  });

  it('adds months, clamping to the end of a shorter month', () => {
    const add = (d: string, m: number) => formatIsoDate(addMonths(parseIsoDate(d) ?? { year: 0, month: 1, day: 1 }, m));
    expect(add('2027-06-07', 6)).toBe('2027-12-07');
    expect(add('2027-08-31', 6)).toBe('2028-02-29');
    expect(add('2026-08-31', 6)).toBe('2027-02-28');
    expect(add('2027-12-31', 2)).toBe('2028-02-29');
    expect(add('2027-01-31', 2)).toBe('2027-03-31');
    expect(() => addMonths({ year: 2027, month: 1, day: 1 }, -1)).toThrow(RangeError);
  });
});

describe('assessJointPayAssessment (Article 10(1))', () => {
  // Category A: F 90, M 100 → gap 10 % (met). Category B: F 99, M 100 → 1 % (not met).
  const indicators = () =>
    computeIndicators(
      ds([
        w('female', '90', '0', { category: 'A', hours: '1' }),
        w('male', '100', '0', { category: 'A', hours: '1' }),
        w('female', '99', '0', { category: 'B', hours: '1' }),
        w('male', '100', '0', { category: 'B', hours: '1' }),
      ]),
      { ...BASE, payBases: ['annual', 'hourly'] },
    );

  it('computes condition (a) from data and leaves (b) and (c) unknown without employer input', () => {
    const r = assessJointPayAssessment({ indicators: indicators() });
    expect(r.computed).toBe(true);
    expect(r.thresholdMetIn).toEqual(['A']);
    expect(r.categories.map((c) => [c.category, c.conditionA, c.conditionB, c.conditionC, c.assessmentRequired])).toEqual([
      ['A', 'met', 'unknown', 'unknown', 'unknown'],
      ['B', 'not-met', 'unknown', 'unknown', 'no'],
    ]);
    expect(r.categories[0]?.byBasis.map((b) => b.basis)).toEqual(['annual', 'hourly']);
  });

  it('requires an assessment only when all three conditions are met', () => {
    const status = (justified?: boolean, remedied?: boolean) =>
      assessJointPayAssessment({
        indicators: indicators(),
        status: new Map([['A', { ...(justified === undefined ? {} : { justified }), ...(remedied === undefined ? {} : { remedied }) }]]),
      }).categories[0]?.assessmentRequired;
    expect(status(false, false)).toBe('yes');
    expect(status(true, false)).toBe('no');
    expect(status(false, true)).toBe('no');
    expect(status(false)).toBe('unknown');
  });

  it('gives the indicative end of the six-month remedy period', () => {
    expect(assessJointPayAssessment({ indicators: indicators(), submissionDate: '2027-06-07' }).remedyPeriodEnds).toBe('2027-12-07');
    expect(() => assessJointPayAssessment({ indicators: indicators(), submissionDate: '7 June 2027' })).toThrow(RangeError);
  });

  it('reports withheld and not-computed cases', () => {
    const small = computeIndicators(ds([w('female', '1', '0', { category: 'A' }), w('male', '2', '0', { category: 'A' })]), { ...BASE, suppressSmallGroups: true });
    expect(assessJointPayAssessment({ indicators: small }).categories[0]).toMatchObject({ conditionA: 'withheld', assessmentRequired: 'unknown' });
    const none = computeIndicators(ds([w('female', '1')]), BASE);
    expect(assessJointPayAssessment({ indicators: none })).toEqual({ computed: false, categories: [], thresholdMetIn: [], remedyPeriodEnds: null });
    const onlyWomen = computeIndicators(ds([w('female', '1', '0', { category: 'A' })]), BASE);
    expect(assessJointPayAssessment({ indicators: onlyWomen }).categories[0]).toMatchObject({ conditionA: 'not-determinable', assessmentRequired: 'no' });
  });
});

describe('legal references', () => {
  it('points to the official text on EUR-Lex', () => {
    expect(DIRECTIVE).toMatchObject({ celex: '32023L0970', officialJournal: 'OJ L 132, 17.5.2023, p. 21', transpositionDeadline: '2026-06-07' });
    expect(articleUrl(9)).toBe('https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_9');
    expect(recitalUrl(22)).toBe('https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#rct_22');
    expect(() => articleUrl(38)).toThrow(RangeError);
    expect(() => recitalUrl(0)).toThrow(RangeError);
  });
});
