// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Answer to a worker's information request: Article 7 of Directive (EU)
 * 2023/970.
 *
 * Article 7(1): workers have the right to request and receive in writing
 * information on their individual pay level and the average pay levels,
 * broken down by sex, for categories of workers performing the same work as
 * them or work of equal value. Article 7(4): within a reasonable period, at
 * the latest two months from the date of the request.
 *
 * Averages for groups below the minimum group size are withheld with the
 * same rules as the reports. Article 12(3) lets Member States decide that,
 * where information would disclose the pay of an identifiable worker, only
 * workers' representatives, the labour inspectorate or the equality body
 * get access; national law decides how such requests are routed.
 *
 * @packageDocumentation
 */

import type { AnnualPayMethod, PayBasis } from './config.js';
import type { Dataset } from './dataset.js';
import { addMonths, formatIsoDate, parseIsoDate } from './dates.js';
import { formatFixed } from './decimal.js';
import { payLevels, type Figure, type Indicators } from './indicators.js';

/** Data for an Article 7 answer. */
export interface InformationResponse {
  readonly workerId: string;
  readonly category: string;
  readonly byBasis: readonly {
    readonly basis: PayBasis;
    /** The worker's own pay level on this basis. */
    readonly individualPayLevel: string;
    /** Average pay level of female workers in the worker's category. */
    readonly femaleAverage: Figure;
    /** Average pay level of male workers in the worker's category. */
    readonly maleAverage: Figure;
  }[];
  readonly requestDate: string | null;
  /** Latest answer date under Article 7(4): two months from the request (indicative). */
  readonly answerDueBy: string | null;
}

/** Options for {@link informationRequestResponse}. */
export interface InformationRequestOptions {
  readonly payBases: readonly PayBasis[];
  readonly annualPay?: AnnualPayMethod;
  readonly decimals: number;
  /** Date the request was made (YYYY-MM-DD). */
  readonly requestDate?: string;
}

/**
 * Builds the Article 7 answer for one worker. `indicators` must be computed
 * from the same dataset with small-group protection on.
 *
 * @throws RangeError when the worker is not in the dataset, no category column
 * is configured, or the request date is invalid.
 */
export function informationRequestResponse(
  dataset: Dataset,
  indicators: Indicators,
  workerId: string,
  options: InformationRequestOptions,
): InformationResponse {
  const worker = dataset.workers.find((w) => w.id === workerId);
  if (worker === undefined) throw new RangeError('No worker with this id is in the dataset.');
  if (worker.category === null) {
    throw new RangeError('Article 7 answers need categories of workers: configure columns.category.');
  }
  let answerDueBy: string | null = null;
  if (options.requestDate !== undefined) {
    const date = parseIsoDate(options.requestDate);
    if (date === null) throw new RangeError('requestDate must be a valid date in the form YYYY-MM-DD');
    answerDueBy = formatIsoDate(addMonths(date, 2));
  }
  const byBasis = options.payBases.map((basis) => {
    const level = payLevels(worker, basis, options.annualPay);
    const basisIndicators = indicators.bases.find((b) => b.basis === basis);
    const category = basisIndicators?.categories?.find((c) => c.category === worker.category);
    const missing: Figure = { status: 'not-applicable', reason: 'no-workers' };
    return {
      basis,
      individualPayLevel: formatFixed(level.total, options.decimals),
      femaleAverage: category?.female.totalAverage ?? missing,
      maleAverage: category?.male.totalAverage ?? missing,
    };
  });
  return {
    workerId: worker.id,
    category: worker.category,
    byBasis,
    requestDate: options.requestDate ?? null,
    answerDueBy,
  };
}
