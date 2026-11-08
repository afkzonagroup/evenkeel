// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

// Runs the shared test vectors in test-vectors/ (the Python package runs the
// same files).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Gender, WorkerRecord } from '../src/core/dataset.js';
import { computeIndicators, type CalculationSettings } from '../src/core/indicators.js';
import { ds, fx } from './helpers.js';

interface VectorWorker {
  id: string;
  gender: Gender;
  category: string | null;
  basic: string;
  complementary: string;
  hours: string | null;
  fte: string | null;
}

interface Vector {
  name: string;
  origin: 'hand-calculated' | 'generated-by-typescript';
  settings: CalculationSettings;
  workers: VectorWorker[];
  expected: unknown;
}

function load(file: string): Vector[] {
  const doc = JSON.parse(readFileSync(new URL(`../test-vectors/${file}`, import.meta.url), 'utf8')) as { format: number; vectors: Vector[] };
  expect(doc.format).toBe(1);
  return doc.vectors;
}

function records(workers: readonly VectorWorker[]): WorkerRecord[] {
  return workers.map((v) => ({
    id: v.id,
    gender: v.gender,
    category: v.category,
    basic: fx(v.basic),
    complementary: fx(v.complementary),
    hours: v.hours === null ? null : fx(v.hours),
    fte: v.fte === null ? null : fx(v.fte),
    lines: [],
  }));
}

/** Partial match: objects compare listed keys only; arrays compare length and every element. */
function partialMatch(actual: unknown, expected: unknown, path: string): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    const list = actual as unknown[];
    expect(list.length, `${path}.length`).toBe(expected.length);
    expected.forEach((e: unknown, i) => {
      partialMatch(list[i], e, `${path}[${i}]`);
    });
  } else if (typeof expected === 'object' && expected !== null) {
    expect(typeof actual === 'object' && actual !== null, path).toBe(true);
    for (const [key, value] of Object.entries(expected)) partialMatch((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
  } else {
    expect(actual, path).toEqual(expected);
  }
}

const hand = load('indicators.json');
const generated = load('generated.json');

describe('shared test vectors', () => {
  it('has hand-calculated vectors for every indicator', () => {
    expect(hand.length).toBeGreaterThanOrEqual(15);
    expect(hand.every((v) => v.origin === 'hand-calculated')).toBe(true);
  });

  it.each(hand.map((v) => [v.name, v] as const))('hand-calculated: %s', (_name, v) => {
    partialMatch(computeIndicators(ds(records(v.workers)), v.settings), v.expected, v.name);
  });

  it.each(generated.map((v) => [v.name, v] as const))('generated cross-check: %s', (_name, v) => {
    expect(v.origin).toBe('generated-by-typescript');
    expect(computeIndicators(ds(records(v.workers)), v.settings)).toEqual(v.expected);
  });
});
