// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The report object (JSON schema version 1). Every output format is
 * rendered from it. It holds aggregated figures only: no worker ids and no
 * individual pay.
 *
 * @packageDocumentation
 */

import type { EvenkeelConfig } from '../core/config.js';
import { hasUnsafeText, type Dataset } from '../core/dataset.js';
import { computeIndicators, type Indicators } from '../core/indicators.js';
import { assessJointPayAssessment, type CategoryEmployerStatus, type JointAssessmentResult } from '../core/joint-assessment.js';
import { ATTRIBUTION, DIRECTIVE, NOT_LEGAL_ADVICE, PROJECT_URL, articleUrl, recitalUrl } from '../core/legal.js';
import { VERSION } from '../version.js';

/** Version of the JSON report format. Increases on breaking changes. */
export const REPORT_SCHEMA_VERSION = '1.0.0';

/** Identifier of the JSON Schema that describes {@link ReportV1}. */
export const REPORT_SCHEMA_ID = 'https://github.com/afkzonagroup/evenkeel/blob/main/schema/report-v1.schema.json';

/** One configuration choice repeated in the report. */
export interface ReportChoice {
  readonly setting: string;
  readonly value: string;
  readonly explanation: string;
  readonly legalBasis: string;
  readonly legalBasisUrl: string;
}

/** The complete report. */
export interface ReportV1 {
  readonly $schema: string;
  readonly schemaVersion: string;
  readonly generator: { readonly name: 'Evenkeel'; readonly version: string; readonly attribution: string; readonly url: string };
  readonly generatedAt: string;
  readonly legalBasis: { readonly act: string; readonly celex: string; readonly url: string };
  readonly employer: string | null;
  readonly referencePeriod: string | null;
  readonly currency: string | null;
  readonly smallGroupProtection: { readonly enabled: boolean; readonly minimumGroupSize: number };
  readonly choices: readonly ReportChoice[];
  /**
   * Counts of the input. When fewer than the minimum group size of workers
   * are recorded as neither female nor male, `other` is null, and so are
   * `dataRows`, `rowsUsed` and `workers`, from which it could be worked out.
   */
  readonly data: {
    readonly dataRows: number | null;
    readonly rowsUsed: number | null;
    readonly rowsOtherPeriod: number;
    readonly workers: number | null;
    readonly female: number;
    readonly male: number;
    /** Workers recorded as neither female nor male; null when withheld because fewer than the minimum group size. */
    readonly other: number | null;
  };
  readonly indicators: Indicators;
  readonly jointPayAssessment: JointAssessmentResult;
  readonly notes: readonly string[];
  readonly notLegalAdvice: string;
}

/** Options for {@link buildReport}. */
export interface ReportOptions {
  /** Timestamp to record, ISO 8601. Pass it explicitly for reproducible output. */
  readonly generatedAt: string;
  readonly employer?: string;
  /** ISO 4217 code used to label amounts. */
  readonly currency?: string;
  /** Default true. False turns small-group protection off: internal use only. */
  readonly suppressSmallGroups?: boolean;
  /** Submission date of the pay reporting (YYYY-MM-DD), for the indicative Article 10(1)(c) date. */
  readonly submissionDate?: string;
  /** Employer facts for Article 10(1)(b) and (c), by category. */
  readonly categoryStatus?: ReadonlyMap<string, CategoryEmployerStatus>;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

/** Lists every configuration choice with its explanation and legal basis. */
export function describeChoices(config: EvenkeelConfig): ReportChoice[] {
  const a3 = articleUrl(3);
  const choices: ReportChoice[] = [
    {
      setting: 'payBases',
      value: config.payBases.join(', '),
      explanation:
        'Pay level means gross annual pay and the corresponding gross hourly pay. Indicators are computed on each basis listed.',
      legalBasis: 'Article 3(1)(b); recital 22',
      legalBasisUrl: a3,
    },
  ];
  if (config.annualPay !== undefined) {
    choices.push({
      setting: 'annualPay',
      value: config.annualPay,
      explanation:
        config.annualPay === 'actual'
          ? 'Annual pay is the gross pay actually received in the reference period, without scaling for part-time or part-year work.'
          : 'Annual pay is divided by each worker’s full-time equivalent, so part-time and part-year pay is scaled to full-time, full-year pay.',
      legalBasis: 'Article 3(1)(b); recital 22 (left open)',
      legalBasisUrl: recitalUrl(22),
    });
  }
  if (config.payBases.includes('hourly')) {
    choices.push({
      setting: 'columns.hours',
      value: config.columns.hours ?? '',
      explanation: 'Hourly pay is pay divided by the hours in this column. The employer decides which hours (for example paid hours) the export holds.',
      legalBasis: 'Article 3(1)(b)',
      legalBasisUrl: a3,
    });
  }
  choices.push(
    {
      setting: 'columns.basicPay',
      value: config.columns.basicPay.join(', '),
      explanation: 'Columns summed into the ordinary basic or minimum wage or salary.',
      legalBasis: 'Article 3(1)(a)',
      legalBasisUrl: a3,
    },
    {
      setting: 'columns.complementaryPay',
      value: config.columns.complementaryPay.length > 0 ? config.columns.complementaryPay.join(', ') : '(none)',
      explanation:
        'Columns summed into complementary or variable components: any consideration in cash or in kind beyond basic pay (recital 21 gives examples such as bonuses, overtime, allowances and occupational pensions). Empty cells count as zero.',
      legalBasis: 'Article 3(1)(a); recital 21',
      legalBasisUrl: recitalUrl(21),
    },
    {
      setting: 'columns.category',
      value: config.columns.category ?? '(not configured)',
      explanation:
        'Categories of workers are defined by the employer, where applicable with workers’ representatives, on objective, gender-neutral criteria. This tool uses the column as given and does not check how categories were formed.',
      legalBasis: 'Article 3(1)(h); Article 4(4)',
      legalBasisUrl: a3,
    },
    {
      setting: 'otherGender',
      value: config.otherGender,
      explanation:
        config.otherGender === 'reject'
          ? 'Rows with a gender other than female or male are errors.'
          : config.otherGender === 'exclude'
            ? 'Workers recorded as neither female nor male are left out of all indicators. They are never shown as a separate group.'
            : 'Workers recorded as neither female nor male count in the quartile pay bands (so band sizes and proportions cover all workers) and are left out of female/male averages and medians; fewer than the minimum group size are left out of the bands to protect them. They are never shown as a separate group.',
      legalBasis: 'Article 9(1); recital 6',
      legalBasisUrl: recitalUrl(6),
    },
    {
      setting: 'complementaryGapPopulation',
      value: config.complementaryGapPopulation,
      explanation:
        config.complementaryGapPopulation === 'recipients'
          ? 'Gaps in complementary or variable components compare only workers who received such components.'
          : 'Gaps in complementary or variable components compare all workers, counting zero for workers who received none.',
      legalBasis: 'Article 9(1)(b), (d) and (g) (left open)',
      legalBasisUrl: articleUrl(9),
    },
    {
      setting: 'quartileMethod',
      value: config.quartileMethod,
      explanation:
        config.quartileMethod === 'exact-equal-groups'
          ? 'Each quartile pay band holds exactly one quarter of the workers. Workers with identical pay at a boundary are shared between bands in proportion, keeping their female/male mix; counts can be fractional.'
          : 'Each worker is in one band. Workers with identical pay stay together, placed by the middle rank of their group; band sizes can differ slightly.',
      legalBasis: 'Article 3(1)(f); Article 9(1)(f) (left open)',
      legalBasisUrl: a3,
    },
    {
      setting: 'minimumGroupSize',
      value: String(config.minimumGroupSize),
      explanation:
        'Averages, medians, gaps and proportions for groups smaller than this are withheld, and further figures are withheld where a withheld figure could otherwise be derived by subtraction.',
      legalBasis: 'Article 12(2) and (3); recital 44',
      legalBasisUrl: articleUrl(12),
    },
    {
      setting: 'duplicateWorkerRows',
      value: config.duplicateWorkerRows,
      explanation:
        config.duplicateWorkerRows === 'reject'
          ? 'Each worker appears on one row; a repeated worker id is an error.'
          : 'Rows with the same worker id are added up (pay and hours). Gender, category and full-time equivalent must match.',
      legalBasis: 'Technical setting',
      legalBasisUrl: DIRECTIVE.url,
    },
  );
  return choices;
}

/**
 * Builds the report from a validated dataset.
 *
 * @throws RangeError on invalid options.
 */
export function buildReport(dataset: Dataset, config: EvenkeelConfig, options: ReportOptions): ReportV1 {
  if (!ISO_TIMESTAMP.test(options.generatedAt)) throw new RangeError('generatedAt must be an ISO 8601 date or timestamp');
  if (options.currency !== undefined && !/^[A-Z]{3}$/.test(options.currency)) throw new RangeError('currency must be a three-letter ISO 4217 code');
  if (options.employer !== undefined && (options.employer.length > 200 || hasUnsafeText(options.employer))) {
    throw new RangeError('employer must be at most 200 characters without control or invisible formatting characters');
  }
  const suppress = options.suppressSmallGroups ?? true;
  const indicators = computeIndicators(dataset, { ...config, suppressSmallGroups: suppress });
  const jointPayAssessment = assessJointPayAssessment({
    indicators,
    ...(options.submissionDate === undefined ? {} : { submissionDate: options.submissionDate }),
    ...(options.categoryStatus === undefined ? {} : { status: options.categoryStatus }),
  });
  const s = dataset.summary;
  const notes: string[] = [];
  if (!suppress) {
    notes.push(
      'INTERNAL: small-group protection is off. This report can disclose the pay of identifiable workers. Do not distribute it (Article 12 of the directive and Regulation (EU) 2016/679).',
    );
  } else if (config.minimumGroupSize < 3) {
    notes.push('The minimum group size is below 3. A figure for a group of one or two workers can disclose an individual’s pay.');
  }
  if (config.payBases.length === 1) {
    notes.push(
      `Only ${config.payBases[0] === 'annual' ? 'annual' : 'hourly'} pay is shown. Article 3(1)(b) defines pay level as gross annual pay and the corresponding gross hourly pay; check whether national law requires both.`,
    );
  }
  if (s.rowsOtherPeriod > 0) notes.push(`${s.rowsOtherPeriod} rows had a different period and were left out.`);
  if (indicators.bases[0]?.categories === null) {
    notes.push('No category column is configured, so the gap by category of workers (Article 9(1)(g)) and the Article 10 test are not computed.');
  }
  if (config.columns.complementaryPay.length === 0) {
    notes.push('No complementary or variable pay columns are configured, so indicators (b), (d) and (e) reflect zero components.');
  }
  const otherHidden = suppress && s.other > 0 && s.other < config.minimumGroupSize;
  if (otherHidden && config.otherGender === 'include-in-totals') {
    notes.push(
      `Fewer than ${config.minimumGroupSize} workers are recorded as neither female nor male. To protect them, they are left out of the quartile pay bands, and the total numbers of rows and workers are withheld.`,
    );
  } else if (otherHidden) {
    notes.push(
      `Fewer than ${config.minimumGroupSize} workers are recorded as neither female nor male. To protect them, the total numbers of rows and workers are withheld.`,
    );
  }
  const withheldTest = jointPayAssessment.categories.filter((c) => c.conditionA === 'withheld').length;
  if (withheldTest > 0) {
    notes.push(
      `The Article 10(1)(a) test is withheld for ${withheldTest} ${withheldTest === 1 ? 'category' : 'categories'} to protect small groups. Article 10 applies whatever the group size: establish condition (a) for ${withheldTest === 1 ? 'it' : 'them'} from an internal report (small-group protection off) that is not distributed.`,
    );
  }
  return {
    $schema: REPORT_SCHEMA_ID,
    schemaVersion: REPORT_SCHEMA_VERSION,
    generator: { name: 'Evenkeel', version: VERSION, attribution: ATTRIBUTION.text, url: PROJECT_URL },
    generatedAt: options.generatedAt,
    legalBasis: { act: DIRECTIVE.shortTitle, celex: DIRECTIVE.celex, url: DIRECTIVE.url },
    employer: options.employer?.trim() ?? null,
    referencePeriod: config.referencePeriod ?? null,
    currency: options.currency ?? null,
    smallGroupProtection: { enabled: suppress, minimumGroupSize: config.minimumGroupSize },
    choices: describeChoices(config),
    data: {
      dataRows: otherHidden ? null : s.dataRows,
      rowsUsed: otherHidden ? null : s.rowsUsed,
      rowsOtherPeriod: s.rowsOtherPeriod,
      workers: otherHidden ? null : s.workers,
      female: s.female,
      male: s.male,
      other: otherHidden ? null : s.other,
    },
    indicators,
    jointPayAssessment,
    notes,
    notLegalAdvice: NOT_LEGAL_ADVICE,
  };
}
