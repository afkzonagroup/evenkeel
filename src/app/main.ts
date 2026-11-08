// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Offline single-page app. Runs from file:// with no server. The page's
 * Content Security Policy sets connect-src 'none', so the browser itself
 * blocks any network request from this code; files are read with the File
 * API and results are saved through blob: downloads.
 */

import { validateConfig, type EvenkeelConfig, type PayBasis } from '../core/config.js';
import { DEFAULT_CSV_LIMITS, decodeCsvBytes, parseCsv, type CsvTable } from '../core/csv.js';
import type { Dataset } from '../core/dataset.js';
import { computeIndicators } from '../core/indicators.js';
import { informationRequestResponse } from '../core/information-request.js';
import { ATTRIBUTION, DIRECTIVE, PROJECT_URL, articleUrl } from '../core/legal.js';
import { reportingObligation } from '../core/obligations.js';
import { salaryRangeText, type PayPeriod } from '../core/salary-range.js';
import { describeLoadFailure, loadDataset } from '../pipeline.js';
import { renderCsv } from '../report/csv.js';
import { reportBlocks } from '../report/document.js';
import { renderHtml } from '../report/html.js';
import { informationResponseBlocks, renderInformationResponseHtml, renderInformationResponseMarkdown } from '../report/information-response.js';
import { renderJson } from '../report/json.js';
import { renderMarkdown } from '../report/markdown.js';
import { buildReport, type ReportV1 } from '../report/model.js';
import { VERSION } from '../version.js';
import { append, clear, download, h, logo, renderBlocks } from './dom.js';

type GenderGroup = 'female' | 'male' | 'other';

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_GENDER_VALUES = 50;

const state = {
  bytes: null as Uint8Array | null,
  fileName: '',
  table: null as CsvTable | null,
  csv: { delimiter: ',', decimalSeparator: '.', thousandsSeparator: 'none', encoding: 'utf-8' } as Record<string, string>,
  columns: {
    workerId: undefined as string | undefined,
    gender: undefined as string | undefined,
    category: undefined as string | undefined,
    hours: undefined as string | undefined,
    fte: undefined as string | undefined,
    period: undefined as string | undefined,
    basicPay: [] as string[],
    complementaryPay: [] as string[],
  },
  genderMap: new Map<string, GenderGroup>(),
  payBases: new Set<PayBasis>(),
  // Only the technical setting has a visible default; the open choices start empty.
  choices: { duplicateWorkerRows: 'reject' } as Record<string, string | undefined>,
  minimumGroupSize: '5',
  referencePeriod: '',
  duplicateWorkerRows: 'reject',
  employer: '',
  currency: '',
  submissionDate: '',
  result: null as { config: EvenkeelConfig; dataset: Dataset; report: ReportV1 } | null,
};

// ---------------------------------------------------------------- widgets

let groupCounter = 0;

function chipGroup<T extends string>(
  legend: string,
  options: readonly Option<T>[],
  isSelected: (v: T) => boolean,
  onChange: (v: T, checked: boolean) => void,
  multiple = false,
  help?: string,
): HTMLFieldSetElement {
  const name = `g${++groupCounter}`;
  const fieldset = h('fieldset', { class: 'chips' }, h('legend', {}, legend));
  if (help !== undefined) fieldset.append(h('p', { class: 'help' }, help));
  const row = h('div', { class: 'chip-row' });
  for (const o of options) {
    const input = h('input', { type: multiple ? 'checkbox' : 'radio', name, value: o.value, class: 'sr-only', checked: isSelected(o.value) });
    input.addEventListener('change', () => {
      onChange(o.value, input.checked);
    });
    row.append(h('label', { class: 'chip' }, input, h('span', {}, o.label, o.hint === undefined ? null : h('small', {}, o.hint))));
  }
  fieldset.append(row);
  return fieldset;
}

function textField(label: string, value: string, onInput: (v: string) => void, attrs: Record<string, string> = {}): HTMLLabelElement {
  const input = h('input', { type: 'text', value, placeholder: label, 'aria-label': label, maxlength: '200', spellcheck: 'false', ...attrs });
  input.addEventListener('input', () => {
    onInput(input.value);
  });
  return h('label', { class: 'field' }, h('span', { class: 'sr-only' }, label), input);
}

function button(label: string, onClick: () => void, kind: 'primary' | 'secondary' = 'secondary'): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `button ${kind}` }, label);
  b.addEventListener('click', onClick);
  return b;
}

function fileButton(label: string, accept: string, onFile: (file: File) => void): HTMLLabelElement {
  const input = h('input', { type: 'file', accept, class: 'sr-only' });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file !== undefined) onFile(file);
    input.value = '';
  });
  return h('label', { class: 'button secondary' }, input, label);
}

function message(kind: 'error' | 'info', ...lines: string[]): HTMLElement {
  return h('div', { class: `message ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, ...lines.map((l) => h('p', {}, l)));
}

// ---------------------------------------------------------------- layout

const root = h('main', { id: 'app' });
const fileInfo = h('div', { class: 'file-info', 'aria-live': 'polite' });
const columnsSection = h('div');
const genderSection = h('div');
const resultSection = h('section', { class: 'card', 'aria-labelledby': 'results-title', hidden: true });
const resultBody = h('div');
const computeStatus = h('div', { 'aria-live': 'polite' });
const requestBody = h('div');

function invalidate(): void {
  if (state.result !== null) {
    state.result = null;
    resultSection.hidden = true;
    clear(resultBody);
    clear(requestBody);
    clear(computeStatus);
    computeStatus.append(message('info', 'Settings changed. Compute again to update the results.'));
  }
}

function headerNames(): string[] {
  return state.table === null ? [] : state.table.header.map((x) => x.trim()).filter((x) => x.length > 0);
}

// ---------------------------------------------------------------- step 1: file

function parseLoaded(): void {
  clear(fileInfo);
  state.table = null;
  if (state.bytes === null) return;
  const text = decodeCsvBytes(state.bytes, state.csv.encoding === 'windows-1252' ? 'windows-1252' : 'utf-8', DEFAULT_CSV_LIMITS.maxBytes);
  if (!text.ok) {
    fileInfo.append(message('error', text.error.message));
    renderColumns();
    return;
  }
  const delimiter = state.csv.delimiter === ';' || state.csv.delimiter === '\t' || state.csv.delimiter === '|' ? state.csv.delimiter : ',';
  const table = parseCsv(text.value, delimiter, DEFAULT_CSV_LIMITS);
  if (!table.ok) {
    fileInfo.append(message('error', `${table.error.line === null ? '' : `Line ${table.error.line}: `}${table.error.message}`));
    renderColumns();
    return;
  }
  state.table = table.value;
  fileInfo.append(
    message('info', `${state.fileName}: ${table.value.rows.length} rows and ${table.value.header.length} columns read in this browser. Nothing was uploaded.`),
  );
  renderColumns();
}

async function onPayrollFile(file: File): Promise<void> {
  invalidate();
  clear(fileInfo);
  if (file.size > DEFAULT_CSV_LIMITS.maxBytes) {
    fileInfo.append(message('error', `The file is ${file.size} bytes; the limit is ${DEFAULT_CSV_LIMITS.maxBytes} bytes.`));
    return;
  }
  state.bytes = new Uint8Array(await file.arrayBuffer());
  state.fileName = file.name.slice(0, 120);
  parseLoaded();
}

function stepFile(): HTMLElement {
  const drop = h('label', { class: 'drop' });
  const input = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv', class: 'sr-only' });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file !== undefined) void onPayrollFile(file);
    input.value = '';
  });
  append(drop, input, h('strong', {}, 'Choose a payroll CSV file'), h('span', {}, 'or drop it here. It is read by this page only.'));
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => { drop.classList.remove('over'); });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const file = e.dataTransfer?.files[0];
    if (file !== undefined) void onPayrollFile(file);
  });

  const setCsv = (key: string) => (v: string) => {
    state.csv[key] = v;
    invalidate();
    parseLoaded();
  };
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'step1' },
    h('h2', { id: 'step1' }, h('span', { class: 'step' }, '1'), 'Payroll file'),
    h('p', {}, 'One row per worker for the reference year, with gross pay amounts. Use pseudonymous worker ids if you can.'),
    drop,
    fileInfo,
    h(
      'div',
      { class: 'grid2' },
      chipGroup(
        'Column separator',
        [
          { value: ',', label: 'Comma' },
          { value: ';', label: 'Semicolon' },
          { value: '\t', label: 'Tab' },
          { value: '|', label: 'Pipe' },
        ],
        (v) => state.csv.delimiter === v,
        setCsv('delimiter'),
      ),
      chipGroup(
        'Decimal separator',
        [
          { value: '.', label: '1234.56' },
          { value: ',', label: '1234,56' },
        ],
        (v) => state.csv.decimalSeparator === v,
        setCsv('decimalSeparator'),
      ),
      chipGroup(
        'Thousands separator',
        [
          { value: 'none', label: 'None' },
          { value: ' ', label: 'Space' },
          { value: '.', label: 'Dot' },
          { value: ',', label: 'Comma' },
          { value: "'", label: 'Apostrophe' },
        ],
        (v) => state.csv.thousandsSeparator === v,
        setCsv('thousandsSeparator'),
      ),
      chipGroup(
        'Text encoding',
        [
          { value: 'utf-8', label: 'UTF-8' },
          { value: 'windows-1252', label: 'Windows-1252' },
        ],
        (v) => state.csv.encoding === v,
        setCsv('encoding'),
      ),
    ),
  );
}

// ---------------------------------------------------------------- step 2: columns

function renderColumns(): void {
  clear(columnsSection);
  clear(genderSection);
  const names = headerNames();
  if (names.length === 0) {
    append(
      columnsSection,
      h(
        'section',
        { class: 'card pending', 'aria-labelledby': 'step2' },
        h('h2', { id: 'step2' }, h('span', { class: 'step' }, '2'), 'Columns'),
        h('p', { class: 'muted' }, 'Choose a payroll file first. Its column names appear here.'),
      ),
      h(
        'section',
        { class: 'card pending', 'aria-labelledby': 'step3' },
        h('h2', { id: 'step3' }, h('span', { class: 'step' }, '3'), 'Gender codes'),
        h('p', { class: 'muted' }, 'After you pick the gender column, every value found in it appears here for you to assign.'),
      ),
    );
    return;
  }
  const opts = names.map((n) => ({ value: n, label: n }));
  const none: Option<string> = { value: '', label: 'None' };
  const single = (key: 'workerId' | 'gender' | 'category' | 'hours' | 'fte' | 'period', legend: string, optional: boolean, help?: string) => {
    if (state.columns[key] !== undefined && !names.includes(state.columns[key])) state.columns[key] = undefined;
    return chipGroup(
      legend,
      optional ? [none, ...opts] : opts,
      (v) => (state.columns[key] ?? '') === v && (optional || v !== ''),
      (v) => {
        state.columns[key] = v === '' ? undefined : v;
        invalidate();
        if (key === 'gender') renderGender();
        if (key === 'period') renderColumns();
      },
      false,
      help,
    );
  };
  const multi = (key: 'basicPay' | 'complementaryPay', legend: string, help: string) => {
    state.columns[key] = state.columns[key].filter((c) => names.includes(c));
    return chipGroup(
      legend,
      opts,
      (v) => state.columns[key].includes(v),
      (v, checked) => {
        const list = state.columns[key].filter((c) => c !== v);
        if (checked) list.push(v);
        state.columns[key] = names.filter((n) => list.includes(n));
        invalidate();
      },
      true,
      help,
    );
  };
  append(
    columnsSection,
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'step2' },
      h('h2', { id: 'step2' }, h('span', { class: 'step' }, '2'), 'Columns'),
      h('p', {}, 'Tell the tool what each column holds. Amounts in several columns are added up.'),
      single('workerId', 'Worker id', false),
      single('gender', 'Gender', false),
      single('category', 'Category of workers', true, 'Workers doing the same work or work of equal value, grouped by you on objective, gender-neutral criteria (Article 3(1)(h)). Needed for indicator (g) and the Article 10 test.'),
      multi('basicPay', 'Ordinary basic wage or salary', 'Gross basic or minimum wage or salary for the year (Article 3(1)(a)).'),
      multi('complementaryPay', 'Complementary or variable components', 'Everything else paid in cash or in kind: bonuses, overtime, allowances, benefits in kind and similar (recital 21). Empty cells count as zero.'),
      single('hours', 'Hours', true, 'Hours the pay relates to. Needed for hourly pay.'),
      single('fte', 'Full-time equivalent', true, 'A fraction above 0 and at most 1. Needed for full-time-equivalent annual pay.'),
      single('period', 'Period', true, 'Optional. Rows whose period differs from the reference period are left out and counted.'),
      state.columns.period === undefined
        ? null
        : textField('Reference period, as written in the period column', state.referencePeriod, (v) => {
            state.referencePeriod = v;
            invalidate();
          }),
    ),
    genderSection,
  );
  renderGender();
}

function renderGender(): void {
  clear(genderSection);
  const table = state.table;
  const column = state.columns.gender;
  if (table === null) return;
  if (column === undefined) {
    genderSection.append(
      h(
        'section',
        { class: 'card pending', 'aria-labelledby': 'step3' },
        h('h2', { id: 'step3' }, h('span', { class: 'step' }, '3'), 'Gender codes'),
        h('p', { class: 'muted' }, 'Pick the gender column above. Every value found in it then appears here for you to assign.'),
      ),
    );
    return;
  }
  const index = table.header.findIndex((x) => x.trim() === column);
  const seen = new Map<string, string>();
  for (const row of table.rows) {
    const raw = (row.fields[index] ?? '').trim();
    if (raw.length > 0 && !seen.has(raw.toLowerCase())) seen.set(raw.toLowerCase(), raw);
    if (seen.size > MAX_GENDER_VALUES) break;
  }
  const card = h(
    'section',
    { class: 'card', 'aria-labelledby': 'step3' },
    h('h2', { id: 'step3' }, h('span', { class: 'step' }, '3'), 'Gender codes'),
    h('p', {}, 'Assign every value found in the gender column. Values you do not assign make the rows invalid, so a typo can never put a worker in the wrong group.'),
  );
  if (seen.size > MAX_GENDER_VALUES) {
    card.append(message('error', `The gender column has more than ${MAX_GENDER_VALUES} different values. Check that the right column is selected.`));
  }
  const values = [...seen.values()].slice(0, MAX_GENDER_VALUES);
  for (const key of [...state.genderMap.keys()]) if (!values.includes(key)) state.genderMap.delete(key);
  for (const value of values) {
    card.append(
      chipGroup<GenderGroup>(
        `Value “${value.slice(0, 40)}”`,
        [
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
          { value: 'other', label: 'Neither female nor male' },
        ],
        (g) => state.genderMap.get(value) === g,
        (g) => {
          state.genderMap.set(value, g);
          invalidate();
        },
      ),
    );
  }
  genderSection.append(card);
}

// ---------------------------------------------------------------- step 4: choices

function stepChoices(): HTMLElement {
  const choice = (key: string, legend: string, help: string, options: readonly Option<string>[]) =>
    chipGroup(
      legend,
      options,
      (v) => state.choices[key] === v,
      (v) => {
        state.choices[key] = v;
        invalidate();
      },
      false,
      help,
    );
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'step4' },
    h('h2', { id: 'step4' }, h('span', { class: 'step' }, '4'), 'Choices the directive leaves to you'),
    h('p', {}, 'Nothing here is pre-selected. Each choice is written into the report. Your national law may settle some of them.'),
    chipGroup<PayBasis>(
      'Pay basis',
      [
        { value: 'annual', label: 'Annual pay' },
        { value: 'hourly', label: 'Hourly pay' },
      ],
      (v) => state.payBases.has(v),
      (v, checked) => {
        if (checked) state.payBases.add(v);
        else state.payBases.delete(v);
        invalidate();
      },
      true,
      '“Pay level” means gross annual pay and the corresponding gross hourly pay (Article 3(1)(b)). Choose one or both.',
    ),
    choice('annualPay', 'Annual pay of part-time and part-year workers', 'Needed for the annual basis. Recital 22 allows basing pay levels on actual pay.', [
      { value: 'actual', label: 'Actual pay received' },
      { value: 'full-time-equivalent', label: 'Scaled to full-time equivalent' },
    ]),
    choice('otherGender', 'Workers recorded as neither female nor male', 'The indicators compare female and male workers. Such workers are never shown as a group (recital 6).', [
      { value: 'reject', label: 'Treat as an error' },
      { value: 'exclude', label: 'Leave out of all indicators' },
      { value: 'include-in-totals', label: 'Count in quartile bands only' },
    ]),
    choice('complementaryGapPopulation', 'Who is compared for complementary or variable components', 'Indicators (b) and (d). The directive does not say.', [
      { value: 'recipients', label: 'Only workers who received them' },
      { value: 'all-workers', label: 'All workers, zero if none' },
    ]),
    choice('quartileMethod', 'Quartile pay bands', 'Four equal groups from lowest to highest pay (Article 3(1)(f)). The directive does not say how to split ties or remainders.', [
      { value: 'exact-equal-groups', label: 'Exactly equal groups', hint: 'shares ties in proportion' },
      { value: 'whole-workers-ties-together', label: 'Whole workers', hint: 'ties stay together' },
    ]),
    choice('duplicateWorkerRows', 'Repeated worker ids', 'For exports with one row per worker and month, add the rows up.', [
      { value: 'reject', label: 'Treat as an error' },
      { value: 'sum', label: 'Add the rows up' },
    ]),
  );
}

function stepDetails(): HTMLElement {
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'step5' },
    h('h2', { id: 'step5' }, h('span', { class: 'step' }, '5'), 'Report details'),
    h(
      'div',
      { class: 'grid2' },
      textField('Employer name (optional)', state.employer, (v) => {
        state.employer = v;
        invalidate();
      }),
      textField('Currency code, e.g. EUR (optional)', state.currency, (v) => {
        state.currency = v.trim().toUpperCase();
        invalidate();
      }, { maxlength: '3', autocomplete: 'off' }),
      textField('Report submission date YYYY-MM-DD (optional)', state.submissionDate, (v) => {
        state.submissionDate = v.trim();
        invalidate();
      }, { maxlength: '10', inputmode: 'numeric' }),
      textField('Minimum group size (default 5)', state.minimumGroupSize, (v) => {
        state.minimumGroupSize = v.trim();
        invalidate();
      }, { maxlength: '4', inputmode: 'numeric' }),
    ),
    h('p', { class: 'help' }, 'Figures for groups smaller than the minimum group size are withheld, so that no individual’s pay can be read or worked out from the report (Article 12).'),
  );
}

// ---------------------------------------------------------------- configuration

function rawConfig(): Record<string, unknown> {
  const c = state.columns;
  const female: string[] = [];
  const male: string[] = [];
  const other: string[] = [];
  for (const [value, group] of state.genderMap) (group === 'female' ? female : group === 'male' ? male : other).push(value);
  const minimum = /^[0-9]{1,4}$/.test(state.minimumGroupSize) ? Number(state.minimumGroupSize) : state.minimumGroupSize;
  return {
    version: 1,
    csv: { ...state.csv },
    columns: {
      workerId: c.workerId,
      gender: c.gender,
      basicPay: c.basicPay,
      complementaryPay: c.complementaryPay,
      ...(c.category === undefined ? {} : { category: c.category }),
      ...(c.hours === undefined ? {} : { hours: c.hours }),
      ...(c.fte === undefined ? {} : { fte: c.fte }),
      ...(c.period === undefined ? {} : { period: c.period }),
    },
    genderCodes: { female, male, other },
    otherGender: state.choices.otherGender,
    payBases: (['annual', 'hourly'] as const).filter((b) => state.payBases.has(b)),
    ...(state.payBases.has('annual') ? { annualPay: state.choices.annualPay } : {}),
    complementaryGapPopulation: state.choices.complementaryGapPopulation,
    quartileMethod: state.choices.quartileMethod,
    minimumGroupSize: minimum,
    duplicateWorkerRows: state.choices.duplicateWorkerRows ?? 'reject',
    ...(c.period === undefined ? {} : { referencePeriod: state.referencePeriod }),
    decimals: 2,
  };
}

async function onConfigFile(file: File, status: HTMLElement): Promise<void> {
  clear(status);
  if (file.size > MAX_CONFIG_BYTES) {
    status.append(message('error', 'The settings file is larger than 1 MB.'));
    return;
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()));
  } catch {
    status.append(message('error', 'The settings file is not valid JSON.'));
    return;
  }
  const result = validateConfig(json);
  if (!result.ok) {
    status.append(message('error', 'The settings file is not valid:', ...result.errors.slice(0, 20)));
    return;
  }
  const cfg = result.config;
  state.csv = {
    delimiter: cfg.csv.delimiter,
    decimalSeparator: cfg.csv.decimalSeparator,
    thousandsSeparator: cfg.csv.thousandsSeparator,
    encoding: cfg.csv.encoding,
  };
  state.columns = {
    workerId: cfg.columns.workerId,
    gender: cfg.columns.gender,
    category: cfg.columns.category,
    hours: cfg.columns.hours,
    fte: cfg.columns.fte,
    period: cfg.columns.period,
    basicPay: [...cfg.columns.basicPay],
    complementaryPay: [...cfg.columns.complementaryPay],
  };
  state.genderMap = new Map();
  for (const v of cfg.genderCodes.female) state.genderMap.set(v, 'female');
  for (const v of cfg.genderCodes.male) state.genderMap.set(v, 'male');
  for (const v of cfg.genderCodes.other) state.genderMap.set(v, 'other');
  state.payBases = new Set(cfg.payBases);
  state.choices = {
    annualPay: cfg.annualPay,
    otherGender: cfg.otherGender,
    complementaryGapPopulation: cfg.complementaryGapPopulation,
    quartileMethod: cfg.quartileMethod,
    duplicateWorkerRows: cfg.duplicateWorkerRows,
  };
  state.minimumGroupSize = String(cfg.minimumGroupSize);
  state.referencePeriod = cfg.referencePeriod ?? '';
  state.result = null;
  mount();
}

// ---------------------------------------------------------------- compute

function compute(): void {
  clear(computeStatus);
  clear(resultBody);
  clear(requestBody);
  resultSection.hidden = true;
  state.result = null;
  if (state.bytes === null) {
    computeStatus.append(message('error', 'Choose a payroll file first.'));
    return;
  }
  const config = validateConfig(rawConfig());
  if (!config.ok) {
    computeStatus.append(message('error', 'Some settings are missing or invalid:', ...config.errors.slice(0, 30)));
    return;
  }
  const loaded = loadDataset(state.bytes, config.config);
  if (!loaded.ok) {
    computeStatus.append(message('error', 'The payroll file has problems:', ...describeLoadFailure(loaded).slice(0, 50)));
    return;
  }
  let report: ReportV1;
  try {
    report = buildReport(loaded.dataset, config.config, {
      generatedAt: new Date().toISOString(),
      ...(state.employer.trim() === '' ? {} : { employer: state.employer.trim() }),
      ...(state.currency === '' ? {} : { currency: state.currency }),
      ...(state.submissionDate === '' ? {} : { submissionDate: state.submissionDate }),
    });
  } catch (error) {
    computeStatus.append(message('error', error instanceof RangeError ? error.message : 'The report could not be built.'));
    return;
  }
  state.result = { config: config.config, dataset: loaded.dataset, report };
  computeStatus.append(message('info', `Computed for ${loaded.dataset.summary.workers} workers. Results are below.`));
  renderResults();
}

function renderResults(): void {
  const result = state.result;
  if (result === null) return;
  const r = result.report;
  clear(resultBody);
  append(
    resultBody,
    h(
      'div',
      { class: 'actions' },
      button('Download Markdown', () => { download('evenkeel-report.md', renderMarkdown(r), 'text/markdown;charset=utf-8'); }),
      button('Download HTML', () => { download('evenkeel-report.html', renderHtml(r), 'text/html;charset=utf-8'); }),
      button('Download JSON', () => { download('evenkeel-report.json', renderJson(r), 'application/json'); }),
      button('Download CSV', () => { download('evenkeel-report.csv', renderCsv(r), 'text/csv;charset=utf-8'); }),
    ),
    h('div', { class: 'report' }, ...renderBlocks(reportBlocks(r).slice(1), 1)),
  );
  resultSection.hidden = false;
  renderRequest();
}

// ---------------------------------------------------------------- tools

function renderRequest(): void {
  clear(requestBody);
  const result = state.result;
  if (result === null) {
    requestBody.append(h('p', { class: 'muted' }, 'Compute the report first; the answer uses the same data and the same small-group protection.'));
    return;
  }
  let workerId = '';
  let requestDate = '';
  const out = h('div', { 'aria-live': 'polite' });
  const make = (): void => {
    clear(out);
    try {
      const indicators = computeIndicators(result.dataset, { ...result.config, suppressSmallGroups: true });
      const response = informationRequestResponse(result.dataset, indicators, workerId.trim(), {
        payBases: result.config.payBases,
        decimals: result.config.decimals,
        ...(result.config.annualPay === undefined ? {} : { annualPay: result.config.annualPay }),
        ...(requestDate.trim() === '' ? {} : { requestDate: requestDate.trim() }),
      });
      const options = { ...(state.employer.trim() === '' ? {} : { employer: state.employer.trim() }), ...(state.currency === '' ? {} : { currency: state.currency }) };
      append(
        out,
        h(
          'div',
          { class: 'actions' },
          button('Download Markdown', () => { download('evenkeel-information-request.md', renderInformationResponseMarkdown(response, options), 'text/markdown;charset=utf-8'); }),
          button('Download HTML', () => { download('evenkeel-information-request.html', renderInformationResponseHtml(response, options), 'text/html;charset=utf-8'); }),
        ),
        h('div', { class: 'report preview' }, ...renderBlocks(informationResponseBlocks(response, options), 1)),
      );
    } catch (error) {
      out.append(message('error', error instanceof RangeError ? error.message : 'The answer could not be built.'));
    }
  };
  append(
    requestBody,
    h(
      'div',
      { class: 'grid2' },
      textField('Worker id', workerId, (v) => {
        workerId = v;
      }, { autocomplete: 'off' }),
      textField('Request date YYYY-MM-DD (optional)', requestDate, (v) => {
        requestDate = v;
      }, { maxlength: '10', inputmode: 'numeric' }),
    ),
    h('div', { class: 'actions' }, button('Prepare answer', make, 'primary')),
    out,
  );
}

function toolSalaryRange(): HTMLElement {
  const values = { min: '', max: '', currency: 'EUR', agreement: '' };
  let period: PayPeriod | undefined;
  const out = h('div', { 'aria-live': 'polite' });
  const make = (): void => {
    clear(out);
    if (period === undefined) {
      out.append(message('error', 'Choose a period.'));
      return;
    }
    try {
      const text = salaryRangeText({
        minimum: values.min.trim(),
        currency: values.currency.trim().toUpperCase(),
        period,
        ...(values.max.trim() === '' ? {} : { maximum: values.max.trim() }),
        ...(values.agreement.trim() === '' ? {} : { collectiveAgreement: values.agreement }),
      });
      const box = h('p', { class: 'output' }, text);
      append(
        out,
        box,
        'clipboard' in navigator
          ? button('Copy text', () => {
              void navigator.clipboard.writeText(text);
            })
          : null,
      );
    } catch (error) {
      out.append(message('error', error instanceof RangeError ? error.message : 'Invalid input.'));
    }
  };
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'tool-range' },
    h('h2', { id: 'tool-range' }, 'Pay range for a job vacancy notice'),
    h('p', {}, 'Applicants have the right to the initial pay or its range, based on objective, gender-neutral criteria (', h('a', { href: articleUrl(5), target: '_blank', rel: 'noopener noreferrer' }, 'Article 5(1)'), '). Use “.” for decimals.'),
    h(
      'div',
      { class: 'grid2' },
      textField('Lowest amount, e.g. 3000', '', (v) => (values.min = v), { inputmode: 'decimal' }),
      textField('Highest amount (optional)', '', (v) => (values.max = v), { inputmode: 'decimal' }),
      textField('Currency code', 'EUR', (v) => (values.currency = v), { maxlength: '3' }),
      textField('Collective agreement (optional)', '', (v) => (values.agreement = v)),
    ),
    chipGroup<PayPeriod>(
      'Pay period',
      [
        { value: 'hour', label: 'Per hour' },
        { value: 'month', label: 'Per month' },
        { value: 'year', label: 'Per year' },
      ],
      () => false,
      (v) => {
        period = v;
      },
    ),
    h('div', { class: 'actions' }, button('Write the text', make, 'primary')),
    out,
  );
}

function toolObligations(): HTMLElement {
  let workers = '';
  let year = String(new Date().getFullYear());
  const out = h('div', { 'aria-live': 'polite' });
  const make = (): void => {
    clear(out);
    if (!/^[0-9]{1,9}$/.test(workers.trim()) || !/^[0-9]{4}$/.test(year.trim())) {
      out.append(message('error', 'Enter the number of workers and a four-digit year.'));
      return;
    }
    try {
      const o = reportingObligation(Number(workers.trim()), Number(year.trim()));
      const lines =
        o.frequencyYears === null
          ? ['No reporting duty under the directive: reporting is voluntary (Article 9(5)). National law may require it.']
          : [
              `${o.legalBasis}: reporting from ${o.firstReportingYear ?? ''}, every ${o.frequencyYears === 1 ? 'year' : 'three years'}, by 7 June.`,
              o.reportDueInYear ? `A report is due by ${o.deadline ?? ''}, covering calendar year ${o.referenceYear}.` : `No report is due in ${year.trim()} under the directive.`,
            ];
      out.append(message('info', ...lines, o.note));
    } catch (error) {
      out.append(message('error', error instanceof RangeError ? error.message : 'Invalid input.'));
    }
  };
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'tool-obligations' },
    h('h2', { id: 'tool-obligations' }, 'Who reports, and when'),
    h('p', {}, 'Reporting duties by employer size under ', h('a', { href: articleUrl(9), target: '_blank', rel: 'noopener noreferrer' }, 'Article 9(2)–(5)'), '.'),
    h(
      'div',
      { class: 'grid2' },
      textField('Number of workers', '', (v) => (workers = v), { inputmode: 'numeric', maxlength: '9' }),
      textField('Year', year, (v) => (year = v), { inputmode: 'numeric', maxlength: '4' }),
    ),
    h('div', { class: 'actions' }, button('Check', make, 'primary')),
    out,
  );
}

// ---------------------------------------------------------------- page

function mount(): void {
  clear(root);
  groupCounter = 0;
  const configStatus = h('div', { 'aria-live': 'polite' });
  append(
    root,
    h(
      'header',
      { class: 'top' },
      h('div', { class: 'brand' }, logo(), h('span', {}, 'Evenkeel')),
      h('h1', {}, 'Pay gap indicators under the EU Pay Transparency Directive'),
      h(
        'p',
        { class: 'lead' },
        'Compute the seven indicators of ',
        h('a', { href: articleUrl(9), target: '_blank', rel: 'noopener noreferrer' }, 'Article 9(1) of Directive (EU) 2023/970'),
        ' and the Article 10 joint pay assessment test from a payroll export.',
      ),
      h(
        'div',
        { class: 'privacy', role: 'note' },
        h('strong', {}, 'Your data stays on this computer.'),
        h(
          'span',
          {},
          ' This page has no server. Its security policy blocks every network connection, so the file you choose is read and processed only inside this browser tab. Close the tab to discard it.',
        ),
      ),
      h('div', { class: 'actions' }, fileButton('Load saved settings', '.json,application/json', (f) => void onConfigFile(f, configStatus))),
      configStatus,
    ),
    stepFile(),
    columnsSection,
    stepChoices(),
    stepDetails(),
    h(
      'div',
      { class: 'compute' },
      button('Compute indicators', compute, 'primary'),
      button('Save settings', () => { download('evenkeel.config.json', `${JSON.stringify(rawConfig(), null, 2)}\n`, 'application/json'); }),
      computeStatus,
    ),
    resultSection,
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'tool-request' },
      h('h2', { id: 'tool-request' }, 'Answer a worker’s information request'),
      h(
        'p',
        {},
        'Workers can ask for their pay level and the average pay levels, by sex, for their category of workers (',
        h('a', { href: articleUrl(7), target: '_blank', rel: 'noopener noreferrer' }, 'Article 7'),
        '). Answer within two months.',
      ),
      requestBody,
    ),
    toolSalaryRange(),
    toolObligations(),
    h(
      'footer',
      { class: 'footer' },
      h(
        'p',
        {},
        h('a', { href: ATTRIBUTION.url, target: '_blank', rel: 'noopener noreferrer' }, ATTRIBUTION.text),
        ` · version ${VERSION} · licensed under AGPL-3.0-only · `,
        h('a', { href: PROJECT_URL, target: '_blank', rel: 'noopener noreferrer' }, 'source code'),
      ),
      h(
        'p',
        {},
        'Not legal advice. This tool does not make anyone compliant; national law transposing ',
        h('a', { href: DIRECTIVE.url, target: '_blank', rel: 'noopener noreferrer' }, DIRECTIVE.shortTitle),
        ' may set further or different rules.',
      ),
    ),
  );
  resultSection.hidden = state.result === null;
  if (resultSection.childElementCount === 0) {
    append(resultSection, h('h2', { id: 'results-title' }, 'Results'), resultBody);
  }
  if (state.bytes !== null) parseLoaded();
  else renderColumns();
  renderRequest();
}

document.body.append(root);
mount();
