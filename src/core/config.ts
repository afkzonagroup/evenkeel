// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Configuration: column mapping and every choice that Directive (EU)
 * 2023/970 leaves to Member States or to the employer.
 *
 * Choices the directive leaves open have no default. They must be written
 * in the configuration, and every report repeats them. Technical settings
 * (delimiter, limits, rounding digits) have defaults.
 *
 * @packageDocumentation
 */

import {
  CSV_HARD_LIMITS,
  DEFAULT_CSV_LIMITS,
  type CsvDelimiter,
  type CsvEncoding,
  type CsvLimits,
} from './csv.js';
import { hasUnsafeText, quoteExcerpt } from './dataset.js';
import type { DecimalSeparator, ThousandsSeparator } from './decimal.js';

/** The two pay level bases of Article 3(1)(b): gross annual and gross hourly pay. */
export type PayBasis = 'annual' | 'hourly';

/**
 * How annual pay is expressed.
 * - `actual`: the gross pay actually received in the reference year.
 * - `full-time-equivalent`: actual pay divided by the worker's full-time
 *   equivalent (FTE) fraction, so part-time and part-year pay is scaled to a
 *   full year of full-time work.
 */
export type AnnualPayMethod = 'actual' | 'full-time-equivalent';

/**
 * Workers whose recorded gender is neither female nor male (recital 6).
 * - `reject`: treat such rows as errors.
 * - `exclude`: leave them out of every indicator (they still count for the
 *   Article 7 information request of that worker).
 * - `include-in-totals`: include them when forming quartile pay bands, so
 *   band sizes and the denominators of the proportions in Article 9(1)(f)
 *   count every worker. They are never reported as a separate group.
 */
export type OtherGenderPolicy = 'reject' | 'exclude' | 'include-in-totals';

/**
 * Population for the gaps in complementary or variable components
 * (Article 9(1)(b), (d) and the complementary part of (g)).
 * - `recipients`: only workers who received complementary or variable
 *   components.
 * - `all-workers`: every worker, counting zero for those who received none.
 */
export type ComplementaryGapPopulation = 'recipients' | 'all-workers';

/**
 * How workers are divided into the four quartile pay bands of Article 3(1)(f).
 * - `exact-equal-groups`: each band holds exactly one quarter of the workers.
 *   A worker or a group of workers with identical pay that straddles a band
 *   boundary is shared between the bands in proportion, keeping that group's
 *   female/male mix. Counts may be fractional.
 * - `whole-workers-ties-together`: every worker belongs to one band. Workers
 *   with identical pay stay together; the band is decided by the group's
 *   middle rank. Band sizes can differ slightly from one quarter.
 */
export type QuartileMethod = 'exact-equal-groups' | 'whole-workers-ties-together';

/** What to do when a worker id appears on more than one row. */
export type DuplicateWorkerRows = 'reject' | 'sum';

/** CSV reading settings. */
export interface CsvSettings {
  readonly delimiter: CsvDelimiter;
  readonly decimalSeparator: DecimalSeparator;
  readonly thousandsSeparator: ThousandsSeparator;
  readonly encoding: CsvEncoding;
  readonly limits: CsvLimits;
}

/** Mapping from CSV header names to fields. */
export interface ColumnMapping {
  /** Column holding a stable worker identifier (pseudonymous ids are recommended). */
  readonly workerId: string;
  /** Column holding the recorded gender code. */
  readonly gender: string;
  /** Column holding the category of workers (Article 3(1)(h)). Optional; without it (g) and Article 10 are not computed. */
  readonly category?: string;
  /** Columns summed into the ordinary basic or minimum wage or salary (Article 3(1)(a)). At least one. */
  readonly basicPay: readonly string[];
  /** Columns summed into complementary or variable components (Article 3(1)(a)). May be empty. */
  readonly complementaryPay: readonly string[];
  /** Column with the hours the pay relates to in the reference period. Required for the hourly basis. */
  readonly hours?: string;
  /** Column with the full-time equivalent fraction, greater than 0 and at most 1. Required for full-time-equivalent annual pay. */
  readonly fte?: string;
  /** Column with the reference period of each row. Rows with another period are left out and counted. */
  readonly period?: string;
}

/**
 * Gender codes as they appear in the export. Matching ignores case and
 * surrounding spaces. A value that is in none of the lists is an error, so a
 * typo can never move a worker into the wrong group.
 */
export interface GenderCodes {
  readonly female: readonly string[];
  readonly male: readonly string[];
  /** Codes for workers recorded as neither female nor male. Handled by {@link EvenkeelConfig.otherGender}. */
  readonly other: readonly string[];
}

/** The complete, validated configuration. */
export interface EvenkeelConfig {
  readonly version: 1;
  /** Free-text note, for example the export this configuration is for. */
  readonly description?: string;
  readonly csv: CsvSettings;
  readonly columns: ColumnMapping;
  readonly genderCodes: GenderCodes;
  readonly otherGender: OtherGenderPolicy;
  readonly payBases: readonly PayBasis[];
  /** Required when `payBases` contains `annual`. */
  readonly annualPay?: AnnualPayMethod;
  readonly complementaryGapPopulation: ComplementaryGapPopulation;
  readonly quartileMethod: QuartileMethod;
  /** Smallest group for which an average, median, gap or proportion is shown. Default 5. */
  readonly minimumGroupSize: number;
  readonly duplicateWorkerRows: DuplicateWorkerRows;
  /** Expected value of the period column. Required when `columns.period` is set. */
  readonly referencePeriod?: string;
  /** Digits after the decimal point in reports. Default 2. */
  readonly decimals: number;
}

/** Default smallest group size. See docs/privacy.md for the rationale. */
export const DEFAULT_MINIMUM_GROUP_SIZE = 5;

/** Result of {@link validateConfig}. */
export type ConfigResult =
  | { readonly ok: true; readonly config: EvenkeelConfig }
  | { readonly ok: false; readonly errors: readonly string[] };

const MAX_NAME = 200;
const MAX_CODES = 50;
const MAX_COLUMNS = 50;

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

class Checker {
  readonly errors: string[] = [];

  object(v: unknown, path: string, allowed: readonly string[]): Obj | undefined {
    if (!isObject(v)) {
      this.errors.push(`${path} must be an object`);
      return undefined;
    }
    for (const key of Object.keys(v)) {
      if (!allowed.includes(key)) this.errors.push(`${path}: ${quoteExcerpt(key)} is not a known setting`);
    }
    return v;
  }

  name(v: unknown, path: string): string | undefined {
    if (typeof v !== 'string' || v.trim().length === 0) {
      this.errors.push(`${path} must be a non-empty string`);
      return undefined;
    }
    if (v.length > MAX_NAME) {
      this.errors.push(`${path} must be at most ${MAX_NAME} characters`);
      return undefined;
    }
    if (hasUnsafeText(v)) {
      this.errors.push(`${path} must not contain control or bidirectional formatting characters`);
      return undefined;
    }
    return v.trim();
  }

  names(v: unknown, path: string, min: number, max: number): string[] | undefined {
    if (!Array.isArray(v)) {
      this.errors.push(`${path} must be an array of strings`);
      return undefined;
    }
    if (v.length < min || v.length > max) {
      this.errors.push(`${path} must have ${min} to ${max} entries`);
      return undefined;
    }
    const out: string[] = [];
    v.forEach((item: unknown, i) => {
      const n = this.name(item, `${path}[${i}]`);
      if (n !== undefined) out.push(n);
    });
    return out.length === v.length ? out : undefined;
  }

  oneOf<T extends string>(v: unknown, path: string, options: readonly T[], required: boolean): T | undefined {
    if (v === undefined) {
      if (required) this.errors.push(`${path} is required: choose one of ${options.map((o) => `"${o}"`).join(', ')}`);
      return undefined;
    }
    if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) {
      this.errors.push(`${path} must be one of ${options.map((o) => JSON.stringify(o)).join(', ')}`);
      return undefined;
    }
    return v as T;
  }

  integer(v: unknown, path: string, min: number, max: number, fallback: number): number {
    if (v === undefined) return fallback;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      this.errors.push(`${path} must be an integer from ${min} to ${max}`);
      return fallback;
    }
    return v;
  }
}

/**
 * Validates an untrusted configuration object (for example parsed from a
 * JSON file). Unknown keys are errors, so typos are caught.
 *
 * @example
 * const result = validateConfig(JSON.parse(text));
 * if (!result.ok) console.error(result.errors.join('\n'));
 */
export function validateConfig(input: unknown): ConfigResult {
  const c = new Checker();
  const root = c.object(input, 'config', [
    '$schema',
    'description',
    'version',
    'csv',
    'columns',
    'genderCodes',
    'otherGender',
    'payBases',
    'annualPay',
    'complementaryGapPopulation',
    'quartileMethod',
    'minimumGroupSize',
    'duplicateWorkerRows',
    'referencePeriod',
    'decimals',
  ]);
  if (root === undefined) return { ok: false, errors: c.errors };

  if (root.$schema !== undefined && typeof root.$schema !== 'string') c.errors.push('config.$schema must be a string');
  if (root.version !== 1) c.errors.push('config.version must be 1');
  let description: string | undefined;
  if (root.description !== undefined) {
    if (typeof root.description !== 'string' || root.description.length > 1000 || hasUnsafeText(root.description)) {
      c.errors.push('config.description must be a string of at most 1000 characters without control characters');
    } else description = root.description;
  }

  // CSV settings (all optional, with defaults).
  const csvIn = root.csv === undefined ? {} : c.object(root.csv, 'config.csv', ['delimiter', 'decimalSeparator', 'thousandsSeparator', 'encoding', 'maxBytes', 'maxRows']);
  const delimiter = csvIn === undefined ? undefined : c.oneOf<CsvDelimiter>(csvIn.delimiter ?? ',', 'config.csv.delimiter', [',', ';', '\t', '|'], true);
  const decimalSeparator = csvIn === undefined ? undefined : c.oneOf<DecimalSeparator>(csvIn.decimalSeparator ?? '.', 'config.csv.decimalSeparator', ['.', ','], true);
  const thousandsSeparator =
    csvIn === undefined ? undefined : c.oneOf<ThousandsSeparator>(csvIn.thousandsSeparator ?? 'none', 'config.csv.thousandsSeparator', ['none', ' ', '.', ',', "'"], true);
  const encoding = csvIn === undefined ? undefined : c.oneOf<CsvEncoding>(csvIn.encoding ?? 'utf-8', 'config.csv.encoding', ['utf-8', 'windows-1252'], true);
  const maxBytes = c.integer(csvIn?.maxBytes, 'config.csv.maxBytes', 1, CSV_HARD_LIMITS.maxBytes, DEFAULT_CSV_LIMITS.maxBytes);
  const maxRows = c.integer(csvIn?.maxRows, 'config.csv.maxRows', 1, CSV_HARD_LIMITS.maxRows, DEFAULT_CSV_LIMITS.maxRows);
  if (thousandsSeparator !== undefined && thousandsSeparator !== 'none' && thousandsSeparator === decimalSeparator) {
    c.errors.push('config.csv.thousandsSeparator must differ from config.csv.decimalSeparator');
  }
  if (thousandsSeparator !== undefined && thousandsSeparator === delimiter) {
    c.errors.push('config.csv.thousandsSeparator must differ from config.csv.delimiter');
  }

  // Columns.
  const colIn = c.object(root.columns, 'config.columns', ['workerId', 'gender', 'category', 'basicPay', 'complementaryPay', 'hours', 'fte', 'period']);
  let columns: ColumnMapping | undefined;
  if (colIn !== undefined) {
    const workerId = c.name(colIn.workerId, 'config.columns.workerId');
    const gender = c.name(colIn.gender, 'config.columns.gender');
    const category = colIn.category === undefined ? undefined : c.name(colIn.category, 'config.columns.category');
    const basicPay = c.names(colIn.basicPay, 'config.columns.basicPay', 1, MAX_COLUMNS);
    const complementaryPay = c.names(colIn.complementaryPay, 'config.columns.complementaryPay', 0, MAX_COLUMNS);
    const hours = colIn.hours === undefined ? undefined : c.name(colIn.hours, 'config.columns.hours');
    const fte = colIn.fte === undefined ? undefined : c.name(colIn.fte, 'config.columns.fte');
    const period = colIn.period === undefined ? undefined : c.name(colIn.period, 'config.columns.period');
    if (workerId !== undefined && gender !== undefined && basicPay !== undefined && complementaryPay !== undefined) {
      const used = [workerId, gender, ...(category === undefined ? [] : [category]), ...basicPay, ...complementaryPay];
      for (const optional of [hours, fte, period]) if (optional !== undefined) used.push(optional);
      const seen = new Set<string>();
      for (const u of used) {
        if (seen.has(u)) c.errors.push(`config.columns uses the column "${u}" more than once`);
        seen.add(u);
      }
      columns = {
        workerId,
        gender,
        basicPay,
        complementaryPay,
        ...(category === undefined ? {} : { category }),
        ...(hours === undefined ? {} : { hours }),
        ...(fte === undefined ? {} : { fte }),
        ...(period === undefined ? {} : { period }),
      };
    }
  }

  // Gender codes.
  const gIn = c.object(root.genderCodes, 'config.genderCodes', ['female', 'male', 'other']);
  let genderCodes: GenderCodes | undefined;
  if (gIn !== undefined) {
    const female = c.names(gIn.female, 'config.genderCodes.female', 1, MAX_CODES);
    const male = c.names(gIn.male, 'config.genderCodes.male', 1, MAX_CODES);
    const other = gIn.other === undefined ? [] : c.names(gIn.other, 'config.genderCodes.other', 0, MAX_CODES);
    if (female !== undefined && male !== undefined && other !== undefined) {
      const seen = new Map<string, string>();
      for (const [group, codes] of [['female', female], ['male', male], ['other', other]] as const) {
        for (const code of codes) {
          const key = code.toLowerCase();
          const previous = seen.get(key);
          if (previous !== undefined) c.errors.push(`config.genderCodes: "${code}" is listed under both ${previous} and ${group}`);
          seen.set(key, group);
        }
      }
      genderCodes = { female, male, other };
    }
  }

  const otherGender = c.oneOf<OtherGenderPolicy>(root.otherGender, 'config.otherGender', ['reject', 'exclude', 'include-in-totals'], true);

  // Pay bases.
  let payBases: PayBasis[] | undefined;
  if (root.payBases === undefined) {
    c.errors.push('config.payBases is required: ["annual"], ["hourly"] or ["annual", "hourly"]');
  } else if (!Array.isArray(root.payBases) || root.payBases.length < 1 || root.payBases.length > 2) {
    c.errors.push('config.payBases must be ["annual"], ["hourly"] or ["annual", "hourly"]');
  } else {
    const bases: PayBasis[] = [];
    (root.payBases as unknown[]).forEach((b, i) => {
      const v = c.oneOf<PayBasis>(b, `config.payBases[${i}]`, ['annual', 'hourly'], true);
      if (v !== undefined) {
        if (bases.includes(v)) c.errors.push(`config.payBases lists "${v}" twice`);
        else bases.push(v);
      }
    });
    payBases = (['annual', 'hourly'] as const).filter((b) => bases.includes(b));
  }
  const annualPay = c.oneOf<AnnualPayMethod>(root.annualPay, 'config.annualPay', ['actual', 'full-time-equivalent'], payBases?.includes('annual') === true);
  if (annualPay !== undefined && payBases !== undefined && !payBases.includes('annual')) {
    c.errors.push('config.annualPay is set but config.payBases does not include "annual"');
  }
  if (payBases?.includes('hourly') === true && columns !== undefined && columns.hours === undefined) {
    c.errors.push('config.columns.hours is required for the hourly pay basis');
  }
  if (annualPay === 'full-time-equivalent' && columns !== undefined && columns.fte === undefined) {
    c.errors.push('config.columns.fte is required when config.annualPay is "full-time-equivalent"');
  }

  const complementaryGapPopulation = c.oneOf<ComplementaryGapPopulation>(
    root.complementaryGapPopulation,
    'config.complementaryGapPopulation',
    ['recipients', 'all-workers'],
    true,
  );
  const quartileMethod = c.oneOf<QuartileMethod>(root.quartileMethod, 'config.quartileMethod', ['exact-equal-groups', 'whole-workers-ties-together'], true);
  const minimumGroupSize = c.integer(root.minimumGroupSize, 'config.minimumGroupSize', 1, 1000, DEFAULT_MINIMUM_GROUP_SIZE);
  const duplicateWorkerRows = c.oneOf<DuplicateWorkerRows>(root.duplicateWorkerRows ?? 'reject', 'config.duplicateWorkerRows', ['reject', 'sum'], true);
  const referencePeriod = root.referencePeriod === undefined ? undefined : c.name(root.referencePeriod, 'config.referencePeriod');
  if (columns !== undefined && (columns.period === undefined) !== (referencePeriod === undefined)) {
    c.errors.push('config.columns.period and config.referencePeriod must be set together');
  }
  const decimals = c.integer(root.decimals, 'config.decimals', 0, 6, 2);

  if (
    c.errors.length > 0 ||
    delimiter === undefined ||
    decimalSeparator === undefined ||
    thousandsSeparator === undefined ||
    encoding === undefined ||
    columns === undefined ||
    genderCodes === undefined ||
    otherGender === undefined ||
    payBases === undefined ||
    complementaryGapPopulation === undefined ||
    quartileMethod === undefined ||
    duplicateWorkerRows === undefined
  ) {
    return { ok: false, errors: c.errors.length > 0 ? c.errors : ['config is invalid'] };
  }

  return {
    ok: true,
    config: {
      version: 1,
      ...(description === undefined ? {} : { description }),
      csv: {
        delimiter,
        decimalSeparator,
        thousandsSeparator,
        encoding,
        limits: { ...DEFAULT_CSV_LIMITS, maxBytes, maxRows },
      },
      columns,
      genderCodes,
      otherGender,
      payBases,
      ...(annualPay === undefined ? {} : { annualPay }),
      complementaryGapPopulation,
      quartileMethod,
      minimumGroupSize,
      duplicateWorkerRows,
      ...(referencePeriod === undefined ? {} : { referencePeriod }),
      decimals,
    },
  };
}

/** Converts a validated configuration back to its JSON file form. */
export function configToJson(config: EvenkeelConfig): Record<string, unknown> {
  return {
    version: 1,
    ...(config.description === undefined ? {} : { description: config.description }),
    csv: {
      delimiter: config.csv.delimiter,
      decimalSeparator: config.csv.decimalSeparator,
      thousandsSeparator: config.csv.thousandsSeparator,
      encoding: config.csv.encoding,
      maxBytes: config.csv.limits.maxBytes,
      maxRows: config.csv.limits.maxRows,
    },
    columns: config.columns,
    genderCodes: config.genderCodes,
    otherGender: config.otherGender,
    payBases: config.payBases,
    ...(config.annualPay === undefined ? {} : { annualPay: config.annualPay }),
    complementaryGapPopulation: config.complementaryGapPopulation,
    quartileMethod: config.quartileMethod,
    minimumGroupSize: config.minimumGroupSize,
    duplicateWorkerRows: config.duplicateWorkerRows,
    ...(config.referencePeriod === undefined ? {} : { referencePeriod: config.referencePeriod }),
    decimals: config.decimals,
  };
}
