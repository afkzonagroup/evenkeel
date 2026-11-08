// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * CSV renderer: one row per figure (long format), for spreadsheets and
 * further processing. Every cell passes through {@link csvCell}, which
 * neutralises spreadsheet formulas.
 *
 * Columns: section, basis, category, group, measure, value, status, reason.
 *
 * @packageDocumentation
 */

import type { Figure } from '../core/indicators.js';
import { csvRow } from './escape.js';
import type { ReportV1 } from './model.js';

/** Header row of the CSV output. */
export const CSV_COLUMNS = ['section', 'basis', 'category', 'group', 'measure', 'value', 'status', 'reason'] as const;

function figureCells(f: Figure): [string, string, string] {
  return f.status === 'ok' ? [f.value, 'ok', ''] : ['', f.status, f.reason];
}

/** Renders a report as CSV (RFC 4180, CRLF line endings). */
export function renderCsv(report: ReportV1): string {
  const rows: string[] = [csvRow([...CSV_COLUMNS])];
  const add = (section: string, basis: string, category: string, group: string, measure: string, f: Figure): void => {
    rows.push(csvRow([section, basis, category, group, measure, ...figureCells(f)]));
  };
  const meta = (measure: string, value: string): void => {
    rows.push(csvRow(['meta', '', '', '', measure, value, 'ok', '']));
  };
  meta('generator', `${report.generator.attribution} ${report.generator.version}`);
  meta('generator-url', report.generator.url);
  meta('schema-version', report.schemaVersion);
  meta('generated-at', report.generatedAt);
  meta('reference-period', report.referencePeriod ?? '');
  meta('employer', report.employer ?? '');
  meta('currency', report.currency ?? '');
  meta('minimum-group-size', String(report.smallGroupProtection.minimumGroupSize));
  meta('small-group-protection', report.smallGroupProtection.enabled ? 'on' : 'off');
  for (const c of report.choices) meta(`choice:${c.setting}`, c.value);

  const e = report.indicators.proportionReceivingComplementary;
  add('9(1)(e)', '', '', 'female', 'proportion-receiving-complementary-percent', e.female.proportion);
  add('9(1)(e)', '', '', 'male', 'proportion-receiving-complementary-percent', e.male.proportion);

  for (const b of report.indicators.bases) {
    const gap = (section: string, name: string, g: { female: { average: Figure }; male: { average: Figure }; gap: Figure }): void => {
      add(section, b.basis, '', 'female', `${name}-average`, g.female.average);
      add(section, b.basis, '', 'male', `${name}-average`, g.male.average);
      add(section, b.basis, '', '', `${name}-gap-percent`, g.gap);
    };
    const medianGap = (section: string, name: string, g: { female: { median: Figure }; male: { median: Figure }; gap: Figure }): void => {
      add(section, b.basis, '', 'female', `${name}-median`, g.female.median);
      add(section, b.basis, '', 'male', `${name}-median`, g.male.median);
      add(section, b.basis, '', '', `${name}-median-gap-percent`, g.gap);
    };
    gap('9(1)(a)', 'pay', b.genderPayGap);
    gap('9(1)(b)', 'complementary', b.complementaryPayGap);
    medianGap('9(1)(c)', 'pay', b.medianGenderPayGap);
    medianGap('9(1)(d)', 'complementary', b.medianComplementaryPayGap);
    for (const q of b.quartilePayBands) {
      rows.push(csvRow(['9(1)(f)', b.basis, '', '', `band-${q.band}-workers`, q.workers, 'ok', '']));
      add('9(1)(f)', b.basis, '', 'female', `band-${q.band}-percent`, q.female);
      add('9(1)(f)', b.basis, '', 'male', `band-${q.band}-percent`, q.male);
    }
    for (const c of b.categories ?? []) {
      for (const sex of ['female', 'male'] as const) {
        rows.push(csvRow(['9(1)(g)', b.basis, c.category, sex, 'workers', String(c[sex].workers), 'ok', '']));
        add('9(1)(g)', b.basis, c.category, sex, 'basic-average', c[sex].basicAverage);
        add('9(1)(g)', b.basis, c.category, sex, 'complementary-average', c[sex].complementaryAverage);
        add('9(1)(g)', b.basis, c.category, sex, 'total-average', c[sex].totalAverage);
      }
      add('9(1)(g)', b.basis, c.category, '', 'basic-gap-percent', c.basicPayGap);
      add('9(1)(g)', b.basis, c.category, '', 'complementary-gap-percent', c.complementaryPayGap);
      add('9(1)(g)', b.basis, c.category, '', 'total-gap-percent', c.totalPayGap);
      rows.push(csvRow(['10(1)(a)', b.basis, c.category, '', 'threshold-5-percent', c.jointAssessmentThreshold, 'ok', '']));
    }
  }
  return rows.join('');
}
