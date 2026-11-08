// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Joint pay assessment trigger: Article 10(1) of Directive (EU) 2023/970.
 *
 * A joint pay assessment is required where all of the following are met:
 * (a) the pay reporting shows a difference in the average pay level between
 *     female and male workers of at least 5 % in any category of workers;
 * (b) the employer has not justified that difference on the basis of
 *     objective, gender-neutral criteria;
 * (c) the employer has not remedied the unjustified difference within six
 *     months of the date of submission of the pay reporting.
 *
 * Condition (a) is computed from the data. Conditions (b) and (c) are facts
 * only the employer and the workers' representatives can establish; they
 * are inputs here and stay "unknown" when not given.
 *
 * The directive does not say whether the difference is measured on the
 * annual or the hourly basis; with both bases configured, condition (a) is
 * met when either basis reaches 5 %. The difference is taken in either
 * direction and as a percentage of the male average, as in the gender pay
 * gap definition of Article 3(1)(c).
 *
 * @packageDocumentation
 */

import type { PayBasis } from './config.js';
import { addMonths, formatIsoDate, parseIsoDate } from './dates.js';
import type { Figure, Indicators, ThresholdResult } from './indicators.js';

/** What the employer has established for one category. */
export interface CategoryEmployerStatus {
  /** True when the difference is justified on objective, gender-neutral criteria. */
  readonly justified?: boolean;
  /** True when an unjustified difference was remedied within six months of submission. */
  readonly remedied?: boolean;
}

/** Input to {@link assessJointPayAssessment}. */
export interface JointAssessmentInput {
  readonly indicators: Indicators;
  /** Date the pay reporting was submitted (YYYY-MM-DD); used for the indicative six-month date. */
  readonly submissionDate?: string;
  /** Employer facts by category name. */
  readonly status?: ReadonlyMap<string, CategoryEmployerStatus>;
}

/** State of one Article 10(1) condition. */
export type ConditionState = 'met' | 'not-met' | 'unknown';

/** Article 10(1) result for one category. */
export interface JointAssessmentCategory {
  readonly category: string;
  readonly byBasis: readonly { readonly basis: PayBasis; readonly gap: Figure; readonly threshold: ThresholdResult }[];
  /** Condition (a). `withheld` when small-group protection hides the figures. */
  readonly conditionA: 'met' | 'not-met' | 'not-determinable' | 'withheld';
  readonly conditionB: ConditionState;
  readonly conditionC: ConditionState;
  readonly assessmentRequired: 'yes' | 'no' | 'unknown';
}

/** Result of {@link assessJointPayAssessment}. */
export interface JointAssessmentResult {
  /** False when no category column was configured. */
  readonly computed: boolean;
  readonly categories: readonly JointAssessmentCategory[];
  /** Categories where condition (a) is met. */
  readonly thresholdMetIn: readonly string[];
  /** Indicative end of the six-month remedy period (YYYY-MM-DD), when a submission date was given. */
  readonly remedyPeriodEnds: string | null;
}

/**
 * Evaluates Article 10(1) per category.
 *
 * @throws RangeError when `submissionDate` is not a valid YYYY-MM-DD date.
 */
export function assessJointPayAssessment(input: JointAssessmentInput): JointAssessmentResult {
  let remedyPeriodEnds: string | null = null;
  if (input.submissionDate !== undefined) {
    const date = parseIsoDate(input.submissionDate);
    if (date === null) throw new RangeError('submissionDate must be a valid date in the form YYYY-MM-DD');
    remedyPeriodEnds = formatIsoDate(addMonths(date, 6));
  }
  const first = input.indicators.bases[0];
  if (first === undefined || first.categories === null) {
    return { computed: false, categories: [], thresholdMetIn: [], remedyPeriodEnds };
  }
  const categories = first.categories.map((c, i): JointAssessmentCategory => {
    const byBasis = input.indicators.bases.map((b) => {
      const entry = b.categories?.[i];
      return {
        basis: b.basis,
        gap: entry?.totalPayGap ?? ({ status: 'not-applicable', reason: 'no-workers' } as const),
        threshold: entry?.jointAssessmentThreshold ?? ('not-determinable' as const),
      };
    });
    const results = byBasis.map((b) => b.threshold);
    const conditionA: JointAssessmentCategory['conditionA'] = results.includes('met')
      ? 'met'
      : results.includes('withheld')
        ? 'withheld'
        : results.includes('not-met')
          ? 'not-met'
          : 'not-determinable';
    const status = input.status?.get(c.category);
    const conditionB: ConditionState = status?.justified === undefined ? 'unknown' : status.justified ? 'not-met' : 'met';
    const conditionC: ConditionState = status?.remedied === undefined ? 'unknown' : status.remedied ? 'not-met' : 'met';
    let assessmentRequired: JointAssessmentCategory['assessmentRequired'];
    if (conditionA === 'not-met' || conditionA === 'not-determinable') assessmentRequired = 'no';
    else if (conditionA === 'withheld') assessmentRequired = 'unknown';
    else if (conditionB === 'not-met' || conditionC === 'not-met') assessmentRequired = 'no';
    else if (conditionB === 'met' && conditionC === 'met') assessmentRequired = 'yes';
    else assessmentRequired = 'unknown';
    return { category: c.category, byBasis, conditionA, conditionB, conditionC, assessmentRequired };
  });
  return {
    computed: true,
    categories,
    thresholdMetIn: categories.filter((c) => c.conditionA === 'met').map((c) => c.category),
    remedyPeriodEnds,
  };
}
