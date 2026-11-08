// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import type { Dataset, Gender, WorkerRecord } from '../src/core/dataset.js';
import { parseDecimal, type Fixed } from '../src/core/decimal.js';
import type { CalculationSettings } from '../src/core/indicators.js';
import { validateConfig, type EvenkeelConfig } from '../src/core/config.js';

/** Parses a decimal with "." as separator, failing the test on invalid input. */
export function fx(text: string): Fixed {
  const r = parseDecimal(text, { decimalSeparator: '.', thousandsSeparator: 'none' });
  if (!r.ok) throw new Error(`bad decimal in test: ${text}`);
  return r.value;
}

let counter = 0;

/** Builds a worker record. */
export function w(
  gender: Gender,
  basic: string,
  complementary = '0',
  opts: { category?: string; hours?: string; fte?: string; id?: string } = {},
): WorkerRecord {
  counter++;
  return {
    id: opts.id ?? `w${counter}`,
    gender,
    category: opts.category ?? null,
    basic: fx(basic),
    complementary: fx(complementary),
    hours: opts.hours === undefined ? null : fx(opts.hours),
    fte: opts.fte === undefined ? null : fx(opts.fte),
    lines: [counter],
  };
}

/** Wraps workers in a dataset. */
export function ds(workers: readonly WorkerRecord[]): Dataset {
  return {
    workers,
    summary: {
      dataRows: workers.length,
      rowsUsed: workers.length,
      rowsOtherPeriod: 0,
      workers: workers.length,
      female: workers.filter((x) => x.gender === 'female').length,
      male: workers.filter((x) => x.gender === 'male').length,
      other: workers.filter((x) => x.gender === 'other').length,
    },
  };
}

/** Settings with small-group protection off, annual actual pay, all-workers population. */
export const BASE: CalculationSettings = {
  payBases: ['annual'],
  annualPay: 'actual',
  complementaryGapPopulation: 'all-workers',
  quartileMethod: 'exact-equal-groups',
  minimumGroupSize: 5,
  otherGender: 'exclude',
  decimals: 2,
  suppressSmallGroups: false,
};

/** A valid configuration object (JSON form) for tests. */
export function rawConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    columns: {
      workerId: 'id',
      gender: 'gender',
      category: 'category',
      basicPay: ['basic'],
      complementaryPay: ['bonus'],
      hours: 'hours',
    },
    genderCodes: { female: ['F'], male: ['M'], other: ['X'] },
    otherGender: 'exclude',
    payBases: ['annual', 'hourly'],
    annualPay: 'actual',
    complementaryGapPopulation: 'all-workers',
    quartileMethod: 'exact-equal-groups',
    ...overrides,
  };
}

/** A validated configuration for tests. */
export function config(overrides: Record<string, unknown> = {}): EvenkeelConfig {
  const r = validateConfig(rawConfig(overrides));
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.config;
}

/** Value of an ok figure, failing otherwise. */
export function val(f: { status: string; value?: string }): string {
  if (f.status !== 'ok' || f.value === undefined) throw new Error(`figure is ${JSON.stringify(f)}`);
  return f.value;
}
