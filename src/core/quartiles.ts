// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Quartile pay bands, Article 3(1)(f) of Directive (EU) 2023/970:
 * "each of four equal groups of workers into which they are divided
 * according to their pay levels, from the lowest to the highest".
 *
 * The directive does not say how to divide a number of workers that is not
 * a multiple of four, or how to treat workers with identical pay at a band
 * boundary. Both methods offered here are deterministic and do not depend on
 * input order or on gender. See {@link QuartileMethod}.
 *
 * @packageDocumentation
 */

import type { QuartileMethod } from './config.js';
import type { Gender } from './dataset.js';
import { addRatio, compareFixed, ratio, type Fixed, type Ratio } from './decimal.js';

/** A worker's pay level and gender, the only inputs to band formation. */
export interface BandInput {
  readonly gender: Gender;
  readonly level: Fixed;
}

/** Composition of one band. Counts are exact and may be fractional. */
export interface BandComposition {
  readonly size: Ratio;
  readonly female: Ratio;
  readonly male: Ratio;
  readonly other: Ratio;
}

const ZERO: Ratio = { num: 0n, den: 1n };

interface TieGroup {
  readonly start: number;
  readonly size: number;
  readonly female: number;
  readonly male: number;
  readonly other: number;
}

function tieGroups(workers: readonly BandInput[]): TieGroup[] {
  const sorted = [...workers].sort((a, b) => compareFixed(a.level, b.level));
  const groups: TieGroup[] = [];
  let i = 0;
  while (i < sorted.length) {
    const level = sorted[i]?.level;
    let female = 0;
    let male = 0;
    let other = 0;
    const start = i;
    while (i < sorted.length && sorted[i]?.level === level) {
      const g = sorted[i]?.gender;
      if (g === 'female') female++;
      else if (g === 'male') male++;
      else other++;
      i++;
    }
    groups.push({ start, size: i - start, female, male, other });
  }
  return groups;
}

/**
 * Divides workers into four bands from the lowest to the highest pay level.
 * Returns four compositions; with no workers all are empty.
 *
 * Exact method, worked example: 6 workers with levels 10, 20, 20, 30, 40, 50.
 * Each band holds 6 / 4 = 1.5 workers. On the line [0, 6) the workers occupy
 * [0,1) [1,3) [3,4) [4,5) [5,6) after grouping the tie at 20. Band 1 is
 * [0, 1.5): the worker at 10 plus 0.5 of the tie group at 20.
 */
export function quartileBands(workers: readonly BandInput[], method: QuartileMethod): readonly BandComposition[] {
  const n = workers.length;
  const bands = [0, 1, 2, 3].map(() => ({ size: ZERO, female: ZERO, male: ZERO, other: ZERO }));
  if (n === 0) return bands;
  const groups = tieGroups(workers);
  const bigN = BigInt(n);

  if (method === 'exact-equal-groups') {
    // Work on a line scaled by 4 so that band boundaries b·n/4 become b·n.
    for (const g of groups) {
      const from = 4n * BigInt(g.start);
      const to = 4n * BigInt(g.start + g.size);
      const t4 = 4n * BigInt(g.size);
      for (let b = 0; b < 4; b++) {
        const lo = BigInt(b) * bigN;
        const hi = BigInt(b + 1) * bigN;
        const overlap = (to < hi ? to : hi) - (from > lo ? from : lo);
        if (overlap <= 0n) continue;
        const band = bands[b];
        if (band === undefined) continue;
        // The overlapping share of the group keeps the group's gender mix.
        band.size = addRatio(band.size, ratio(overlap, 4n));
        band.female = addRatio(band.female, ratio(overlap * BigInt(g.female), t4));
        band.male = addRatio(band.male, ratio(overlap * BigInt(g.male), t4));
        band.other = addRatio(band.other, ratio(overlap * BigInt(g.other), t4));
      }
    }
    return bands;
  }

  // Whole workers, ties together: band = floor(4 · midRank / n), where
  // midRank = start + (size − 1) / 2 (0-based). Doubled to stay in integers.
  for (const g of groups) {
    const doubledMid = 2n * BigInt(g.start) + BigInt(g.size) - 1n;
    let b = Number((4n * doubledMid) / (2n * bigN));
    if (b > 3) b = 3;
    const band = bands[b];
    if (band === undefined) continue;
    band.size = addRatio(band.size, ratio(BigInt(g.size), 1n));
    band.female = addRatio(band.female, ratio(BigInt(g.female), 1n));
    band.male = addRatio(band.male, ratio(BigInt(g.male), 1n));
    band.other = addRatio(band.other, ratio(BigInt(g.other), 1n));
  }
  return bands;
}
