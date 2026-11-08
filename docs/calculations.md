# Calculations

Every formula below is implemented in `src/core/indicators.ts` (TypeScript)
and `python/src/evenkeel/indicators.py` (Python). Both are tested against the
same vectors in `test-vectors/`. Article references are to Directive (EU)
2023/970; see [legal-basis.md](legal-basis.md) for the quoted text.

## Pay level of one worker (Article 3(1)(a), (b))

- **Basic pay** = sum of the `columns.basicPay` columns: the ordinary basic or
  minimum wage or salary.
- **Complementary or variable components** = sum of the
  `columns.complementaryPay` columns. Empty cells count as zero.
- **Total pay** = basic + complementary.

Each is then expressed on each configured basis:

| Basis | `annualPay` | Pay level |
|---|---|---|
| annual | `actual` | amount as given for the reference year |
| annual | `full-time-equivalent` | amount ÷ FTE fraction (0 < FTE ≤ 1) |
| hourly | – | amount ÷ hours (0 < hours ≤ 8784) |

Basic, complementary and total are divided separately. Each division is
rounded once to 10⁻¹² (see "Exact arithmetic").

A worker "receives" complementary or variable components when the
unscaled amount is greater than zero.

## Indicators (Article 9(1))

Let *F* be the female workers and *M* the male workers. Workers recorded as
neither female nor male are not in *F* or *M* (see `otherGender`).

| Point | Indicator | Formula |
|---|---|---|
| (a) | Gender pay gap | (mean(M) − mean(F)) ÷ mean(M) × 100, on total pay |
| (b) | Gender pay gap in complementary or variable components | the same on complementary components, over the population set by `complementaryGapPopulation` |
| (c) | Median gender pay gap | (median(M) − median(F)) ÷ median(M) × 100, on total pay |
| (d) | Median gender pay gap in complementary or variable components | the same with medians of complementary components |
| (e) | Proportion receiving complementary or variable components | for each sex: recipients ÷ workers × 100 |
| (f) | Proportion of female and male workers in each quartile pay band | for each band: female ÷ band size × 100 and male ÷ band size × 100 |
| (g) | Gender pay gap by category of workers | per category: the gap of (a) on basic pay, on complementary components and on total pay |

A positive gap means female workers are paid less; a negative gap means they
are paid more. The gap is not computed when either group is empty or the male
mean (or median) is zero; the report says why.

**Median** (Article 3(1)(d)): sort the values; with an odd count take the
middle value; with an even count take the midpoint of the two middle values.

Worked example (test `median-odd-and-even`): F = 10, 20, 30 → 20.
M = 10, 20, 30, 40 → (20 + 30) ÷ 2 = 25. Gap = (25 − 20) ÷ 25 × 100 = 20.00 %.

## Quartile pay bands (Article 3(1)(f))

Workers (female, male and, with `include-in-totals`, others) are sorted by
total pay level. Workers with identical pay form a tie group. With
small-group protection on, fewer than `minimumGroupSize` others are left out
(see [privacy.md](privacy.md), rules 1 and 6).

**`exact-equal-groups`.** Place the workers on a line from 0 to *n*, one unit
each, in pay order. Band *b* (1–4) covers [(b−1)·n/4, b·n/4). Each band holds
exactly *n*/4 workers. A tie group, or a single worker, that crosses a
boundary is shared between the bands in proportion to the overlap, and keeps
its female/male mix. Counts may be fractional.

Example (test `quartiles-exact-with-tie`): pay 10 F, 20 M, 20 F, 30 M, 40 F,
50 M. *n* = 6, each band 1.5. The tie at 20 occupies [1, 3).
Band 1 = [0, 1.5): 10 F + half the tie (0.25 F + 0.25 M) → F 1.25 ÷ 1.5 =
83.33 %, M 16.67 %.

**`whole-workers-ties-together`.** Each tie group goes to band
⌊4 × middle rank ÷ *n*⌋ + 1 (0-based ranks; the middle rank of a group from
rank *s* with *t* members is *s* + (*t* − 1)/2), at most band 4. Every worker
is in one band; band sizes can differ from *n*/4.

Neither method depends on input order or gender.

## Article 10(1)(a) threshold

Per category and basis: the gap in total pay (a "difference in the average
pay level") is compared, exactly and without rounding, with 5 %:
|gap| ≥ 5 → met. The difference counts in either direction. With both bases
configured, condition (a) is met when either basis meets it. Conditions (b)
(not justified) and (c) (not remedied within six months of submitting the
report) are employer facts; they are inputs and otherwise "unknown".

Example (test `threshold-exact-comparison`): M 0.10 and 0.70 (mean 0.40),
F 0.38 → exactly 5 % → met. Binary floating point computes
4.999999999999991 % here and would miss the threshold.

## Exact arithmetic

JavaScript numbers are binary floating point: 0.1 + 0.2 ≠ 0.3, and sums drift.
Evenkeel never uses them for amounts.

1. Input decimals (at most 15 integer and 6 fraction digits) are parsed
   exactly into integers counting units of 10⁻¹² (`Fixed`, a `bigint`).
2. Sums, counts and comparisons of these integers are exact.
3. A division that creates a per-worker value (hourly pay, pay per FTE) is
   rounded once to 10⁻¹², half away from zero. The error is at most
   0.0000000000005 per worker, far below any reported digit.
4. Means, medians, gaps and proportions are exact fractions of two integers
   (`Ratio`). They are rounded only for display, half away from zero, to
   `decimals` digits (default 2). Thresholds use the unrounded value.

Why not exact fractions throughout: hourly pay divides by each worker's
hours, so summing exact fractions would multiply denominators across
thousands of workers. The single 10⁻¹² rounding keeps the numbers small and
the result deterministic and identical in TypeScript and Python.

Why not integer cents: averages and hourly pay are not whole cents, and
rounding them to cents before computing gaps would bias the gaps.
