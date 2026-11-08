// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A small document model (headings, paragraphs, tables, lists) that the
 * Markdown and HTML renderers both turn into output. Text in blocks is
 * plain text; each renderer escapes it for its format.
 *
 * @packageDocumentation
 */

import { ATTRIBUTION, PROJECT_URL, articleUrl } from '../core/legal.js';
import type { BasisIndicators } from '../core/indicators.js';
import { amountText, basisLabel, legend, percentText, thresholdLabel } from './labels.js';
import type { ReportV1 } from './model.js';

/** Text that comes from input data (category names, employer, column names). Renderers escape it strictly. */
export interface DataText {
  readonly data: string;
}

/** A table cell: fixed text written by this program, or input data. */
export type Cell = string | DataText;

/** A run of text: fixed text, input data, or a link to a fixed https URL. */
export type Inline = string | DataText | { readonly text: string; readonly url: string };

/** Marks a string as input data. */
export const data = (value: string): DataText => ({ data: value });

/** A document block. */
export type Block =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly text: readonly Inline[] }
  | { readonly kind: 'paragraph'; readonly content: readonly Inline[] }
  | { readonly kind: 'note'; readonly content: readonly Inline[] }
  | { readonly kind: 'table'; readonly head: readonly string[]; readonly rows: readonly (readonly Cell[])[] }
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | { readonly kind: 'footer'; readonly content: readonly Inline[] };

const p = (...content: Inline[]): Block => ({ kind: 'paragraph', content });
const count = (n: number | null): string => (n === null ? 'withheld: small group' : String(n));

/** Footer with the attribution required by LICENSE-ADDITIONAL-TERMS.md. */
export function attributionFooter(version: string): Block {
  return { kind: 'footer', content: [{ text: ATTRIBUTION.text, url: ATTRIBUTION.url }, ` · version ${version} · `, { text: 'source code', url: PROJECT_URL }] };
}

function basisBlocks(b: BasisIndicators, currency: string | null): Block[] {
  const unit = currency === null ? '' : ` (${currency}${b.basis === 'hourly' ? ' per hour' : ' per year'})`;
  const blocks: Block[] = [{ kind: 'heading', level: 2, text: [`${basisLabel(b.basis)}${unit}`] }];
  blocks.push({
    kind: 'table',
    head: ['Indicator', 'Female', 'Male', 'Gap'],
    rows: [
      ['(a) Gender pay gap – average pay level', amountText(b.genderPayGap.female.average), amountText(b.genderPayGap.male.average), percentText(b.genderPayGap.gap)],
      [
        '(b) Gender pay gap in complementary or variable components – average',
        amountText(b.complementaryPayGap.female.average),
        amountText(b.complementaryPayGap.male.average),
        percentText(b.complementaryPayGap.gap),
      ],
      [
        '(c) Median gender pay gap – median pay level',
        amountText(b.medianGenderPayGap.female.median),
        amountText(b.medianGenderPayGap.male.median),
        percentText(b.medianGenderPayGap.gap),
      ],
      [
        '(d) Median gender pay gap in complementary or variable components',
        amountText(b.medianComplementaryPayGap.female.median),
        amountText(b.medianComplementaryPayGap.male.median),
        percentText(b.medianComplementaryPayGap.gap),
      ],
    ],
  });
  blocks.push({ kind: 'heading', level: 3, text: ['(f) Proportion of female and male workers in each quartile pay band'] });
  blocks.push({
    kind: 'table',
    head: ['Band', 'Workers', 'Female', 'Male'],
    rows: b.quartilePayBands.map((q) => [
      `${q.band} – ${['lowest', 'lower middle', 'upper middle', 'highest'][q.band - 1] ?? ''}`,
      q.workers,
      percentText(q.female),
      percentText(q.male),
    ]),
  });
  if (b.categories !== null) {
    blocks.push({ kind: 'heading', level: 3, text: ['(g) Gender pay gap by category of workers'] });
    blocks.push({
      kind: 'table',
      head: ['Category', 'Female workers', 'Male workers', 'Basic pay gap', 'Complementary gap', 'Total pay gap', 'Article 10(1)(a)'],
      rows: b.categories.map((c) => [
        data(c.category),
        String(c.female.workers),
        String(c.male.workers),
        percentText(c.basicPayGap),
        percentText(c.complementaryPayGap),
        percentText(c.totalPayGap),
        thresholdLabel(c.jointAssessmentThreshold),
      ]),
    });
    blocks.push({
      kind: 'table',
      head: ['Category', 'Female basic', 'Male basic', 'Female complementary', 'Male complementary', 'Female total', 'Male total'],
      rows: b.categories.map((c) => [
        data(c.category),
        amountText(c.female.basicAverage),
        amountText(c.male.basicAverage),
        amountText(c.female.complementaryAverage),
        amountText(c.male.complementaryAverage),
        amountText(c.female.totalAverage),
        amountText(c.male.totalAverage),
      ]),
    });
  }
  return blocks;
}

/** Turns a report into document blocks. */
export function reportBlocks(report: ReportV1): Block[] {
  const title: Inline[] = report.employer === null ? ['Pay transparency report'] : ['Pay transparency report – ', data(report.employer)];
  const blocks: Block[] = [{ kind: 'heading', level: 1, text: title }];
  blocks.push(
    p(
      `Reference period: ${report.referencePeriod ?? 'not stated'}. Generated ${report.generatedAt}. Indicators of `,
      { text: 'Article 9(1) of Directive (EU) 2023/970', url: articleUrl(9) },
      '.',
    ),
  );
  for (const note of report.notes) blocks.push({ kind: 'note', content: [note] });

  const d = report.data;
  blocks.push({ kind: 'heading', level: 2, text: ['Data'] });
  blocks.push({
    kind: 'table',
    head: ['Rows read', 'Workers', 'Female', 'Male', 'Neither female nor male'],
    rows: [[count(d.dataRows), count(d.workers), String(d.female), String(d.male), count(d.other)]],
  });

  const e = report.indicators.proportionReceivingComplementary;
  blocks.push({ kind: 'heading', level: 2, text: ['(e) Proportion of female and male workers receiving complementary or variable components'] });
  blocks.push({ kind: 'table', head: ['Female', 'Male'], rows: [[percentText(e.female.proportion), percentText(e.male.proportion)]] });

  for (const b of report.indicators.bases) blocks.push(...basisBlocks(b, report.currency));

  const j = report.jointPayAssessment;
  blocks.push({ kind: 'heading', level: 2, text: ['Joint pay assessment test'] });
  if (!j.computed) {
    blocks.push(p('Not computed: no category column is configured.'));
  } else {
    blocks.push(
      p(
        'Under ',
        { text: 'Article 10(1)', url: articleUrl(10) },
        ', for employers subject to pay reporting under Article 9, a joint pay assessment is required where (a) the reporting shows a difference in average pay level of at least 5 % in a category of workers, (b) the employer has not justified it on objective, gender-neutral criteria and (c) has not remedied it within six months of submitting the report. Only (a) is computed from data; (b) and (c) are for the employer and workers’ representatives to establish.',
      ),
    );
    blocks.push({
      kind: 'table',
      head: ['Category', '(a) 5 % threshold', '(b) not justified', '(c) not remedied', 'Assessment required'],
      rows: j.categories.map((c) => [
        data(c.category),
        c.conditionA === 'met' ? 'met' : c.conditionA === 'not-met' ? 'not met' : c.conditionA === 'withheld' ? 'withheld' : 'cannot be determined',
        c.conditionB,
        c.conditionC,
        c.assessmentRequired,
      ]),
    });
    if (j.remedyPeriodEnds !== null) {
      blocks.push(p(`Six months from the submission date ends on ${j.remedyPeriodEnds} (indicative; national law may count periods differently).`));
    }
  }

  blocks.push({ kind: 'heading', level: 2, text: ['Choices behind these figures'] });
  blocks.push({
    kind: 'table',
    head: ['Setting', 'Value', 'What it means', 'Legal basis'],
    rows: report.choices.map((c) => [c.setting, data(c.value), c.explanation, c.legalBasis]),
  });
  blocks.push(
    p(
      'Gender pay gap = (average pay level of male workers − average pay level of female workers) ÷ average pay level of male workers × 100 (',
      { text: 'Article 3(1)(c)', url: articleUrl(3) },
      '). Median gaps use medians in the same way (Article 3(1)(e)). Figures are rounded half away from zero for display; thresholds are tested on exact values.',
    ),
  );
  blocks.push({ kind: 'heading', level: 3, text: ['Legend'] });
  blocks.push({ kind: 'list', items: legend(report.smallGroupProtection.minimumGroupSize) });
  blocks.push(p(report.notLegalAdvice));
  blocks.push(attributionFooter(report.generator.version));
  return blocks;
}

