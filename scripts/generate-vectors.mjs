// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

// Generates test-vectors/generated.json: larger pseudo-random datasets with
// the full expected output of the TypeScript implementation. They are a
// cross-check between implementations (TypeScript and Python), not an
// independent truth; the hand-calculated vectors are in indicators.json.
// Run after `npm run build`: node scripts/generate-vectors.mjs

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { computeIndicators, parseDecimal } from '../dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function money(rand, min, max, step) {
  const units = Math.round((min + rand() * (max - min)) / step);
  return (units * step).toFixed(step < 1 ? 2 : 0);
}

function dataset(seed, n, opts) {
  const rand = prng(seed);
  const workers = [];
  for (let i = 0; i < n; i++) {
    const r = rand();
    const gender = r < opts.other ? 'other' : r < 0.5 + opts.other / 2 ? 'female' : 'male';
    const category = opts.categories[Math.floor(rand() * opts.categories.length)] ?? null;
    const base = gender === 'male' ? 1.06 : 1;
    const basic = money(rand, 24000 * base, 70000 * base, opts.step);
    const complementary = rand() < 0.6 ? money(rand, 100, 9000, opts.step) : '0';
    const fte = ['1', '1', '1', '0.8', '0.5', '0.6'][Math.floor(rand() * 6)] ?? '1';
    const hours = (Number(fte) * 1720 - Math.floor(rand() * 40)).toFixed(rand() < 0.5 ? 0 : 2);
    workers.push({ id: `g${seed}-${i}`, gender, category, basic, complementary, hours, fte });
  }
  return workers;
}

function toRecord(w) {
  const fx = (t) => {
    const r = parseDecimal(t, { decimalSeparator: '.', thousandsSeparator: 'none' });
    if (!r.ok) throw new Error(r.reason);
    return r.value;
  };
  return {
    id: w.id,
    gender: w.gender,
    category: w.category,
    basic: fx(w.basic),
    complementary: fx(w.complementary),
    hours: w.hours === null ? null : fx(w.hours),
    fte: w.fte === null ? null : fx(w.fte),
    lines: [],
  };
}

const specs = [
  {
    name: 'generated-80-both-bases-fte-recipients',
    seed: 970,
    n: 80,
    opts: { other: 0.04, categories: ['Engineering', 'Operations', 'Sales', 'Support'], step: 0.01 },
    settings: {
      payBases: ['annual', 'hourly'],
      annualPay: 'full-time-equivalent',
      complementaryGapPopulation: 'recipients',
      quartileMethod: 'exact-equal-groups',
      minimumGroupSize: 5,
      otherGender: 'include-in-totals',
      decimals: 2,
      suppressSmallGroups: true,
    },
  },
  {
    name: 'generated-50-ties-whole-workers',
    seed: 2023,
    n: 50,
    opts: { other: 0, categories: ['A', 'B', 'C'], step: 1000 },
    settings: {
      payBases: ['annual'],
      annualPay: 'actual',
      complementaryGapPopulation: 'all-workers',
      quartileMethod: 'whole-workers-ties-together',
      minimumGroupSize: 3,
      otherGender: 'exclude',
      decimals: 2,
      suppressSmallGroups: true,
    },
  },
  {
    name: 'generated-33-hourly-three-decimals-unsuppressed',
    seed: 34,
    n: 33,
    opts: { other: 0.05, categories: [null], step: 0.01 },
    settings: {
      payBases: ['hourly'],
      complementaryGapPopulation: 'all-workers',
      quartileMethod: 'exact-equal-groups',
      minimumGroupSize: 5,
      otherGender: 'exclude',
      decimals: 3,
      suppressSmallGroups: false,
    },
  },
  {
    // Small categories and fewer than five workers coded "other" with
    // include-in-totals: exercises primary, secondary and band protection.
    name: 'generated-60-small-groups-other-in-totals',
    seed: 53,
    n: 60,
    opts: { other: 0.04, categories: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], step: 1 },
    settings: {
      payBases: ['annual', 'hourly'],
      annualPay: 'actual',
      complementaryGapPopulation: 'all-workers',
      quartileMethod: 'whole-workers-ties-together',
      minimumGroupSize: 5,
      otherGender: 'include-in-totals',
      decimals: 2,
      suppressSmallGroups: true,
    },
  },
];

const vectors = specs.map((s) => {
  const workers = dataset(s.seed, s.n, s.opts);
  const records = workers.map(toRecord);
  const summary = { dataRows: 0, rowsUsed: 0, rowsOtherPeriod: 0, workers: records.length, female: 0, male: 0, other: 0 };
  const expected = computeIndicators({ workers: records, summary }, s.settings);
  return { name: s.name, origin: 'generated-by-typescript', settings: s.settings, workers, expected };
});

const doc = {
  format: 1,
  description:
    'Generated cross-check vectors: pseudo-random datasets with the full output of the TypeScript implementation. They check that other implementations agree with it; they are not hand-verified. Regenerate with `npm run build && node scripts/generate-vectors.mjs` only after an intended change of results.',
  vectors,
};
await writeFile(join(ROOT, 'test-vectors/generated.json'), `${JSON.stringify(doc, null, 2)}\n`);
process.stdout.write(`Wrote ${vectors.length} generated vectors\n`);
