// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Maps CSV rows to typed worker records and validates them row by row.
 *
 * A dataset with any row error is rejected as a whole: computing indicators
 * on the remaining rows would silently produce wrong figures.
 *
 * @packageDocumentation
 */

import type { EvenkeelConfig } from './config.js';
import type { CsvTable } from './csv.js';
import { SCALE, parseDecimal, type Fixed } from './decimal.js';

/** Recorded gender after mapping the configured codes. */
export type Gender = 'female' | 'male' | 'other';

/** One worker for the reference period. Amounts are gross. */
export interface WorkerRecord {
  readonly id: string;
  readonly gender: Gender;
  /** Category of workers, or null when no category column is configured. */
  readonly category: string | null;
  /** Ordinary basic or minimum wage or salary for the period. */
  readonly basic: Fixed;
  /** Complementary or variable components for the period. */
  readonly complementary: Fixed;
  /** Hours the pay relates to, or null when not configured. */
  readonly hours: Fixed | null;
  /** Full-time equivalent fraction, or null when not configured. */
  readonly fte: Fixed | null;
  /** CSV line numbers this worker was built from. */
  readonly lines: readonly number[];
}

/** Machine-readable reasons for a row error. */
export type IssueCode =
  | 'missing-column'
  | 'ambiguous-column'
  | 'field-count'
  | 'empty-value'
  | 'invalid-text'
  | 'unknown-gender'
  | 'other-gender-rejected'
  | 'invalid-amount'
  | 'negative-amount'
  | 'invalid-hours'
  | 'invalid-fte'
  | 'duplicate-worker'
  | 'inconsistent-duplicate'
  | 'no-workers';

/** A validation problem tied to a CSV line. */
export interface RowIssue {
  /** Physical CSV line (1-based); 0 when not tied to a line. */
  readonly line: number;
  readonly column: string | null;
  readonly code: IssueCode;
  readonly message: string;
}

/** Counts describing the input, safe to show in a report. */
export interface DatasetSummary {
  readonly dataRows: number;
  readonly rowsUsed: number;
  /** Rows left out because their period differs from the reference period. */
  readonly rowsOtherPeriod: number;
  readonly workers: number;
  readonly female: number;
  readonly male: number;
  readonly other: number;
}

/** A validated dataset. */
export interface Dataset {
  readonly workers: readonly WorkerRecord[];
  readonly summary: DatasetSummary;
}

/** Result of {@link buildDataset}. */
export type DatasetResult =
  | { readonly ok: true; readonly dataset: Dataset }
  | { readonly ok: false; readonly issues: readonly RowIssue[]; readonly moreIssues: number };

/** Maximum number of issues kept; further issues are only counted. */
export const MAX_ISSUES = 1000;

/** Maximum length of a worker id. */
export const MAX_ID_LENGTH = 100;

/** Maximum length of a category name. */
export const MAX_CATEGORY_LENGTH = 200;

/** Hours in a leap year (366 × 24): the most hours a calendar year can hold. */
export const MAX_HOURS_PER_YEAR = 8784n * SCALE;

// Control (Cc), format (Cf: zero-width, bidirectional, soft hyphen, BOM) and
// line/paragraph separator (Zl, Zp) characters.
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/**
 * Quotes a short excerpt of untrusted input for an error message: at most
 * 24 characters, with control and invisible formatting characters escaped.
 */
export function quoteExcerpt(value: string): string {
  const short = value.length > 24 ? `${value.slice(0, 24)}…` : value;
  let out = '';
  for (const ch of short) {
    out += UNSAFE_TEXT.test(ch) || ch === '"' || ch === '\\' ? `\\u{${(ch.codePointAt(0) ?? 0).toString(16)}}` : ch;
  }
  return `"${out}"`;
}

/** True when `value` contains control, zero-width or bidirectional formatting characters. */
export function hasUnsafeText(value: string): boolean {
  return UNSAFE_TEXT.test(value);
}

interface MutableWorker {
  id: string;
  gender: Gender;
  category: string | null;
  basic: Fixed;
  complementary: Fixed;
  hours: Fixed | null;
  fte: Fixed | null;
  lines: number[];
}

/**
 * Validates CSV rows against the configuration and builds worker records.
 *
 * @example
 * const csv = parseCsv(text, config.csv.delimiter, config.csv.limits);
 * if (csv.ok) {
 *   const result = buildDataset(csv.value, config);
 *   if (!result.ok) for (const issue of result.issues) console.error(`line ${issue.line}: ${issue.message}`);
 * }
 */
export function buildDataset(table: CsvTable, config: EvenkeelConfig): DatasetResult {
  const issues: RowIssue[] = [];
  let moreIssues = 0;
  const report = (issue: RowIssue): void => {
    if (issues.length < MAX_ISSUES) issues.push(issue);
    else moreIssues++;
  };

  // Resolve columns.
  const header = table.header.map((h) => h.trim());
  const index = new Map<string, number>();
  const duplicateNames = new Set<string>();
  header.forEach((name, i) => {
    if (index.has(name)) duplicateNames.add(name);
    else index.set(name, i);
  });
  const cols = config.columns;
  const wanted = [cols.workerId, cols.gender, ...cols.basicPay, ...cols.complementaryPay];
  for (const optional of [cols.category, cols.hours, cols.fte, cols.period]) if (optional !== undefined) wanted.push(optional);
  for (const name of wanted) {
    if (!index.has(name)) {
      report({ line: table.headerLine, column: name, code: 'missing-column', message: `The header has no column named ${quoteExcerpt(name)}.` });
    } else if (duplicateNames.has(name)) {
      report({ line: table.headerLine, column: name, code: 'ambiguous-column', message: `The header has more than one column named ${quoteExcerpt(name)}.` });
    }
  }
  if (issues.length > 0) return { ok: false, issues, moreIssues };
  const col = (name: string): number => index.get(name) ?? -1;

  const numberFormat = { decimalSeparator: config.csv.decimalSeparator, thousandsSeparator: config.csv.thousandsSeparator } as const;
  const femaleCodes = new Set(config.genderCodes.female.map((c) => c.toLowerCase()));
  const maleCodes = new Set(config.genderCodes.male.map((c) => c.toLowerCase()));
  const otherCodes = new Set(config.genderCodes.other.map((c) => c.toLowerCase()));
  const needHours = config.payBases.includes('hourly');
  const byId = new Map<string, MutableWorker>();
  let rowsOtherPeriod = 0;
  let rowsUsed = 0;

  for (const row of table.rows) {
    const line = row.line;
    if (row.fields.length !== header.length) {
      report({ line, column: null, code: 'field-count', message: `The row has ${row.fields.length} fields; the header has ${header.length}.` });
      continue;
    }
    const field = (name: string): string => (row.fields[col(name)] ?? '').trim();
    const issuesBefore = issues.length + moreIssues;
    const rowIssue = (column: string, code: IssueCode, message: string): void => {
      report({ line, column, code, message });
    };

    if (cols.period !== undefined && field(cols.period) !== config.referencePeriod) {
      rowsOtherPeriod++;
      continue;
    }

    const id = field(cols.workerId);
    if (id.length === 0) rowIssue(cols.workerId, 'empty-value', 'The worker id is empty.');
    else if (id.length > MAX_ID_LENGTH || hasUnsafeText(id)) {
      rowIssue(cols.workerId, 'invalid-text', `The worker id must be at most ${MAX_ID_LENGTH} characters without control or invisible formatting characters.`);
    }

    const genderRaw = field(cols.gender);
    let gender: Gender | undefined;
    const key = genderRaw.toLowerCase();
    if (genderRaw.length === 0) rowIssue(cols.gender, 'empty-value', 'The gender is empty.');
    else if (femaleCodes.has(key)) gender = 'female';
    else if (maleCodes.has(key)) gender = 'male';
    else if (otherCodes.has(key)) {
      if (config.otherGender === 'reject') {
        rowIssue(cols.gender, 'other-gender-rejected', 'The gender is neither female nor male and config.otherGender is "reject".');
      } else gender = 'other';
    } else {
      rowIssue(cols.gender, 'unknown-gender', `The gender code ${quoteExcerpt(genderRaw)} is not listed in config.genderCodes.`);
    }

    let category: string | null = null;
    if (cols.category !== undefined) {
      const value = field(cols.category);
      if (value.length === 0) rowIssue(cols.category, 'empty-value', 'The category is empty.');
      else if (value.length > MAX_CATEGORY_LENGTH || hasUnsafeText(value)) {
        rowIssue(cols.category, 'invalid-text', `The category must be at most ${MAX_CATEGORY_LENGTH} characters without control or invisible formatting characters.`);
      } else category = value;
    }

    const amount = (name: string, emptyIsZero: boolean): Fixed | undefined => {
      const raw = field(name);
      if (raw.length === 0) {
        if (emptyIsZero) return 0n;
        rowIssue(name, 'empty-value', 'The amount is empty.');
        return undefined;
      }
      const parsed = parseDecimal(raw, numberFormat);
      if (!parsed.ok) {
        rowIssue(name, 'invalid-amount', `The amount is not a valid number: ${parsed.reason}.`);
        return undefined;
      }
      if (parsed.value < 0n) {
        rowIssue(name, 'negative-amount', 'Negative amounts are not accepted. Net corrections into the period total first.');
        return undefined;
      }
      return parsed.value;
    };

    let basic: Fixed = 0n;
    for (const name of cols.basicPay) {
      const v = amount(name, false);
      if (v !== undefined) basic += v;
    }
    let complementary: Fixed = 0n;
    for (const name of cols.complementaryPay) {
      const v = amount(name, true);
      if (v !== undefined) complementary += v;
    }

    let hours: Fixed | null = null;
    if (cols.hours !== undefined) {
      const raw = field(cols.hours);
      const parsed = raw.length === 0 ? undefined : parseDecimal(raw, numberFormat);
      if (parsed === undefined) {
        if (needHours) rowIssue(cols.hours, 'invalid-hours', 'Hours are required for the hourly pay basis.');
      } else if (!parsed.ok) {
        rowIssue(cols.hours, 'invalid-hours', `Hours are not a valid number: ${parsed.reason}.`);
      } else if (parsed.value < 0n || parsed.value > MAX_HOURS_PER_YEAR) {
        rowIssue(cols.hours, 'invalid-hours', 'Hours must be from 0 to 8784 (the hours in a leap year).');
      } else if (needHours && parsed.value === 0n) {
        rowIssue(cols.hours, 'invalid-hours', 'Hours must be greater than 0 for the hourly pay basis.');
      } else hours = parsed.value;
    }

    let fte: Fixed | null = null;
    if (cols.fte !== undefined) {
      const raw = field(cols.fte);
      const parsed = parseDecimal(raw, numberFormat);
      if (!parsed.ok) rowIssue(cols.fte, 'invalid-fte', `The full-time equivalent is not a valid number: ${parsed.reason}.`);
      else if (parsed.value <= 0n || parsed.value > SCALE) {
        rowIssue(cols.fte, 'invalid-fte', 'The full-time equivalent must be greater than 0 and at most 1.');
      } else fte = parsed.value;
    }

    if (issues.length + moreIssues !== issuesBefore || gender === undefined) continue;
    rowsUsed++;

    const existing = byId.get(id);
    if (existing === undefined) {
      byId.set(id, { id, gender, category, basic, complementary, hours, fte, lines: [line] });
      continue;
    }
    if (config.duplicateWorkerRows === 'reject') {
      report({
        line,
        column: cols.workerId,
        code: 'duplicate-worker',
        message: `The worker id also appears on line ${existing.lines[0] ?? 0}. Set config.duplicateWorkerRows to "sum" to add up several rows per worker.`,
      });
      continue;
    }
    if (existing.gender !== gender || existing.category !== category || existing.fte !== fte) {
      report({
        line,
        column: cols.workerId,
        code: 'inconsistent-duplicate',
        message: `Rows for this worker id (first on line ${existing.lines[0] ?? 0}) differ in gender, category or full-time equivalent.`,
      });
      continue;
    }
    existing.basic += basic;
    existing.complementary += complementary;
    if (existing.hours !== null && hours !== null) existing.hours += hours;
    existing.lines.push(line);
    if (existing.hours !== null && existing.hours > MAX_HOURS_PER_YEAR) {
      report({ line, column: cols.hours ?? null, code: 'invalid-hours', message: 'The summed hours for this worker exceed 8784.' });
    }
  }

  if (issues.length === 0 && byId.size === 0) {
    report({ line: 0, column: null, code: 'no-workers', message: 'No worker rows were found for the reference period.' });
  }
  if (issues.length > 0) return { ok: false, issues, moreIssues };

  const workers = [...byId.values()];
  return {
    ok: true,
    dataset: {
      workers,
      summary: {
        dataRows: table.rows.length,
        rowsUsed,
        rowsOtherPeriod,
        workers: workers.length,
        female: workers.filter((w) => w.gender === 'female').length,
        male: workers.filter((w) => w.gender === 'male').length,
        other: workers.filter((w) => w.gender === 'other').length,
      },
    },
  };
}
