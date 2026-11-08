// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * One-call pipeline: bytes → decoded text → CSV table → validated dataset.
 * Used by the CLI and the offline app so both behave the same.
 *
 * @packageDocumentation
 */

import type { EvenkeelConfig } from './core/config.js';
import { decodeCsvBytes, parseCsv, type CsvFailure } from './core/csv.js';
import { buildDataset, type Dataset, type RowIssue } from './core/dataset.js';

/** Result of {@link loadDataset}. */
export type LoadResult =
  | { readonly ok: true; readonly dataset: Dataset }
  | { readonly ok: false; readonly csvError: CsvFailure }
  | { readonly ok: false; readonly issues: readonly RowIssue[]; readonly moreIssues: number };

/**
 * Decodes, parses and validates a payroll export.
 *
 * @example
 * const result = loadDataset(await readFile('payroll.csv'), config);
 * if (result.ok) console.log(result.dataset.summary.workers);
 */
export function loadDataset(bytes: Uint8Array, config: EvenkeelConfig): LoadResult {
  const text = decodeCsvBytes(bytes, config.csv.encoding, config.csv.limits.maxBytes);
  if (!text.ok) return { ok: false, csvError: text.error };
  const table = parseCsv(text.value, config.csv.delimiter, config.csv.limits);
  if (!table.ok) return { ok: false, csvError: table.error };
  const dataset = buildDataset(table.value, config);
  if (!dataset.ok) return { ok: false, issues: dataset.issues, moreIssues: dataset.moreIssues };
  return { ok: true, dataset: dataset.dataset };
}

/** Formats a load failure as plain-text lines (no input values beyond short, escaped excerpts). */
export function describeLoadFailure(result: Exclude<LoadResult, { ok: true }>): string[] {
  if ('csvError' in result) {
    const where = result.csvError.line === null ? '' : `Line ${result.csvError.line}: `;
    return [`${where}${result.csvError.message}`];
  }
  const lines = result.issues.map((i) => `${i.line > 0 ? `Line ${i.line}` : 'Input'}${i.column === null ? '' : ` (column ${JSON.stringify(i.column)})`}: ${i.message}`);
  if (result.moreIssues > 0) lines.push(`… and ${result.moreIssues} more problems.`);
  return lines;
}
