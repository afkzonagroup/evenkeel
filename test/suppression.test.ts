// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

// Small-group protection (Article 12; recital 44). These tests fail if a
// suppression rule is removed.

import { describe, expect, it } from 'vitest';
import { computeIndicators, type CalculationSettings } from '../src/core/indicators.js';
import type { WorkerRecord } from '../src/core/dataset.js';
import { BASE, ds, val, w } from './helpers.js';

const ON: CalculationSettings = { ...BASE, suppressSmallGroups: true, minimumGroupSize: 5 };

function many(n: number, gender: 'female' | 'male', basic: string, complementary = '0', category?: string): WorkerRecord[] {
  return Array.from({ length: n }, () => w(gender, basic, complementary, category === undefined ? {} : { category }));
}

describe('primary suppression', () => {
  it('withholds averages, medians and gaps of groups below the minimum size', () => {
    const b = computeIndicators(ds([...many(4, 'female', '100'), ...many(5, 'male', '200')]), ON).bases[0];
    expect(b?.genderPayGap.female.average).toEqual({ status: 'suppressed', reason: 'below-minimum-group-size' });
    expect(b?.genderPayGap.male.average).toEqual({ status: 'ok', value: '200.00' });
    expect(b?.genderPayGap.gap).toEqual({ status: 'suppressed', reason: 'below-minimum-group-size' });
    expect(b?.medianGenderPayGap.female.median.status).toBe('suppressed');
    // The count itself is not pay information and stays visible.
    expect(b?.genderPayGap.female.workers).toBe(4);
  });

  it('shows figures at exactly the minimum size', () => {
    const b = computeIndicators(ds([...many(5, 'female', '100'), ...many(5, 'male', '200')]), ON).bases[0];
    expect(val(b?.genderPayGap.gap ?? { status: 'x' })).toBe('50.00');
  });

  it('withholds the proportion receiving components for small groups', () => {
    const ind = computeIndicators(ds([...many(2, 'female', '100', '5'), ...many(5, 'male', '200')]), ON);
    expect(ind.proportionReceivingComplementary.female.proportion).toEqual({ status: 'suppressed', reason: 'below-minimum-group-size' });
  });

  it('withholds quartile proportions when a band is smaller than the minimum', () => {
    // 12 workers → bands of 3 < 5.
    const b = computeIndicators(ds([...many(6, 'female', '1'), ...many(6, 'male', '2')]), ON).bases[0];
    expect(b?.quartilePayBands.every((q) => q.female.status === 'suppressed' && q.male.status === 'suppressed')).toBe(true);
  });

  it('can be switched off for internal use', () => {
    const b = computeIndicators(ds([w('female', '100'), w('male', '200')]), { ...ON, suppressSmallGroups: false }).bases[0];
    expect(val(b?.genderPayGap.gap ?? { status: 'x' })).toBe('50.00');
  });
});

describe('few recipients of complementary components', () => {
  it('withholds component figures when 1 to min−1 workers received them, even in a large group', () => {
    // 6 women, one of whom received a bonus of 600. With the all-workers population the average
    // (600 / 6 = 100) would reveal her bonus to anyone who knows who received one.
    const b = computeIndicators(ds([...many(5, 'female', '100'), w('female', '100', '600'), ...many(6, 'male', '100', '50')]), ON).bases[0];
    expect(b?.complementaryPayGap.female.average).toEqual({ status: 'suppressed', reason: 'few-recipients' });
    expect(b?.medianComplementaryPayGap.female.median).toEqual({ status: 'suppressed', reason: 'few-recipients' });
    expect(b?.complementaryPayGap.gap.status).toBe('suppressed');
    // Total pay of the group of 6 stays visible.
    expect(b?.genderPayGap.female.average.status).toBe('ok');
  });

  it('withholds basic pay in a category when components are withheld (total − basic would reveal them)', () => {
    const ws = [...many(5, 'female', '100', '0', 'A'), w('female', '100', '600', { category: 'A' }), ...many(6, 'male', '100', '50', 'A')];
    const c = computeIndicators(ds(ws), ON).bases[0]?.categories?.[0];
    expect(c?.female.complementaryAverage).toEqual({ status: 'suppressed', reason: 'few-recipients' });
    expect(c?.female.basicAverage).toEqual({ status: 'suppressed', reason: 'few-recipients' });
    expect(c?.female.totalAverage.status).toBe('ok');
    expect(c?.basicPayGap.status).toBe('suppressed');
    expect(c?.totalPayGap.status).toBe('ok');
  });
});

describe('secondary suppression across categories', () => {
  it('withholds a second category so a small group cannot be derived from the organisation total', () => {
    // Women: A has 1, B has 5, C has 6. The organisation-wide female average is published,
    // so with only A withheld, A = (total − B − C). B (the smallest other group) is withheld too:
    // the withheld set {A, B} has 2 categories and 6 ≥ 5 women.
    const ws = [
      w('female', '100', '0', { category: 'A' }),
      ...many(5, 'male', '100', '0', 'A'),
      ...many(5, 'female', '100', '0', 'B'),
      ...many(5, 'male', '100', '0', 'B'),
      ...many(6, 'female', '100', '0', 'C'),
      ...many(5, 'male', '100', '0', 'C'),
    ];
    const cats = computeIndicators(ds(ws), ON).bases[0]?.categories ?? [];
    expect(cats.map((c) => [c.category, c.female.totalAverage.status === 'suppressed' ? c.female.totalAverage.reason : 'shown'])).toEqual([
      ['A', 'below-minimum-group-size'],
      ['B', 'secondary-suppression'],
      ['C', 'shown'],
    ]);
    expect(cats[1]?.jointAssessmentThreshold).toBe('withheld');
    // Male figures are unaffected.
    expect(cats.every((c) => c.male.totalAverage.status === 'ok')).toBe(true);
  });

  it('keeps adding categories until the withheld set holds at least the minimum', () => {
    // Women: A 1, B 2 (both small, together 3 < 5) → add the smallest other, C (5). D (7) stays shown.
    const ws = [
      w('female', '1', '0', { category: 'A' }),
      ...many(2, 'female', '1', '0', 'B'),
      ...many(5, 'female', '1', '0', 'C'),
      ...many(7, 'female', '1', '0', 'D'),
    ];
    const cats = computeIndicators(ds(ws), ON).bases[0]?.categories ?? [];
    expect(cats.map((c) => c.female.totalAverage.status)).toEqual(['suppressed', 'suppressed', 'suppressed', 'ok']);
    expect(cats[2]?.female.totalAverage).toEqual({ status: 'suppressed', reason: 'secondary-suppression' });
  });

  it('breaks ties between equally small candidates by category name', () => {
    const ws = [w('female', '1', '0', { category: 'A' }), ...many(5, 'female', '1', '0', 'Y'), ...many(5, 'female', '1', '0', 'X')];
    const cats = computeIndicators(ds(ws), ON).bases[0]?.categories ?? [];
    expect(cats.map((c) => [c.category, c.female.totalAverage.status])).toEqual([
      ['A', 'suppressed'],
      ['X', 'suppressed'],
      ['Y', 'ok'],
    ]);
  });

  it('applies secondary suppression to component figures by recipient count', () => {
    // Women receiving components: A 1 recipient (of 5), B 5 recipients, C 6 recipients.
    const ws = [
      w('female', '100', '50', { category: 'A' }),
      ...many(4, 'female', '100', '0', 'A'),
      ...many(5, 'female', '100', '50', 'B'),
      ...many(6, 'female', '100', '50', 'C'),
    ];
    const cats = computeIndicators(ds(ws), ON).bases[0]?.categories ?? [];
    expect(cats.map((c) => (c.female.complementaryAverage.status === 'suppressed' ? c.female.complementaryAverage.reason : 'shown'))).toEqual([
      'few-recipients',
      'secondary-suppression',
      'shown',
    ]);
    // B's basic pay is withheld with its components; its total stays visible.
    expect(cats[1]?.female.basicAverage).toEqual({ status: 'suppressed', reason: 'secondary-suppression' });
    expect(cats[1]?.female.totalAverage.status).toBe('ok');
  });

  it('takes categories whose few workers received nothing into secondary suppression', () => {
    // All-workers population. Women: A 2 workers, no recipients (small group: its average, 0, is withheld);
    // B 6 and C 7 workers, all recipients. Without a partner, A's withheld average could be derived
    // as (organisation sum − B − C) ÷ 2, so B (the smaller one) is withheld as well.
    const ws = [...many(2, 'female', '100', '0', 'A'), ...many(6, 'female', '100', '50', 'B'), ...many(7, 'female', '100', '50', 'C')];
    const cats = computeIndicators(ds(ws), ON).bases[0]?.categories ?? [];
    expect(cats.map((c) => (c.female.complementaryAverage.status === 'suppressed' ? c.female.complementaryAverage.reason : 'shown'))).toEqual([
      'below-minimum-group-size',
      'secondary-suppression',
      'shown',
    ]);
  });

  it('withholds nothing extra when no group is small', () => {
    const ws = [...many(5, 'female', '1', '0', 'A'), ...many(5, 'female', '1', '0', 'B')];
    const cats = computeIndicators(ds(ws), ON).bases[0]?.categories ?? [];
    expect(cats.every((c) => c.female.totalAverage.status === 'ok')).toBe(true);
  });
});

describe('quartile pay bands and small groups', () => {
  const levels = (n: number, gender: 'female' | 'male' | 'other', start: number): WorkerRecord[] =>
    Array.from({ length: n }, (_, i) => w(gender, String(start + i)));

  it('withholds band proportions when the female or the male group is small', () => {
    // 2 women among 40 workers: the band shares would show which band each woman is in.
    const b = computeIndicators(ds([...levels(2, 'female', 1000), ...levels(38, 'male', 1)]), ON).bases[0];
    expect(b?.quartilePayBands.map((q) => [q.workers, q.female, q.male])).toEqual(
      [1, 2, 3, 4].map(() => ['10.00', { status: 'suppressed', reason: 'below-minimum-group-size' }, { status: 'suppressed', reason: 'below-minimum-group-size' }]),
    );
    // With protection off the same data shows the women in the top band.
    const open = computeIndicators(ds([...levels(2, 'female', 1000), ...levels(38, 'male', 1)]), BASE).bases[0];
    expect(open?.quartilePayBands[3]?.female).toEqual({ status: 'ok', value: '20.00' });
  });

  it('leaves a small group recorded as neither female nor male out of the bands', () => {
    // One worker coded "other" at the top of 41 workers. Inside the bands, female + male of band 4
    // would add up to less than 100 % and show where that worker is.
    const ws = [...levels(20, 'female', 1), ...levels(20, 'male', 100), w('other', '5000')];
    const include: CalculationSettings = { ...ON, otherGender: 'include-in-totals' };
    const ind = computeIndicators(ds(ws), include);
    expect(ind.workersIncluded.otherInBands).toBe(0);
    expect(ind.bases[0]?.quartilePayBands.map((q) => q.workers)).toEqual(['10.00', '10.00', '10.00', '10.00']);
    for (const q of ind.bases[0]?.quartilePayBands ?? []) {
      expect(Number(val(q.female)) + Number(val(q.male))).toBe(100);
    }
    // At the minimum size the group is counted in the bands as configured.
    const five = [...ws, ...levels(4, 'other', 6000)];
    expect(computeIndicators(ds(five), include).workersIncluded.otherInBands).toBe(5);
    // Without protection, too.
    expect(computeIndicators(ds(ws), { ...include, suppressSmallGroups: false }).workersIncluded.otherInBands).toBe(1);
  });
});
