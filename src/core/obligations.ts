// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Who reports, and when: Article 9(2)–(5) of Directive (EU) 2023/970.
 *
 * - 250 or more workers: by 7 June 2027 and every year thereafter (9(2)).
 * - 150 to 249 workers: by 7 June 2027 and every three years thereafter (9(3)).
 * - 100 to 149 workers: by 7 June 2031 and every three years thereafter (9(4)).
 * - Fewer than 100: may report voluntarily; Member States may require it (9(5)).
 *
 * Each report relates to the previous calendar year. How workers are counted
 * (headcount, reference date) is for national law; pass the number your
 * national rules produce. Member States may also set stricter rules.
 *
 * @packageDocumentation
 */

import { articleUrl } from './legal.js';

/** Size band from Article 9(2)–(5). */
export type EmployerSizeBand = '250-or-more' | '150-to-249' | '100-to-149' | 'fewer-than-100';

/** Result of {@link reportingObligation}. */
export interface ReportingObligation {
  readonly sizeBand: EmployerSizeBand;
  /** The paragraph of Article 9 that applies. */
  readonly legalBasis: string;
  readonly legalBasisUrl: string;
  /** Reporting frequency in years under the directive, or null when voluntary. */
  readonly frequencyYears: 1 | 3 | null;
  /** First reporting year under the directive, or null when voluntary. */
  readonly firstReportingYear: number | null;
  /** Whether a report is due in `year` under the directive. */
  readonly reportDueInYear: boolean;
  /** Deadline in `year` (YYYY-MM-DD) when a report is due, otherwise null. */
  readonly deadline: string | null;
  /** The calendar year the report covers ("the previous calendar year"). */
  readonly referenceYear: number;
  /** Whether the employer is subject to Article 9 reporting (and so to Article 10). */
  readonly subjectToReporting: boolean;
  readonly note: string;
}

/**
 * Determines the Article 9 reporting obligation for an employer of a given
 * size in a given calendar year.
 *
 * @example
 * reportingObligation(180, 2030).reportDueInYear // true (2027, 2030, 2033, …)
 */
export function reportingObligation(workers: number, year: number): ReportingObligation {
  if (!Number.isSafeInteger(workers) || workers < 0) throw new RangeError('workers must be a non-negative integer');
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new RangeError('year must be an integer from 2000 to 2200');
  const note =
    'Based on Article 9 of the directive. National law sets how workers are counted and may require more frequent reporting or reporting by smaller employers.';
  const due = (first: number, every: 1 | 3): boolean => year >= first && (year - first) % every === 0;
  const build = (sizeBand: EmployerSizeBand, paragraph: number, first: number | null, every: 1 | 3 | null): ReportingObligation => {
    const reportDueInYear = first !== null && every !== null && due(first, every);
    return {
      sizeBand,
      legalBasis: `Article 9(${paragraph})`,
      legalBasisUrl: articleUrl(9),
      frequencyYears: every,
      firstReportingYear: first,
      reportDueInYear,
      deadline: reportDueInYear ? `${year}-06-07` : null,
      referenceYear: year - 1,
      subjectToReporting: first !== null,
      note,
    };
  };
  if (workers >= 250) return build('250-or-more', 2, 2027, 1);
  if (workers >= 150) return build('150-to-249', 3, 2027, 3);
  if (workers >= 100) return build('100-to-149', 4, 2031, 3);
  return build('fewer-than-100', 5, null, null);
}
