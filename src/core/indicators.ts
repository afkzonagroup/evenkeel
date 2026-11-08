// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The seven indicators of Article 9(1)(a)–(g) of Directive (EU) 2023/970
 * and the Article 10(1)(a) threshold per category of workers.
 *
 * Definitions applied (Article 3(1)):
 * - (c) gender pay gap = (average pay level of male workers − average pay
 *   level of female workers) / average pay level of male workers × 100.
 * - (e) median gender pay gap: the same with medians.
 * - (d) median pay level: the middle value; with an even number of workers,
 *   the midpoint of the two middle values.
 * - (f) quartile pay bands: see {@link quartileBands}.
 *
 * A positive gap means female workers are paid less on average.
 *
 * @packageDocumentation
 */

import type {
  AnnualPayMethod,
  ComplementaryGapPopulation,
  OtherGenderPolicy,
  PayBasis,
  QuartileMethod,
} from './config.js';
import type { Dataset, Gender, WorkerRecord } from './dataset.js';
import {
  SCALE,
  absRatio,
  compareFixed,
  compareRatio,
  divideFixed,
  divideRatio,
  formatRatio,
  multiplyRatio,
  ratio,
  subtractRatio,
  type Fixed,
  type Ratio,
} from './decimal.js';
import { quartileBands, type BandInput } from './quartiles.js';

/** The settings that change a calculation result. */
export interface CalculationSettings {
  readonly payBases: readonly PayBasis[];
  readonly annualPay?: AnnualPayMethod;
  readonly complementaryGapPopulation: ComplementaryGapPopulation;
  readonly quartileMethod: QuartileMethod;
  readonly minimumGroupSize: number;
  readonly otherGender: OtherGenderPolicy;
  readonly decimals: number;
  /** When false, small-group protection is off. Only for internal use; see docs/privacy.md. */
  readonly suppressSmallGroups: boolean;
}

/** Why a figure is withheld. */
export type SuppressionReason =
  /** The group has fewer workers than the minimum group size. */
  | 'below-minimum-group-size'
  /** Fewer recipients of complementary or variable components than the minimum: their amounts could be derived. */
  | 'few-recipients'
  /** Withheld so that a suppressed figure cannot be derived by subtraction from other published figures. */
  | 'secondary-suppression';

/** Why a figure cannot be computed. */
export type NotApplicableReason =
  | 'no-female-workers'
  | 'no-male-workers'
  | 'no-female-recipients'
  | 'no-male-recipients'
  | 'no-workers'
  | 'male-average-is-zero'
  | 'male-median-is-zero';

/** A reported value: a decimal string, or the reason it is not shown. */
export type Figure =
  | { readonly status: 'ok'; readonly value: string }
  | { readonly status: 'suppressed'; readonly reason: SuppressionReason }
  | { readonly status: 'not-applicable'; readonly reason: NotApplicableReason };

/** Average-based gap: Article 9(1)(a), (b). */
export interface GapIndicator {
  readonly female: { readonly workers: number; readonly average: Figure };
  readonly male: { readonly workers: number; readonly average: Figure };
  /** Percentage of the male average. */
  readonly gap: Figure;
}

/** Median-based gap: Article 9(1)(c), (d). */
export interface MedianGapIndicator {
  readonly female: { readonly workers: number; readonly median: Figure };
  readonly male: { readonly workers: number; readonly median: Figure };
  /** Percentage of the male median. */
  readonly gap: Figure;
}

/** One quartile pay band: Article 9(1)(f). Proportions are percentages of the band. */
export interface QuartileBand {
  readonly band: 1 | 2 | 3 | 4;
  /** Number of workers in the band; may be fractional with the exact method. */
  readonly workers: string;
  readonly female: Figure;
  readonly male: Figure;
}

/** Result of the Article 10(1)(a) test for one category on one basis. */
export type ThresholdResult = 'met' | 'not-met' | 'not-determinable' | 'withheld';

/** One sex within one category: Article 9(1)(g). */
export interface CategorySexFigures {
  readonly workers: number;
  readonly basicAverage: Figure;
  readonly complementaryAverage: Figure;
  readonly totalAverage: Figure;
}

/** Gap for one category of workers: Article 9(1)(g), with the Article 10(1)(a) test. */
export interface CategoryGap {
  readonly category: string;
  readonly female: CategorySexFigures;
  readonly male: CategorySexFigures;
  /** Gap in ordinary basic wage or salary. */
  readonly basicPayGap: Figure;
  /** Gap in complementary or variable components. */
  readonly complementaryPayGap: Figure;
  /** Gap in total pay (the average pay level used by Article 10(1)(a)). */
  readonly totalPayGap: Figure;
  /** Whether the difference in average pay level is at least 5 % (exact comparison, either direction). */
  readonly jointAssessmentThreshold: ThresholdResult;
}

/** Indicators on one pay basis. */
export interface BasisIndicators {
  readonly basis: PayBasis;
  /** Article 9(1)(a). */
  readonly genderPayGap: GapIndicator;
  /** Article 9(1)(b). */
  readonly complementaryPayGap: GapIndicator;
  /** Article 9(1)(c). */
  readonly medianGenderPayGap: MedianGapIndicator;
  /** Article 9(1)(d). */
  readonly medianComplementaryPayGap: MedianGapIndicator;
  /** Article 9(1)(f). */
  readonly quartilePayBands: readonly QuartileBand[];
  /** Article 9(1)(g); null when no category column is configured. */
  readonly categories: readonly CategoryGap[] | null;
}

/** Article 9(1)(e) for one sex. */
export interface ReceivingProportion {
  readonly workers: number;
  readonly proportion: Figure;
}

/** All indicators. This object is also the shared test-vector format. */
export interface Indicators {
  readonly workersIncluded: { readonly female: number; readonly male: number; readonly otherInBands: number };
  /** Article 9(1)(e): percentage of female and male workers receiving complementary or variable components. */
  readonly proportionReceivingComplementary: { readonly female: ReceivingProportion; readonly male: ReceivingProportion };
  readonly bases: readonly BasisIndicators[];
}

/** The Article 10(1)(a) threshold: a difference of at least 5 %. */
export const JOINT_ASSESSMENT_THRESHOLD_PERCENT = 5;

const HUNDRED: Ratio = { num: 100n, den: 1n };
const THRESHOLD: Ratio = { num: BigInt(JOINT_ASSESSMENT_THRESHOLD_PERCENT), den: 1n };

/** Compares strings by Unicode code point (the same order in every language). */
export function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const cx = x[i]?.codePointAt(0) ?? 0;
    const cy = y[i]?.codePointAt(0) ?? 0;
    if (cx !== cy) return cx - cy;
  }
  return x.length - y.length;
}

/** Per-worker pay levels on one basis. */
interface Levels {
  readonly gender: Gender;
  readonly category: string | null;
  readonly basic: Fixed;
  readonly complementary: Fixed;
  readonly total: Fixed;
  readonly receives: boolean;
}

/**
 * Pay level of one worker on one basis (Article 3(1)(b)).
 * - annual, actual: the amounts as given.
 * - annual, full-time-equivalent: each amount divided by the FTE fraction.
 * - hourly: each amount divided by hours.
 * Each of basic, complementary and total is divided separately and rounded
 * once to 10^-12.
 */
export function payLevels(worker: WorkerRecord, basis: PayBasis, annualPay: AnnualPayMethod | undefined): Levels {
  const total = worker.basic + worker.complementary;
  let divisor: Fixed | null = null;
  if (basis === 'hourly') {
    if (worker.hours === null || worker.hours <= 0n) throw new RangeError(`worker ${worker.id} has no hours`);
    divisor = worker.hours;
  } else if (annualPay === 'full-time-equivalent') {
    if (worker.fte === null || worker.fte <= 0n) throw new RangeError(`worker ${worker.id} has no full-time equivalent`);
    divisor = worker.fte;
  } else if (annualPay === undefined) {
    throw new RangeError('annualPay must be set for the annual basis');
  }
  const scale = (v: Fixed): Fixed => (divisor === null ? v : divideFixed(v, divisor));
  return {
    gender: worker.gender,
    category: worker.category,
    basic: scale(worker.basic),
    complementary: scale(worker.complementary),
    total: scale(total),
    receives: worker.complementary > 0n,
  };
}

interface Agg {
  readonly n: number;
  readonly sum: Fixed;
}

function aggregate(values: readonly Fixed[]): Agg {
  let sum = 0n;
  for (const v of values) sum += v;
  return { n: values.length, sum };
}

function mean(a: Agg): Ratio {
  return ratio(a.sum, BigInt(a.n) * SCALE);
}

function median(values: readonly Fixed[]): Ratio {
  const sorted = [...values].sort(compareFixed);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0n;
  if (sorted.length % 2 === 1) return ratio(upper, SCALE);
  const lower = sorted[mid - 1] ?? 0n;
  return ratio(lower + upper, 2n * SCALE);
}

/** (male − female) / male × 100. Caller guarantees male ≠ 0. */
function gapPercent(male: Ratio, female: Ratio): Ratio {
  return multiplyRatio(divideRatio(subtractRatio(male, female), male), HUNDRED);
}

const ok = (value: string): Figure => ({ status: 'ok', value });
const na = (reason: NotApplicableReason): Figure => ({ status: 'not-applicable', reason });
const suppressed = (reason: SuppressionReason): Figure => ({ status: 'suppressed', reason });

type Hidden = SuppressionReason | null;

/** A computed value for one sex, before formatting. */
interface SexStats {
  readonly n: number;
  readonly value: Ratio | null;
  readonly hidden: Hidden;
  /** Reason to report when the group is empty. */
  readonly empty: NotApplicableReason;
}

function figureOf(s: SexStats, decimals: number): Figure {
  if (s.n === 0 || s.value === null) return na(s.empty);
  if (s.hidden !== null) return suppressed(s.hidden);
  return ok(formatRatio(s.value, decimals));
}

function gapFigure(female: SexStats, male: SexStats, decimals: number, zeroReason: NotApplicableReason): { figure: Figure; exact: Ratio | null } {
  if (female.n === 0 || female.value === null) return { figure: na(female.empty), exact: null };
  if (male.n === 0 || male.value === null) return { figure: na(male.empty), exact: null };
  if (male.value.num === 0n) return { figure: na(zeroReason), exact: null };
  const exact = gapPercent(male.value, female.value);
  const hidden = female.hidden ?? male.hidden;
  if (hidden !== null) return { figure: suppressed(hidden), exact };
  return { figure: ok(formatRatio(exact, decimals)), exact };
}

function emptyReason(sex: 'female' | 'male', recipientsOnly: boolean): NotApplicableReason {
  if (recipientsOnly) return sex === 'female' ? 'no-female-recipients' : 'no-male-recipients';
  return sex === 'female' ? 'no-female-workers' : 'no-male-workers';
}

/** Why complementary figures for a group are withheld, if they are. */
function complementaryHiddenReason(populationCount: number, recipients: number, small: (n: number) => boolean): Hidden {
  if (small(populationCount)) return 'below-minimum-group-size';
  // With the all-workers population, a group can be large while only a few
  // workers received complementary components; their amounts could then be
  // derived from the group average.
  if (small(recipients)) return 'few-recipients';
  return null;
}

/**
 * Secondary suppression across categories for one sex and one family of
 * figures. If figures for some categories are withheld, other categories
 * are withheld as well until the withheld set has at least two categories
 * and together at least `min` workers (or recipients). Otherwise a withheld
 * figure could be derived from the organisation-wide figure minus the
 * published ones. Candidates are taken smallest first, then by name.
 */
function secondarySuppression(counts: ReadonlyMap<string, number>, primary: ReadonlySet<string>, min: number): Set<string> {
  const hidden = new Set(primary);
  if (hidden.size === 0) return hidden;
  const candidates = [...counts.entries()]
    .filter(([cat, n]) => n > 0 && !hidden.has(cat))
    .sort((a, b) => a[1] - b[1] || compareCodePoints(a[0], b[0]));
  let total = 0;
  for (const cat of hidden) total += counts.get(cat) ?? 0;
  for (const [cat, n] of candidates) {
    if (hidden.size >= 2 && total >= min) break;
    hidden.add(cat);
    total += n;
  }
  return hidden;
}

/**
 * Computes all Article 9(1) indicators and the Article 10(1)(a) threshold.
 *
 * @example
 * const indicators = computeIndicators(dataset, { ...config, suppressSmallGroups: true });
 * indicators.bases[0].genderPayGap.gap // { status: 'ok', value: '12.50' }
 */
export function computeIndicators(dataset: Dataset, settings: CalculationSettings): Indicators {
  const min = settings.suppressSmallGroups ? settings.minimumGroupSize : 0;
  const d = settings.decimals;
  const small = (n: number): boolean => n > 0 && n < min;
  const recipientsOnly = settings.complementaryGapPopulation === 'recipients';
  const fm = dataset.workers.filter((w) => w.gender === 'female' || w.gender === 'male');
  const females = fm.filter((w) => w.gender === 'female');
  const males = fm.filter((w) => w.gender === 'male');
  // Fewer than the minimum workers recorded as neither female nor male are
  // left out of the bands even with include-in-totals: the female and male
  // shares of each band would otherwise show which band they are in.
  const othersInBands = settings.otherGender === 'include-in-totals' && !small(dataset.workers.length - fm.length);
  const inBands = othersInBands ? dataset.workers : fm;
  // With fewer than the minimum female (or male) workers overall, the band
  // proportions would show which band each of them is in.
  const bandSexSmall = small(females.length) || small(males.length);
  const hasCategories = dataset.workers.some((w) => w.category !== null);

  // (e) proportion receiving complementary or variable components (basis independent).
  const receiving = (group: readonly WorkerRecord[], sex: 'female' | 'male'): ReceivingProportion => {
    const n = group.length;
    if (n === 0) return { workers: 0, proportion: na(emptyReason(sex, false)) };
    if (small(n)) return { workers: n, proportion: suppressed('below-minimum-group-size') };
    const k = group.filter((w) => w.complementary > 0n).length;
    return { workers: n, proportion: ok(formatRatio(ratio(BigInt(k) * 100n, BigInt(n)), d)) };
  };

  const bases = settings.payBases.map((basis): BasisIndicators => {
    const levels = fm.map((w) => payLevels(w, basis, settings.annualPay));

    // (a) and (c): total pay level.
    const totalStats = (sex: 'female' | 'male', use: 'mean' | 'median'): SexStats => {
      const values = levels.filter((l) => l.gender === sex).map((l) => l.total);
      const empty = emptyReason(sex, false);
      if (values.length === 0) return { n: 0, value: null, hidden: null, empty };
      return {
        n: values.length,
        value: use === 'mean' ? mean(aggregate(values)) : median(values),
        hidden: small(values.length) ? 'below-minimum-group-size' : null,
        empty,
      };
    };

    // (b) and (d): complementary or variable components.
    const complementaryStats = (sex: 'female' | 'male', use: 'mean' | 'median'): SexStats => {
      const group = levels.filter((l) => l.gender === sex);
      const recipients = group.filter((l) => l.receives);
      const values = (recipientsOnly ? recipients : group).map((l) => l.complementary);
      const empty = emptyReason(sex, recipientsOnly);
      if (values.length === 0) return { n: 0, value: null, hidden: null, empty };
      return {
        n: values.length,
        value: use === 'mean' ? mean(aggregate(values)) : median(values),
        hidden: complementaryHiddenReason(values.length, recipients.length, small),
        empty,
      };
    };

    const meanGap = (fs: SexStats, ms: SexStats): GapIndicator => ({
      female: { workers: fs.n, average: figureOf(fs, d) },
      male: { workers: ms.n, average: figureOf(ms, d) },
      gap: gapFigure(fs, ms, d, 'male-average-is-zero').figure,
    });
    const medianGap = (fs: SexStats, ms: SexStats): MedianGapIndicator => ({
      female: { workers: fs.n, median: figureOf(fs, d) },
      male: { workers: ms.n, median: figureOf(ms, d) },
      gap: gapFigure(fs, ms, d, 'male-median-is-zero').figure,
    });

    // (f) quartile pay bands.
    const bandInput: BandInput[] = inBands.map((w) => ({ gender: w.gender, level: payLevels(w, basis, settings.annualPay).total }));
    const quartilePayBands = quartileBands(bandInput, settings.quartileMethod).map((b, i): QuartileBand => {
      const band = (i + 1) as 1 | 2 | 3 | 4;
      const workers = formatRatio(b.size, d);
      if (b.size.num === 0n) return { band, workers, female: na('no-workers'), male: na('no-workers') };
      if (bandSexSmall || (min > 0 && compareRatio(b.size, ratio(BigInt(min), 1n)) < 0)) {
        return { band, workers, female: suppressed('below-minimum-group-size'), male: suppressed('below-minimum-group-size') };
      }
      return {
        band,
        workers,
        female: ok(formatRatio(multiplyRatio(divideRatio(b.female, b.size), HUNDRED), d)),
        male: ok(formatRatio(multiplyRatio(divideRatio(b.male, b.size), HUNDRED), d)),
      };
    });

    return {
      basis,
      genderPayGap: meanGap(totalStats('female', 'mean'), totalStats('male', 'mean')),
      complementaryPayGap: meanGap(complementaryStats('female', 'mean'), complementaryStats('male', 'mean')),
      medianGenderPayGap: medianGap(totalStats('female', 'median'), totalStats('male', 'median')),
      medianComplementaryPayGap: medianGap(complementaryStats('female', 'median'), complementaryStats('male', 'median')),
      quartilePayBands,
      categories: hasCategories ? categoryGaps(levels, settings, min) : null,
    };
  });

  return {
    workersIncluded: {
      female: females.length,
      male: males.length,
      otherInBands: inBands.length - fm.length,
    },
    proportionReceivingComplementary: { female: receiving(females, 'female'), male: receiving(males, 'male') },
    bases,
  };
}

/** Article 9(1)(g) and the Article 10(1)(a) threshold per category. */
function categoryGaps(levels: readonly Levels[], settings: CalculationSettings, min: number): CategoryGap[] {
  const d = settings.decimals;
  const small = (n: number): boolean => n > 0 && n < min;
  const names = [...new Set(levels.map((l) => l.category ?? ''))].sort(compareCodePoints);
  const byCat = new Map<string, { female: Levels[]; male: Levels[] }>();
  for (const name of names) byCat.set(name, { female: [], male: [] });
  for (const l of levels) {
    const entry = byCat.get(l.category ?? '');
    if (entry !== undefined && l.gender !== 'other') entry[l.gender].push(l);
  }

  // Primary and secondary suppression, per sex, for total pay (counted in
  // workers) and for complementary components (counted in recipients).
  const hiddenTotal = { female: new Set<string>(), male: new Set<string>() };
  const hiddenComplementary = { female: new Set<string>(), male: new Set<string>() };
  for (const sex of ['female', 'male'] as const) {
    const workerCounts = new Map<string, number>();
    const recipientCounts = new Map<string, number>();
    const primaryTotal = new Set<string>();
    const primaryComplementary = new Set<string>();
    for (const [cat, entry] of byCat) {
      const group = entry[sex];
      const k = group.filter((l) => l.receives).length;
      workerCounts.set(cat, group.length);
      recipientCounts.set(cat, k);
      if (small(group.length)) primaryTotal.add(cat);
      if (small(k) || small(group.length)) primaryComplementary.add(cat);
    }
    if (min > 0) {
      hiddenTotal[sex] = secondarySuppression(workerCounts, primaryTotal, min);
      hiddenComplementary[sex] = secondarySuppression(recipientCounts, primaryComplementary, min);
    }
  }

  const recipientsOnly = settings.complementaryGapPopulation === 'recipients';
  return names.map((category): CategoryGap => {
    const entry = byCat.get(category) ?? { female: [], male: [] };
    const stats = (sex: 'female' | 'male') => {
      const group = entry[sex];
      const n = group.length;
      const recipients = group.filter((l) => l.receives);
      const population = recipientsOnly ? recipients : group;
      const totalHidden: Hidden = small(n) ? 'below-minimum-group-size' : hiddenTotal[sex].has(category) ? 'secondary-suppression' : null;
      const complementaryHidden: Hidden =
        complementaryHiddenReason(population.length, recipients.length, small) ??
        (hiddenComplementary[sex].has(category) ? 'secondary-suppression' : null);
      // Basic pay is withheld whenever total or complementary is withheld:
      // total − basic would otherwise reveal the complementary amounts.
      const basicHidden: Hidden =
        totalHidden ?? (complementaryHidden === null ? null : complementaryHidden === 'secondary-suppression' ? 'secondary-suppression' : 'few-recipients');
      const empty = emptyReason(sex, false);
      const of = (values: readonly Fixed[], hidden: Hidden, emptyAs: NotApplicableReason): SexStats =>
        values.length === 0 ? { n: 0, value: null, hidden: null, empty: emptyAs } : { n: values.length, value: mean(aggregate(values)), hidden, empty: emptyAs };
      return {
        n,
        total: of(group.map((l) => l.total), totalHidden, empty),
        basic: of(group.map((l) => l.basic), basicHidden, empty),
        complementary: of(population.map((l) => l.complementary), complementaryHidden, emptyReason(sex, recipientsOnly)),
      };
    };
    const fs = stats('female');
    const ms = stats('male');
    const totalGap = gapFigure(fs.total, ms.total, d, 'male-average-is-zero');

    let threshold: ThresholdResult;
    if (totalGap.exact === null) threshold = 'not-determinable';
    else if (totalGap.figure.status === 'suppressed') threshold = 'withheld';
    else threshold = compareRatio(absRatio(totalGap.exact), THRESHOLD) >= 0 ? 'met' : 'not-met';

    const sexFigures = (s: typeof fs): CategorySexFigures => ({
      workers: s.n,
      basicAverage: figureOf(s.basic, d),
      complementaryAverage: figureOf(s.complementary, d),
      totalAverage: figureOf(s.total, d),
    });

    return {
      category,
      female: sexFigures(fs),
      male: sexFigures(ms),
      basicPayGap: gapFigure(fs.basic, ms.basic, d, 'male-average-is-zero').figure,
      complementaryPayGap: gapFigure(fs.complementary, ms.complementary, d, 'male-average-is-zero').figure,
      totalPayGap: totalGap.figure,
      jointAssessmentThreshold: threshold,
    };
  });
}
