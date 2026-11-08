// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

// Every expected value below is calculated by hand in the comments.
// Gap = (male average − female average) / male average × 100 (Article 3(1)(c));
// median gap likewise with medians (Article 3(1)(e)). Display rounding is
// half away from zero to 2 decimals.

import { describe, expect, it } from 'vitest';
import { computeIndicators, payLevels, type CalculationSettings } from '../src/core/indicators.js';
import { SCALE } from '../src/core/decimal.js';
import { BASE, ds, val, w } from './helpers.js';

function first(settings: CalculationSettings, workers: Parameters<typeof ds>[0]) {
  const ind = computeIndicators(ds(workers), settings);
  const b = ind.bases[0];
  if (b === undefined) throw new Error('no basis');
  return { ind, b };
}

describe('Article 9(1)(a) gender pay gap', () => {
  it('uses the difference of averages as a percentage of the male average', () => {
    // F: 30000, 40000 → average 35000. M: 50000, 50000 → average 50000.
    // gap = (50000 − 35000) / 50000 × 100 = 30.00
    const { b } = first(BASE, [w('female', '30000'), w('female', '40000'), w('male', '50000'), w('male', '50000')]);
    expect(b.genderPayGap).toEqual({
      female: { workers: 2, average: { status: 'ok', value: '35000.00' } },
      male: { workers: 2, average: { status: 'ok', value: '50000.00' } },
      gap: { status: 'ok', value: '30.00' },
    });
  });

  it('includes complementary components in the pay level (Article 3(1)(a))', () => {
    // F: 900 + 100 = 1000. M: 1000 + 250 = 1250. gap = 250 / 1250 × 100 = 20.00
    const { b } = first(BASE, [w('female', '900', '100'), w('male', '1000', '250')]);
    expect(val(b.genderPayGap.gap)).toBe('20.00');
  });

  it('rounds the displayed gap half away from zero', () => {
    // F: 2, M: 3 → 1/3 × 100 = 33.333… → 33.33
    expect(val(first(BASE, [w('female', '2'), w('male', '3')]).b.genderPayGap.gap)).toBe('33.33');
    // F: 1, M: 3 → 2/3 × 100 = 66.666… → 66.67
    expect(val(first(BASE, [w('female', '1'), w('male', '3')]).b.genderPayGap.gap)).toBe('66.67');
    // F: 87.655, M: 100 → 12.345 exactly → 12.35
    expect(val(first(BASE, [w('female', '87.655'), w('male', '100')]).b.genderPayGap.gap)).toBe('12.35');
    // F: 112.345, M: 100 → −12.345 exactly → −12.35 (women paid more: negative gap)
    expect(val(first(BASE, [w('female', '112.345'), w('male', '100')]).b.genderPayGap.gap)).toBe('-12.35');
  });

  it('is not applicable without female or male workers, or with a zero male average', () => {
    expect(first(BASE, [w('male', '1')]).b.genderPayGap.gap).toEqual({ status: 'not-applicable', reason: 'no-female-workers' });
    expect(first(BASE, [w('female', '1')]).b.genderPayGap.gap).toEqual({ status: 'not-applicable', reason: 'no-male-workers' });
    expect(first(BASE, [w('female', '1'), w('male', '0')]).b.genderPayGap.gap).toEqual({ status: 'not-applicable', reason: 'male-average-is-zero' });
    expect(first(BASE, []).b.genderPayGap.female.average).toEqual({ status: 'not-applicable', reason: 'no-female-workers' });
  });
});

describe('Article 9(1)(c) median gender pay gap', () => {
  it('uses the middle value for odd counts and the midpoint of the two middle values for even counts', () => {
    // F (odd): 30, 10, 20 → sorted 10, 20, 30 → median 20.
    // M (even): 40, 10, 30, 20 → sorted 10, 20, 30, 40 → median (20 + 30) / 2 = 25.
    // gap = (25 − 20) / 25 × 100 = 20.00
    const { b } = first(BASE, [w('female', '30'), w('female', '10'), w('female', '20'), w('male', '40'), w('male', '10'), w('male', '30'), w('male', '20')]);
    expect(b.medianGenderPayGap).toEqual({
      female: { workers: 3, median: { status: 'ok', value: '20.00' } },
      male: { workers: 4, median: { status: 'ok', value: '25.00' } },
      gap: { status: 'ok', value: '20.00' },
    });
  });

  it('handles a single worker and a midpoint with an odd last digit', () => {
    // M: 0.01, 0.02 → median 0.015 → shown 0.02; F: 0.01 → gap = 0.005 / 0.015 = 33.333… %
    const { b } = first(BASE, [w('female', '0.01'), w('male', '0.01'), w('male', '0.02')]);
    expect(val(b.medianGenderPayGap.male.median)).toBe('0.02');
    expect(val(b.medianGenderPayGap.gap)).toBe('33.33');
  });

  it('is not applicable when the male median is zero', () => {
    const { b } = first(BASE, [w('female', '5'), w('male', '0'), w('male', '0'), w('male', '9')]);
    expect(b.medianGenderPayGap.gap).toEqual({ status: 'not-applicable', reason: 'male-median-is-zero' });
  });
});

describe('Article 9(1)(b), (d), (e) complementary or variable components', () => {
  // F: components 0 and 100. M: components 200, 200 and 0.
  const workers = () => [w('female', '1000', '0'), w('female', '1000', '100'), w('male', '1000', '200'), w('male', '1000', '200'), w('male', '1000', '0')];

  it('compares recipients only when configured', () => {
    // Recipients: F {100} → 100; M {200, 200} → 200. gap = 100 / 200 = 50.00. Medians the same: 50.00.
    const { b } = first({ ...BASE, complementaryGapPopulation: 'recipients' }, workers());
    expect(b.complementaryPayGap).toEqual({
      female: { workers: 1, average: { status: 'ok', value: '100.00' } },
      male: { workers: 2, average: { status: 'ok', value: '200.00' } },
      gap: { status: 'ok', value: '50.00' },
    });
    expect(val(b.medianComplementaryPayGap.gap)).toBe('50.00');
  });

  it('compares all workers, counting zero, when configured', () => {
    // F: (0 + 100) / 2 = 50. M: (200 + 200 + 0) / 3 = 133.333…
    // gap = (133.333… − 50) / 133.333… = 1 − 150/400 = 62.50
    // Medians: F {0, 100} → 50; M {0, 200, 200} → 200; gap = 150 / 200 = 75.00
    const { b } = first(BASE, workers());
    expect(val(b.complementaryPayGap.female.average)).toBe('50.00');
    expect(val(b.complementaryPayGap.male.average)).toBe('133.33');
    expect(val(b.complementaryPayGap.gap)).toBe('62.50');
    expect(val(b.medianComplementaryPayGap.gap)).toBe('75.00');
  });

  it('gives the proportion of each sex receiving components', () => {
    // F: 1 of 2 = 50.00 %. M: 2 of 3 = 66.666… → 66.67 %.
    const { ind } = first(BASE, workers());
    expect(ind.proportionReceivingComplementary).toEqual({
      female: { workers: 2, proportion: { status: 'ok', value: '50.00' } },
      male: { workers: 3, proportion: { status: 'ok', value: '66.67' } },
    });
  });

  it('reports missing recipients per sex', () => {
    const { b } = first({ ...BASE, complementaryGapPopulation: 'recipients' }, [w('female', '1'), w('male', '1', '5')]);
    expect(b.complementaryPayGap.gap).toEqual({ status: 'not-applicable', reason: 'no-female-recipients' });
    const m = first({ ...BASE, complementaryGapPopulation: 'recipients' }, [w('female', '1', '5'), w('male', '1')]).b;
    expect(m.complementaryPayGap.gap).toEqual({ status: 'not-applicable', reason: 'no-male-recipients' });
    const all = first(BASE, [w('female', '1'), w('male', '1')]).b;
    expect(all.complementaryPayGap.gap).toEqual({ status: 'not-applicable', reason: 'male-average-is-zero' });
    expect(first(BASE, []).ind.proportionReceivingComplementary.female.proportion).toEqual({ status: 'not-applicable', reason: 'no-female-workers' });
  });
});

describe('Article 9(1)(f) quartile pay bands', () => {
  // Pay levels: 10 F, 20 M, 20 F, 30 M, 40 F, 50 M (six workers, a tie at 20).
  const six = () => [w('female', '10'), w('male', '20'), w('female', '20'), w('male', '30'), w('female', '40'), w('male', '50')];

  it('exact equal groups share boundary workers and ties in proportion', () => {
    // Each band holds 6 / 4 = 1.5 workers. Positions: 10F [0,1), tie 20 (1F,1M) [1,3), 30M [3,4), 40F [4,5), 50M [5,6).
    // Band 1 [0,1.5): 10F + 0.5 of tie (0.25F, 0.25M) → F 1.25/1.5 = 83.33 %, M 0.25/1.5 = 16.67 %
    // Band 2 [1.5,3): 1.5 of tie (0.75F, 0.75M) → 50.00 % / 50.00 %
    // Band 3 [3,4.5): 30M + 0.5 of 40F → F 0.5/1.5 = 33.33 %, M 66.67 %
    // Band 4 [4.5,6): 0.5 of 40F + 50M → F 33.33 %, M 66.67 %
    const { b } = first(BASE, six());
    expect(b.quartilePayBands).toEqual([
      { band: 1, workers: '1.50', female: { status: 'ok', value: '83.33' }, male: { status: 'ok', value: '16.67' } },
      { band: 2, workers: '1.50', female: { status: 'ok', value: '50.00' }, male: { status: 'ok', value: '50.00' } },
      { band: 3, workers: '1.50', female: { status: 'ok', value: '33.33' }, male: { status: 'ok', value: '66.67' } },
      { band: 4, workers: '1.50', female: { status: 'ok', value: '33.33' }, male: { status: 'ok', value: '66.67' } },
    ]);
  });

  it('whole-workers method keeps ties together, placed by middle rank', () => {
    // band = floor(4 × midRank / n), n = 6, 0-based ranks.
    // 10 → mid 0 → 0; tie 20 → ranks 1,2 → mid 1.5 → floor(1.0) = 1; 30 → mid 3 → floor(2.0) = 2;
    // 40 → mid 4 → floor(2.67) = 2; 50 → mid 5 → floor(3.33) = 3.
    // Bands: {10F} | {20F, 20M} | {30M, 40F} | {50M}
    const { b } = first({ ...BASE, quartileMethod: 'whole-workers-ties-together' }, six());
    expect(b.quartilePayBands.map((q) => [q.workers, val(q.female), val(q.male)])).toEqual([
      ['1.00', '100.00', '0.00'],
      ['2.00', '50.00', '50.00'],
      ['2.00', '50.00', '50.00'],
      ['1.00', '0.00', '100.00'],
    ]);
  });

  it('gives identical results for both methods when n is a multiple of 4 without ties at boundaries', () => {
    // 8 workers, levels 1..8: bands {1,2} {3,4} {5,6} {7,8}; F at 1, 3, 4, 8.
    const eight = ['female', 'male', 'female', 'female', 'male', 'male', 'male', 'female'].map((g, i) => w(g as 'female', String(i + 1)));
    const exact = first(BASE, eight).b.quartilePayBands;
    const whole = first({ ...BASE, quartileMethod: 'whole-workers-ties-together' }, eight).b.quartilePayBands;
    expect(exact).toEqual(whole);
    expect(exact.map((q) => val(q.female))).toEqual(['50.00', '100.00', '0.00', '50.00']);
  });

  it('handles a tie spanning all bands', () => {
    // 4 workers with the same pay, 2F 2M.
    // Exact: each band gets 1 worker's worth of the group → 0.5F, 0.5M → 50 % / 50 %.
    // Whole: the group's middle rank is 1.5 → floor(4 × 1.5 / 4) = 1 → all in band 2; other bands empty.
    const four = () => [w('female', '7'), w('female', '7'), w('male', '7'), w('male', '7')];
    expect(first(BASE, four()).b.quartilePayBands.map((q) => val(q.female))).toEqual(['50.00', '50.00', '50.00', '50.00']);
    const whole = first({ ...BASE, quartileMethod: 'whole-workers-ties-together' }, four()).b.quartilePayBands;
    expect(whole.map((q) => q.workers)).toEqual(['0.00', '4.00', '0.00', '0.00']);
    expect(whole[0]?.female).toEqual({ status: 'not-applicable', reason: 'no-workers' });
  });

  it('does not depend on input order', () => {
    const a = six();
    const b = [...a].reverse();
    expect(computeIndicators(ds(a), BASE)).toEqual(computeIndicators(ds(b), BASE));
  });

  it('counts other-gender workers in band sizes only when configured', () => {
    // 4 workers: F 1, X 2, M 3, M 4. include-in-totals: band 2 holds X → F 0 %, M 0 %.
    const ws = [w('female', '1'), w('other', '2'), w('male', '3'), w('male', '4')];
    const incl = first({ ...BASE, otherGender: 'include-in-totals' }, ws);
    expect(incl.b.quartilePayBands.map((q) => [val(q.female), val(q.male)])).toEqual([
      ['100.00', '0.00'],
      ['0.00', '0.00'],
      ['0.00', '100.00'],
      ['0.00', '100.00'],
    ]);
    expect(incl.ind.workersIncluded).toEqual({ female: 1, male: 2, otherInBands: 1 });
    // exclude: 3 workers, bands of 0.75.
    const excl = first(BASE, ws);
    expect(excl.b.quartilePayBands.map((q) => q.workers)).toEqual(['0.75', '0.75', '0.75', '0.75']);
    expect(excl.ind.workersIncluded.otherInBands).toBe(0);
  });
});

describe('Article 9(1)(g) and the Article 10(1)(a) threshold', () => {
  it('breaks the gap down by basic and complementary pay per category', () => {
    // Category A: F basic 100, 100 / components 0, 20. M basic 100, 120 / components 10, 10.
    // Basic: F 100, M 110 → 10 / 110 = 9.0909… → 9.09
    // Complementary (all workers): F 10, M 10 → 0.00
    // Total: F (100 + 120) / 2 = 110, M (110 + 130) / 2 = 120 → 10 / 120 = 8.333… → 8.33 → threshold met
    const { b } = first(BASE, [
      w('female', '100', '0', { category: 'A' }),
      w('female', '100', '20', { category: 'A' }),
      w('male', '100', '10', { category: 'A' }),
      w('male', '120', '10', { category: 'A' }),
    ]);
    expect(b.categories).toEqual([
      {
        category: 'A',
        female: {
          workers: 2,
          basicAverage: { status: 'ok', value: '100.00' },
          complementaryAverage: { status: 'ok', value: '10.00' },
          totalAverage: { status: 'ok', value: '110.00' },
        },
        male: {
          workers: 2,
          basicAverage: { status: 'ok', value: '110.00' },
          complementaryAverage: { status: 'ok', value: '10.00' },
          totalAverage: { status: 'ok', value: '120.00' },
        },
        basicPayGap: { status: 'ok', value: '9.09' },
        complementaryPayGap: { status: 'ok', value: '0.00' },
        totalPayGap: { status: 'ok', value: '8.33' },
        jointAssessmentThreshold: 'met',
      },
    ]);
  });

  it('tests the 5 % threshold exactly, in either direction', () => {
    // C: F 95, M 100 → exactly 5.00 → met.  D: F 95.01 → 4.99 → not met.
    // E: F 105 → −5.00 → met (a difference in either direction).  G: F 95.0001 → 4.999 → shown 5.00 but not met.
    // H: only women → not determinable.  Z: only men → not determinable.
    const { b } = first(BASE, [
      w('female', '95', '0', { category: 'C' }),
      w('male', '100', '0', { category: 'C' }),
      w('female', '95.01', '0', { category: 'D' }),
      w('male', '100', '0', { category: 'D' }),
      w('female', '105', '0', { category: 'E' }),
      w('male', '100', '0', { category: 'E' }),
      w('female', '95.0001', '0', { category: 'G' }),
      w('male', '100', '0', { category: 'G' }),
      w('female', '1', '0', { category: 'H' }),
      w('male', '1', '0', { category: 'Z' }),
    ]);
    const byName = new Map((b.categories ?? []).map((c) => [c.category, c]));
    expect(byName.get('C')?.jointAssessmentThreshold).toBe('met');
    expect(byName.get('D')?.jointAssessmentThreshold).toBe('not-met');
    expect(byName.get('E')?.jointAssessmentThreshold).toBe('met');
    expect(val(byName.get('E')?.totalPayGap ?? { status: 'x' })).toBe('-5.00');
    expect(val(byName.get('G')?.totalPayGap ?? { status: 'x' })).toBe('5.00');
    expect(byName.get('G')?.jointAssessmentThreshold).toBe('not-met');
    expect(byName.get('H')).toMatchObject({ totalPayGap: { status: 'not-applicable', reason: 'no-male-workers' }, jointAssessmentThreshold: 'not-determinable' });
    expect(byName.get('Z')).toMatchObject({ totalPayGap: { status: 'not-applicable', reason: 'no-female-workers' }, jointAssessmentThreshold: 'not-determinable' });
    expect(byName.get('Z')?.female.totalAverage).toEqual({ status: 'not-applicable', reason: 'no-female-workers' });
  });

  it('is immune to floating-point drift at the threshold', () => {
    // M: 0.10 and 0.70 → average 0.40. F: 0.38. gap = 0.02 / 0.40 = exactly 5 %.
    // In binary floating point this computes as 4.999999999999991 and would miss the threshold.
    const { b } = first(BASE, [w('male', '0.10', '0', { category: 'A' }), w('male', '0.70', '0', { category: 'A' }), w('female', '0.38', '0', { category: 'A' })]);
    expect(b.categories?.[0]?.jointAssessmentThreshold).toBe('met');
  });

  it('sorts categories by code point and returns null without a category column', () => {
    const { b } = first(BASE, [w('female', '1', '0', { category: 'b' }), w('male', '1', '0', { category: 'B' }), w('male', '1', '0', { category: 'Ä' })]);
    expect(b.categories?.map((c) => c.category)).toEqual(['B', 'b', 'Ä']);
    expect(first(BASE, [w('female', '1')]).b.categories).toBeNull();
  });
});

describe('pay bases (Article 3(1)(b))', () => {
  it('computes hourly pay as pay divided by hours', () => {
    // F: 1000 / 100 h = 10.00 per hour. M: 1500 / 100 h = 15.00. gap = 5 / 15 = 33.33
    const { b } = first({ ...BASE, payBases: ['hourly'] }, [w('female', '1000', '0', { hours: '100' }), w('male', '1500', '0', { hours: '100' })]);
    expect(b.basis).toBe('hourly');
    expect(val(b.genderPayGap.female.average)).toBe('10.00');
    expect(val(b.genderPayGap.gap)).toBe('33.33');
  });

  it('scales annual pay by full-time equivalent when configured', () => {
    // F: 15000 at 0.5 FTE → 30000. M: 30000 at 1 FTE → 30000. gap 0.00 (actual pay would give 50.00).
    const ws = [w('female', '15000', '0', { fte: '0.5' }), w('male', '30000', '0', { fte: '1' })];
    expect(val(first({ ...BASE, annualPay: 'full-time-equivalent' }, ws).b.genderPayGap.gap)).toBe('0.00');
    expect(val(first(BASE, ws).b.genderPayGap.gap)).toBe('50.00');
  });

  it('rounds each per-worker division once at 10^-12', () => {
    // 1000 / 3 h = 333.333333333333(33…) → 333.333333333333
    const level = payLevels(w('female', '1000', '0', { hours: '3' }), 'hourly', undefined);
    expect(level.total).toBe(333_333333333333n);
    expect(payLevels(w('female', '10', '5', { fte: '0.5' }), 'annual', 'full-time-equivalent')).toMatchObject({ basic: 20n * SCALE, complementary: 10n * SCALE, total: 30n * SCALE });
  });

  it('computes every configured basis in a fixed order', () => {
    const ind = computeIndicators(ds([w('female', '1', '0', { hours: '1' }), w('male', '2', '0', { hours: '1' })]), { ...BASE, payBases: ['hourly', 'annual'] });
    expect(ind.bases.map((b) => b.basis)).toEqual(['hourly', 'annual']);
  });

  it('throws on missing hours, FTE or annual method (guards for API callers)', () => {
    expect(() => payLevels(w('female', '1'), 'hourly', undefined)).toThrow(RangeError);
    expect(() => payLevels(w('female', '1'), 'annual', 'full-time-equivalent')).toThrow(RangeError);
    expect(() => payLevels(w('female', '1'), 'annual', undefined)).toThrow(RangeError);
  });
});
