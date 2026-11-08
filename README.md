# Evenkeel

Computes the pay-gap indicators of the EU Pay Transparency Directive from a
payroll export, on your own computer, and writes the reports.

Evenkeel reads a payroll CSV, checks every row, and computes the seven
indicators of Article 9(1) of Directive (EU) 2023/970, the Article 10 joint
pay assessment test per category of workers, and the related documents. It
runs as a command line tool, as a library (TypeScript and Python), and as an
offline web page that works from a file on your disk. Nothing is uploaded.

## Why

[Directive (EU) 2023/970](https://eur-lex.europa.eu/eli/dir/2023/970/oj)
requires employers with 100 or more workers to report on the pay gap between
female and male workers (Article 9). Member States had to transpose it by
7 June 2026 (Article 34).

| Workers | First report | Then | Legal basis |
|---|---|---|---|
| 250 or more | by 7 June 2027 | every year | [Art. 9(2)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_9) |
| 150–249 | by 7 June 2027 | every three years | Art. 9(3) |
| 100–149 | by 7 June 2031 | every three years | Art. 9(4) |
| fewer than 100 | voluntary, unless national law requires it | – | Art. 9(5) |

Each report covers the previous calendar year. Where a category of workers
shows a difference in average pay of at least 5 % that is neither justified
on objective, gender-neutral criteria nor remedied within six months, a joint
pay assessment with workers' representatives follows (Article 10).

The existing options are paid platforms and spreadsheets. Evenkeel is open
source, shows its formulas, and keeps pay data on your machine.

## Quick start

Requires Node.js 22 or later.

```sh
git clone https://github.com/afkzonagroup/evenkeel.git
cd evenkeel
npm ci
npm run build
node dist/cli/main.js report \
  --input examples/payroll-sample.csv \
  --config examples/evenkeel.config.json \
  --employer "Example Ltd" --currency EUR
```

This prints a Markdown report for the synthetic sample data. Once released
on npm, `npx @afkzona/evenkeel report …` does the same.

For your own data:

```sh
node dist/cli/main.js init --out evenkeel.config.json
# edit the column names and replace every "CHOOSE: …" value
node dist/cli/main.js validate --input payroll.csv --config evenkeel.config.json
node dist/cli/main.js report --input payroll.csv --config evenkeel.config.json \
  --format md,json,html,csv --out-dir reports/
```

## What it computes

| Directive | Output |
|---|---|
| [Art. 9(1)(a)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_9) | Gender pay gap: (male average − female average) ÷ male average × 100 |
| Art. 9(1)(b) | The same for complementary or variable components |
| Art. 9(1)(c) | Median gender pay gap |
| Art. 9(1)(d) | Median gap in complementary or variable components |
| Art. 9(1)(e) | Proportion of female and male workers receiving complementary or variable components |
| Art. 9(1)(f) | Proportion of female and male workers in each quartile pay band |
| Art. 9(1)(g) | Gap by category of workers, broken down by basic pay and complementary or variable components |
| [Art. 10(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_10) | 5 % test per category; conditions (b) and (c) as employer input; indicative six-month date |
| Art. 9(2)–(5) | Who reports and when (`evenkeel obligations`) |
| [Art. 5(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_5) | Pay range text for job vacancy notices (`evenkeel salary-range`) |
| [Art. 6(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_6) | Statement of pay setting and pay progression criteria |
| [Art. 7](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_7) | Answer to a worker's information request; yearly notice of the right |

Indicators are computed on gross annual pay, gross hourly pay, or both
(Article 3(1)(b)). Formulas, rounding and worked examples:
[docs/calculations.md](docs/calculations.md). Quoted legal text and the full
mapping: [docs/legal-basis.md](docs/legal-basis.md).

## Choices the directive leaves open

The directive does not settle everything. Evenkeel never chooses for you:
these settings have no default, and every report lists the choices made.

- `payBases`: annual pay, hourly pay or both.
- `annualPay`: actual pay, or scaled to full-time equivalent for part-time and
  part-year workers.
- `columns.complementaryPay` and `columns.hours`: which pay elements and which
  hours your export holds.
- `columns.category`: your categories of workers (Article 3(1)(h)).
- `otherGender`: how to treat workers recorded as neither female nor male.
- `complementaryGapPopulation`: compare only recipients, or all workers.
- `quartileMethod`: how to form four equal groups with ties and remainders.

Full reference: [docs/configuration.md](docs/configuration.md).

## Offline app

`npm run build` writes `dist/app/evenkeel.html`, one self-contained file.
Open it in a browser straight from disk; no server is needed. Choose the
payroll file, map the columns, make the choices, and download the reports.

The page's Content Security Policy sets `default-src 'none'` and
`connect-src 'none'`, so the browser itself blocks any network request. The
script and stylesheet are inline and allowed only by their SHA-256 hashes,
and, in browsers that support Trusted Types, HTML injection sinks are blocked. The page says at the top that data stays on the computer.

## Command line

| Command | Purpose |
|---|---|
| `evenkeel init` | Write a configuration template |
| `evenkeel validate` | Check a payroll file; list row errors with line numbers |
| `evenkeel report` | Write the report as `md`, `json`, `html` and/or `csv` |
| `evenkeel request --worker ID` | Answer an Article 7 information request |
| `evenkeel salary-range` | Pay range text for a job vacancy notice |
| `evenkeel obligations --workers N --year Y` | Reporting duty under Article 9(2)–(5) |

Exit codes: 0 success, 1 invalid data or configuration, 2 usage or file
error. Files are written with mode 0600 and never overwritten without
`--force`.

## Library (TypeScript)

```sh
npm install @afkzona/evenkeel
```

Zero runtime dependencies. ESM, Node.js 22 or later, and modern browsers.

<!-- example:library -->
```ts
import assert from 'node:assert/strict';
import { buildReport, loadDataset, renderMarkdown, validateConfig } from '@afkzona/evenkeel';

const config = validateConfig({
  version: 1,
  columns: { workerId: 'id', gender: 'gender', category: 'job', basicPay: ['basic'], complementaryPay: ['bonus'] },
  genderCodes: { female: ['F'], male: ['M'] },
  otherGender: 'exclude',
  payBases: ['annual'],
  annualPay: 'actual',
  complementaryGapPopulation: 'recipients',
  quartileMethod: 'exact-equal-groups',
  minimumGroupSize: 1,
});
if (!config.ok) throw new Error(config.errors.join('\n'));

const csv = 'id,gender,job,basic,bonus\n1,F,A,30000,0\n2,F,A,40000,0\n3,M,A,50000,0\n4,M,A,50000,0\n';
const loaded = loadDataset(new TextEncoder().encode(csv), config.config);
if (!loaded.ok) throw new Error('invalid payroll file');

const report = buildReport(loaded.dataset, config.config, { generatedAt: '2027-03-01' });
// (50000 − 35000) ÷ 50000 × 100 = 30.00
assert.deepEqual(report.indicators.bases[0]?.genderPayGap.gap, { status: 'ok', value: '30.00' });
assert.equal(report.jointPayAssessment.thresholdMetIn[0], 'A');
assert.match(renderMarkdown(report), /Evenkeel by AFKzona Group/);
```

<!-- example:helpers -->
```ts
import assert from 'node:assert/strict';
import { reportingObligation, salaryRangeText } from '@afkzona/evenkeel';

assert.equal(
  salaryRangeText({ minimum: '3000', maximum: '3600', currency: 'EUR', period: 'month' }),
  'Pay range: EUR 3,000.00 – 3,600.00 gross per month.',
);
assert.equal(reportingObligation(180, 2030).deadline, '2030-06-07');
assert.equal(reportingObligation(180, 2029).reportDueInYear, false);
```

Main entry points: `validateConfig`, `loadDataset`, `computeIndicators`,
`buildReport`, `renderMarkdown`, `renderHtml`, `renderJson`, `renderCsv`,
`assessJointPayAssessment`, `informationRequestResponse`,
`renderInformationResponseMarkdown`, `salaryRangeText`,
`payCriteriaStatement`, `annualInformationNotice`, `reportingObligation`.
All are documented with TSDoc in `src/`. The JSON report follows
[`schema/report-v1.schema.json`](schema/report-v1.schema.json).

## Python package

`python/` holds a Python implementation of the same formulas, for data teams
that work in Python. It has no dependencies; pandas is an optional extra.

```sh
pip install ./python            # or, once released: pip install evenkeel
pip install "./python[pandas]"  # with the DataFrame adapter
```

<!-- example:python -->
```python
from evenkeel import Settings, Worker, compute_indicators

workers = [
    Worker.from_strings("1", "female", "30000"),
    Worker.from_strings("2", "female", "40000"),
    Worker.from_strings("3", "male", "50000"),
    Worker.from_strings("4", "male", "50000"),
]
settings = Settings(pay_bases=("annual",), annual_pay="actual",
                    complementary_gap_population="recipients",
                    quartile_method="exact-equal-groups", other_gender="exclude",
                    minimum_group_size=1)
result = compute_indicators(workers, settings)
assert result["bases"][0]["genderPayGap"]["gap"] == {"status": "ok", "value": "30.00"}
```

With pandas, read the export with `dtype=str` so amounts stay exact, then use
`workers_from_dataframe(df, Columns(...), GenderCodes(...), "exclude")`.

Both implementations are checked against the same JSON test vectors in
[`test-vectors/`](test-vectors): hand-calculated cases for every formula, and
generated cross-check cases that must match to the last digit.

## Column-mapping templates

[`templates/column-mappings/`](templates/column-mappings) has example
configurations for common export layouts (one row per worker, monthly rows,
semicolon and decimal comma, hourly only). They are examples only: verify
them against your own export.

## Privacy

Pay data is personal data. Evenkeel processes it locally and has no network
code. Reports hold aggregates only. Figures for groups smaller than
`minimumGroupSize` (default 5) are withheld, and further figures are withheld
where a withheld one could be worked out by subtraction. Rationale, rules and
limits: [docs/privacy.md](docs/privacy.md).

## Limitations

- Evenkeel computes figures from the data you give it. It does not check that
  your categories of workers are based on objective, gender-neutral criteria
  (Article 4(4)), that your export contains all elements of pay, or that the
  right workers are included.
- It does not assess whether a pay difference is justified, and it does not
  carry out a joint pay assessment.
- It follows the directive. National transposition laws may require other
  formulas, deadlines, thresholds, formats or submission channels; check them.
- It does not submit reports to any authority.
- The Article 5, 6 and 7 helpers produce English text. A custom template is
  possible for the pay range text; other wording is yours to translate.
- Dates for "within two months" and "within six months" are indicative.

## Security

See [SECURITY.md](SECURITY.md) for the threat model and how to report a
vulnerability privately.

## Dependencies

Runtime: **none**. The library, CLI and offline app use only the JavaScript
standard library and Node.js built-ins (`node:fs`, `node:util`, `node:crypto`
in the build only). The Python package has no runtime dependencies; `pandas`
is an optional extra for the DataFrame adapter.

Development only (exact versions in `package-lock.json`): `typescript`
(compiler), `eslint`, `@eslint/js` and `typescript-eslint` (lint), `vitest`
and `@vitest/coverage-v8` (tests and coverage), `esbuild` (bundles the
offline app into one file), `ajv` (checks reports against the JSON Schema in
tests), `@types/node` (types).

## Licence and Enterprise

Evenkeel is licensed under the [GNU AGPL v3](LICENSE) (AGPL-3.0-only) with
an attribution term under section 7(b): interfaces and generated reports keep
the notice "Evenkeel by AFKzona Group" with its link
([LICENSE-ADDITIONAL-TERMS.md](LICENSE-ADDITIONAL-TERMS.md)).

A commercial licence without the AGPL obligations is available
([COMMERCIAL.md](COMMERCIAL.md)). It also covers the **Enterprise** offering
from AFKzona Group, which is not part of this repository: hosted dashboard,
continuous monitoring across entities and countries, SSO/SAML, roles and
permissions, audit evidence packs, a legal-update feed on national
transposition, white-label reports, and SLA-backed support. Contact
info@afkzonagroup.lt.

"Evenkeel" is a trademark of MB AFKzona Group; forks must use another name
([TRADEMARKS.md](TRADEMARKS.md)).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md); pull
requests need the [Contributor Licence Agreement](CLA.md). Please follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Disclaimer

Evenkeel is software, not legal advice. Using it does not make an employer
compliant with Directive (EU) 2023/970 or with national law. Check the
national rules that apply to you and take advice where needed.

---

Maintained by AFKzona Group.
