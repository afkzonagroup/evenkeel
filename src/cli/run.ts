// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The `evenkeel` command line. All processing is local: the CLI reads the
 * files named on the command line, writes the files named on the command
 * line (or standard output) and opens no network connections.
 *
 * @packageDocumentation
 */

import { parseArgs, type ParseArgsConfig } from 'node:util';
import { validateConfig, type EvenkeelConfig } from '../core/config.js';
import type { Dataset } from '../core/dataset.js';
import { computeIndicators } from '../core/indicators.js';
import { informationRequestResponse } from '../core/information-request.js';
import { reportingObligation } from '../core/obligations.js';
import { salaryRangeText, type PayPeriod } from '../core/salary-range.js';
import { describeLoadFailure, loadDataset } from '../pipeline.js';
import { renderCsv } from '../report/csv.js';
import { renderHtml } from '../report/html.js';
import { renderInformationResponseHtml, renderInformationResponseMarkdown } from '../report/information-response.js';
import { renderJson } from '../report/json.js';
import { renderMarkdown } from '../report/markdown.js';
import { buildReport, type ReportV1 } from '../report/model.js';
import { VERSION } from '../version.js';
import { CliError } from './node-io.js';

/** Side effects the CLI needs; injected so tests run without touching the disk. */
export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly readFile: (path: string, maxBytes: number) => Promise<Uint8Array>;
  readonly writeFile: (path: string, content: string, force: boolean) => Promise<void>;
  readonly now: () => Date;
}

/** Largest configuration file accepted. */
export const MAX_CONFIG_BYTES = 1024 * 1024;

const USAGE = `evenkeel ${VERSION} – pay-gap indicators of Directive (EU) 2023/970, computed locally

Usage:
  evenkeel init [--out evenkeel.config.json] [--force]
  evenkeel validate --input payroll.csv --config evenkeel.config.json
  evenkeel report --input payroll.csv --config evenkeel.config.json
                  [--format md|json|html|csv[,…]] [--out FILE | --out-dir DIR] [--force]
                  [--employer NAME] [--currency EUR] [--generated-at ISO-DATE]
                  [--submission-date YYYY-MM-DD] [--no-suppression]
  evenkeel request --input payroll.csv --config evenkeel.config.json --worker ID
                  [--request-date YYYY-MM-DD] [--format md|html|json] [--out FILE] [--force]
                  [--employer NAME] [--currency EUR]
  evenkeel salary-range --min 3000 [--max 3600] --currency EUR --period hour|month|year
                  [--collective-agreement TEXT]
  evenkeel obligations --workers 180 [--year 2027]
  evenkeel --help | --version

Nothing is uploaded. Files are written with mode 0600 and never overwritten without --force.
Not legal advice. Evenkeel by AFKzona Group – https://afkzonagroup.lt
Source and documentation: https://github.com/afkzonagroup/evenkeel
`;

const CONFIG_TEMPLATE = {
  $schema: 'https://github.com/afkzonagroup/evenkeel/blob/main/schema/config-v1.schema.json',
  version: 1,
  csv: { delimiter: ',', decimalSeparator: '.', thousandsSeparator: 'none', encoding: 'utf-8' },
  columns: {
    workerId: 'employee_id',
    gender: 'gender',
    category: 'job_category',
    basicPay: ['base_salary'],
    complementaryPay: ['bonus', 'overtime_pay', 'allowances'],
    hours: 'paid_hours',
    fte: 'fte',
  },
  genderCodes: { female: ['F'], male: ['M'], other: [] },
  otherGender: 'CHOOSE: reject | exclude | include-in-totals',
  payBases: ['annual', 'hourly'],
  annualPay: 'CHOOSE: actual | full-time-equivalent',
  complementaryGapPopulation: 'CHOOSE: recipients | all-workers',
  quartileMethod: 'CHOOSE: exact-equal-groups | whole-workers-ties-together',
  minimumGroupSize: 5,
  duplicateWorkerRows: 'reject',
  decimals: 2,
};

type Values = Record<string, string | boolean | undefined>;

function parse(args: readonly string[], options: NonNullable<ParseArgsConfig['options']>): Values {
  try {
    const { values, positionals } = parseArgs({ args: [...args], options, strict: true, allowPositionals: true });
    if (positionals.length > 0) throw new CliError(`Unexpected argument ${JSON.stringify(positionals[0])}. See evenkeel --help.`);
    return values as Values;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`${error instanceof Error ? error.message : 'Invalid arguments'}. See evenkeel --help.`);
  }
}

function str(values: Values, name: string): string | undefined {
  const v = values[name];
  return typeof v === 'string' ? v : undefined;
}

function required(values: Values, name: string): string {
  const v = str(values, name);
  if (v === undefined || v.length === 0) throw new CliError(`--${name} is required. See evenkeel --help.`);
  return v;
}

async function loadConfig(io: CliIo, path: string): Promise<EvenkeelConfig> {
  const bytes = await io.readFile(path, MAX_CONFIG_BYTES);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new CliError('The configuration file is not valid UTF-8 JSON.', 1);
  }
  const result = validateConfig(json);
  if (!result.ok) throw new CliError(`The configuration is not valid:\n  ${result.errors.join('\n  ')}`, 1);
  return result.config;
}

async function loadData(io: CliIo, values: Values): Promise<{ config: EvenkeelConfig; dataset: Dataset }> {
  const config = await loadConfig(io, required(values, 'config'));
  const bytes = await io.readFile(required(values, 'input'), config.csv.limits.maxBytes);
  const result = loadDataset(bytes, config);
  if (!result.ok) throw new CliError(`The payroll file has problems:\n  ${describeLoadFailure(result).join('\n  ')}`, 1);
  return { config, dataset: result.dataset };
}

const IO_OPTIONS = {
  input: { type: 'string' },
  config: { type: 'string' },
  format: { type: 'string' },
  out: { type: 'string' },
  force: { type: 'boolean' },
  employer: { type: 'string' },
  currency: { type: 'string' },
} as const;

type ReportFormat = 'md' | 'json' | 'html' | 'csv';
const RENDERERS: Readonly<Record<ReportFormat, (r: ReportV1) => string>> = {
  md: renderMarkdown,
  json: renderJson,
  html: renderHtml,
  csv: renderCsv,
};

function formats(value: string | undefined, allowed: readonly string[]): string[] {
  const list = (value ?? 'md').split(',').map((f) => f.trim());
  for (const f of list) if (!allowed.includes(f)) throw new CliError(`Unknown format ${JSON.stringify(f)}. Use ${allowed.join(', ')}.`);
  if (new Set(list).size !== list.length) throw new CliError('A format is listed twice.');
  return list;
}

/** Joins a directory and one of the fixed report file names. */
function outputPath(dir: string, name: string): string {
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${name}` : `${dir}/${name}`;
}

async function emit(io: CliIo, values: Values, content: string): Promise<void> {
  const out = str(values, 'out');
  if (out === undefined) io.stdout(content);
  else {
    await io.writeFile(out, content, values.force === true);
    io.stderr(`Wrote ${out}\n`);
  }
}

async function commandReport(io: CliIo, args: readonly string[]): Promise<number> {
  const values = parse(args, {
    ...IO_OPTIONS,
    'out-dir': { type: 'string' },
    'generated-at': { type: 'string' },
    'submission-date': { type: 'string' },
    'no-suppression': { type: 'boolean' },
  });
  const list = formats(str(values, 'format'), ['md', 'json', 'html', 'csv']) as ReportFormat[];
  const outDir = str(values, 'out-dir');
  if (outDir !== undefined && str(values, 'out') !== undefined) throw new CliError('Use either --out or --out-dir, not both.');
  if (list.length > 1 && outDir === undefined) throw new CliError('Several formats need --out-dir.');
  const { config, dataset } = await loadData(io, values);
  const employer = str(values, 'employer');
  const currency = str(values, 'currency');
  const submissionDate = str(values, 'submission-date');
  let report: ReportV1;
  try {
    report = buildReport(dataset, config, {
      generatedAt: str(values, 'generated-at') ?? io.now().toISOString(),
      suppressSmallGroups: values['no-suppression'] !== true,
      ...(employer === undefined ? {} : { employer }),
      ...(currency === undefined ? {} : { currency }),
      ...(submissionDate === undefined ? {} : { submissionDate }),
    });
  } catch (error) {
    throw new CliError(error instanceof RangeError ? error.message : 'Could not build the report.');
  }
  if (values['no-suppression'] === true) {
    io.stderr('Warning: small-group protection is off. The output can disclose the pay of identifiable workers. Do not distribute it.\n');
  }
  for (const f of list) {
    const content = RENDERERS[f](report);
    if (outDir !== undefined) {
      const path = outputPath(outDir, `evenkeel-report.${f}`);
      await io.writeFile(path, content, values.force === true);
      io.stderr(`Wrote ${path}\n`);
    } else {
      await emit(io, values, content);
    }
  }
  return 0;
}

async function commandValidate(io: CliIo, args: readonly string[]): Promise<number> {
  const values = parse(args, { input: { type: 'string' }, config: { type: 'string' } });
  const { dataset } = await loadData(io, values);
  const s = dataset.summary;
  io.stdout(
    `OK: ${s.dataRows} rows read, ${s.rowsUsed} used, ${s.rowsOtherPeriod} with another period left out; ${s.workers} workers (${s.female} female, ${s.male} male, ${s.other} neither).\n`,
  );
  return 0;
}

async function commandRequest(io: CliIo, args: readonly string[]): Promise<number> {
  const values = parse(args, { ...IO_OPTIONS, worker: { type: 'string' }, 'request-date': { type: 'string' } });
  const [format] = formats(str(values, 'format'), ['md', 'html', 'json']);
  const { config, dataset } = await loadData(io, values);
  const indicators = computeIndicators(dataset, { ...config, suppressSmallGroups: true });
  const requestDate = str(values, 'request-date');
  const employer = str(values, 'employer');
  const currency = str(values, 'currency');
  let content: string;
  try {
    const response = informationRequestResponse(dataset, indicators, required(values, 'worker'), {
      payBases: config.payBases,
      decimals: config.decimals,
      ...(config.annualPay === undefined ? {} : { annualPay: config.annualPay }),
      ...(requestDate === undefined ? {} : { requestDate }),
    });
    const options = { ...(employer === undefined ? {} : { employer }), ...(currency === undefined ? {} : { currency }) };
    content =
      format === 'json'
        ? `${JSON.stringify(response, null, 2)}\n`
        : format === 'html'
          ? renderInformationResponseHtml(response, options)
          : renderInformationResponseMarkdown(response, options);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(error instanceof RangeError ? error.message : 'Could not build the answer.', 1);
  }
  await emit(io, values, content);
  return 0;
}

function commandSalaryRange(io: CliIo, args: readonly string[]): number {
  const values = parse(args, {
    min: { type: 'string' },
    max: { type: 'string' },
    currency: { type: 'string' },
    period: { type: 'string' },
    'collective-agreement': { type: 'string' },
  });
  const period = required(values, 'period');
  if (period !== 'hour' && period !== 'month' && period !== 'year') throw new CliError('--period must be hour, month or year.');
  const max = str(values, 'max');
  const agreement = str(values, 'collective-agreement');
  try {
    io.stdout(
      `${salaryRangeText({
        minimum: required(values, 'min'),
        currency: required(values, 'currency'),
        period: period satisfies PayPeriod,
        ...(max === undefined ? {} : { maximum: max }),
        ...(agreement === undefined ? {} : { collectiveAgreement: agreement }),
      })}\n`,
    );
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(error instanceof RangeError ? error.message : 'Invalid input.');
  }
  return 0;
}

function commandObligations(io: CliIo, args: readonly string[]): number {
  const values = parse(args, { workers: { type: 'string' }, year: { type: 'string' } });
  const workersText = required(values, 'workers');
  const yearText = str(values, 'year') ?? String(io.now().getUTCFullYear());
  if (!/^[0-9]{1,9}$/.test(workersText)) throw new CliError('--workers must be a whole number.');
  if (!/^[0-9]{4}$/.test(yearText)) throw new CliError('--year must be a four-digit year.');
  let o;
  try {
    o = reportingObligation(Number(workersText), Number(yearText));
  } catch (error) {
    throw new CliError(error instanceof RangeError ? error.message : 'Invalid input.');
  }
  const lines = [`Size band: ${o.sizeBand} (${o.legalBasis}, ${o.legalBasisUrl})`];
  if (o.frequencyYears === null) {
    lines.push('No reporting duty under the directive; reporting is voluntary. National law may require it.');
  } else {
    lines.push(`Reporting under the directive: from ${o.firstReportingYear ?? ''}, every ${o.frequencyYears === 1 ? 'year' : 'three years'}, by 7 June.`);
    lines.push(
      o.reportDueInYear
        ? `A report is due by ${o.deadline ?? ''}, covering calendar year ${o.referenceYear}.`
        : `No report is due in ${yearText} under the directive.`,
    );
  }
  lines.push(o.note);
  io.stdout(`${lines.join('\n')}\n`);
  return 0;
}

async function commandInit(io: CliIo, args: readonly string[]): Promise<number> {
  const values = parse(args, { out: { type: 'string' }, force: { type: 'boolean' } });
  const out = str(values, 'out') ?? 'evenkeel.config.json';
  await io.writeFile(out, `${JSON.stringify(CONFIG_TEMPLATE, null, 2)}\n`, values.force === true);
  io.stderr(
    `Wrote ${out}. Edit the column names to match your export and replace every "CHOOSE: …" value with one of the options; see docs/configuration.md.\n`,
  );
  return 0;
}

// Control, format and separator characters, except line feed and tab.
const TERMINAL_UNSAFE = /(?![\n\t])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** Removes characters that could control a terminal from text written to stderr. */
export function sanitiseForTerminal(text: string): string {
  return text.replace(TERMINAL_UNSAFE, '�');
}

/**
 * Runs the CLI with the given arguments (without the node and script
 * paths). Returns the process exit code: 0 success, 1 invalid data or
 * configuration, 2 usage or file error.
 */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const err: CliIo = { ...io, stderr: (t) => { io.stderr(sanitiseForTerminal(t)); } };
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case undefined:
      case '--help':
      case '-h':
      case 'help':
        io.stdout(USAGE);
        return command === undefined ? 2 : 0;
      case '--version':
      case '-v':
        io.stdout(`${VERSION}\n`);
        return 0;
      case 'init':
        return await commandInit(err, rest);
      case 'validate':
        return await commandValidate(err, rest);
      case 'report':
        return await commandReport(err, rest);
      case 'request':
        return await commandRequest(err, rest);
      case 'salary-range':
        return commandSalaryRange(err, rest);
      case 'obligations':
        return commandObligations(err, rest);
      default:
        throw new CliError(`Unknown command ${JSON.stringify(command)}. See evenkeel --help.`);
    }
  } catch (error) {
    if (error instanceof CliError) {
      err.stderr(`evenkeel: ${error.message}\n`);
      return error.exitCode;
    }
    // Unexpected failure: no stack trace, no data.
    err.stderr('evenkeel: unexpected error. Please report it with the command you ran (without your data).\n');
    return 70;
  }
}
