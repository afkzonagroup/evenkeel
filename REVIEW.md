# Review record

Two self-review passes, as required by the project standards. Each lists what
was checked, what was found and what was fixed. An independent review by the
coordinator follows.

State reviewed: version 0.1.0, 8 November 2026.

## Pass 1: correctness, law, edge cases, API, tests, security checklist

### Checked

**Against the official text** (EUR-Lex, OJ L 132, 17.5.2023; quotes in
docs/legal-basis.md):

- Article 3(1)(a)–(h) definitions: pay = basic + complementary or variable
  components; pay level = gross annual and corresponding gross hourly pay;
  gender pay gap as a percentage of the male average; median pay level;
  median gender pay gap; quartile pay band as four equal groups; category of
  workers set by the employer. Article 3 does not define "pay progression";
  recital 35 describes it. Noted in docs.
- Article 9(1)(a)–(g): all seven indicators implemented; (g) broken down by
  basic pay and complementary or variable components, plus total pay for
  Article 10.
- Article 9(2)–(4) dates and frequencies (2027 yearly for 250+; 2027 every
  three years for 150–249; 2031 every three years for 100–149) and 9(5)
  voluntary reporting; reference period is the previous calendar year.
- Article 10(1): 5 % "in any category", not justified, not remedied within
  six months; (b) and (c) are employer facts, so they are inputs.
- Article 5(1), 6(1), 7(1)–(6), 12, 34(1): helpers and documentation match the
  text; nothing claims compliance.
- Every point the directive leaves open is a setting without a default, or a
  documented fixed convention, and is listed in every report.

**Formulas and edge cases:** every formula has a hand-calculated test with
the working in comments and a shared vector; medians with odd and even
counts; quartile boundaries with ties and remainders (both methods); a tie
spanning all bands; zero-male, zero-female and zero-average cases; negative
gaps; the 5 % threshold tested exactly (5.00, 4.99, −5.00, 4.999 displayed as
5.00 but not met, and a case where floating point gives 4.999999999999991);
FTE and hourly bases; per-worker rounding; input-order independence.

**CSV and input:** RFC 4180 quoting, embedded line breaks, doubled quotes,
BOM, CRLF/LF/CR, blank lines, trailing delimiters, all four delimiters,
structural errors with line numbers, invalid UTF-8, Windows-1252, every
limit, oversized input rejected quickly, locale decimals and thousands
separators, row-level errors for every field.

**API:** public functions have TSDoc; README examples run as tests
(TypeScript and Python); JSON reports validate against
schema/report-v1.schema.json in tests.

**Security checklist (GOAL.md), line by line:** threat model (SECURITY.md);
validation at every boundary with size, length, type and allow-list checks;
no eval / new Function / dynamic import of input / child_process / HTML
sinks (lint + tests); web-component rules not applicable (the app is a page,
not a component; it runs under a stricter hash-based CSP than
`script-src 'self'`); server rules not applicable (no server); SSRF not
applicable (no network); personal data processed locally, minimal fields,
no telemetry, data flows documented (docs/privacy.md); files written with
mode 0600, never overwritten without `--force`, never through symlinks;
supply chain (zero runtime dependencies, lockfile, exact versions, `files`
allow-list, no install scripts, provenance-ready package.json); Dependabot.

**Performance:** 200,000 rows in about 2 s; 1,000,000 rows (50 MB, the
default limits) in about 13 s and 1.2 GB of memory on an M-series Mac.

**Offline app in a real browser** (Chromium, desktop 1280 px and phone
390 px, from file://): full flow from file choice to downloads, Article 5 and
7 tools; zero network requests; a `fetch` probe is blocked by CSP; an
`innerHTML` probe is blocked by Trusted Types; no horizontal overflow; same
figures as the CLI.

### Found and fixed

| # | Finding | Fix |
|---|---|---|
| 1 | Article 7 answers without a category column returned "not applicable" averages instead of failing, which would hide a configuration gap. | `informationRequestResponse()` now refuses without categories; test added. |
| 2 | The unsafe-character rule listed code point ranges and missed U+2028/U+2029, U+061C (bidirectional), U+00AD and U+200D. | Rule is now Unicode categories Cc, Cf, Zl, Zp in TypeScript and Python; terminal sanitiser likewise; tests added. |
| 3 | `parseDecimal` trimmed all Unicode whitespace, while its documentation and the Python implementation trimmed ASCII spaces only. | Both trim ASCII spaces only (the dataset layer trims cells before parsing); tests added. |
| 4 | In the app the technical default for repeated worker ids was applied but not visibly selected. | Shown as selected; open choices stay empty. |
| 5 | Python docstring claimed full parity with the TypeScript row rules; period filtering and summing rows are not implemented in Python. | Docstring corrected. |
| 6 | The report's Article 10 paragraph did not say the duty applies to employers subject to Article 9 reporting. | Wording added. |
| 7 | (During the build) Some source files contained literal invisible Unicode characters inside regular expressions instead of `\u` escapes. | Replaced with escapes; a test now rejects invisible and bidirectional characters in every tracked text file. |
| 8 | (During the build) The first Markdown renderer escaped every punctuation mark, also in fixed text, which made the raw Markdown hard to read. | Input data and fixed text are now separate in the document model: data is fully escaped, fixed text lightly escaped; tests cover links, autolinks, HTML and table cells. |

## Pass 2: security, with fresh eyes, as an attacker or hostile contributor

### Checked

- **Injection into every output:** CSV formulas (`=`, `+`, `-`, `@`, tab, CR,
  after leading whitespace, full-width forms), HTML (escaping, script-free
  page, CSP with style hash), Markdown (links, autolinks, HTML, table
  breaking), terminal escapes (ids, categories, error output, file paths).
- **Parser abuse:** every regular expression reviewed for catastrophic
  backtracking (all anchored and linear); deeply nested JSON in the config
  (caught as invalid JSON); `__proto__` and `constructor` as config keys,
  category names and template placeholders (Maps, `Object.hasOwn`, unknown
  keys rejected); `$&`-style replacement patterns in the pay-range template
  (function replacement, tested).
- **Inference of an individual's pay:** single-member groups, two-member
  groups, few bonus recipients in large groups, total minus basic, one
  withheld category plus the organisation total, withheld figures in
  Article 7 answers, other-gender counts.
- **Data exfiltration by changed code:** which browser APIs can reach the
  network despite `connect-src 'none'` (navigation, `window.open`, links,
  WebRTC, workers, EventSource) and how a hostile pull request could add one.
- **File system:** symlinks, FIFOs and devices, existing files, permissions.
- **Supply chain:** install scripts during development and CI, pinned action
  SHAs (verified against the upstream tags), dependency audit.

### Found and fixed

| # | Finding | Fix |
|---|---|---|
| 1 | App links accepted any https URL. A changed link could carry data to another host, and CSP cannot block navigation. | `isAllowedHref()` allows only the EUR-Lex article and recital anchors, the directive, attribution and project URLs, and blob: downloads; tests added. |
| 2 | Opening a FIFO or device path would block the CLI before the regular-file check. | Files are opened with `O_NONBLOCK`; a FIFO is rejected; test added. |
| 3 | Source and bundle checks did not cover EventSource, RTCPeerConnection, workers, `window.open`, `location` navigation, `require`, `child_process`, `worker_threads`, `document.cookie`. | Added to the source hygiene test and the built-app test, so CI fails if such code appears. |
| 4 | Development and CI installs ran dependency install scripts. | `.npmrc` sets `ignore-scripts=true` and CI uses `npm ci --ignore-scripts`; build and all tests verified to work this way. |
| 5 | Python `Settings.from_dict` raised `KeyError` for missing settings. | Raises `ValueError` with the missing names; test added. |

### Accepted, with reasons

- `npm audit` (including development dependencies) reports a moderate
  advisory in `minimatch` used by ESLint and typescript-eslint. It affects
  lint tooling only, is not shipped, and `npm audit --omit=dev` is clean.
- A `<meta>` Content Security Policy cannot set `frame-ancestors`. The app is
  a local file; framing by a remote site is not a realistic path.
- CSP cannot stop navigation-based exfiltration and some browsers do not
  apply `connect-src` to WebRTC. Mitigated by the link allow-list and by
  tests that forbid the relevant APIs in source and bundle.
- `O_NOFOLLOW` does not exist on Windows; there the symlink protection relies
  on the existence check without `--force`.
- Small-group protection covers one report; inference across several reports
  is documented as out of scope (docs/privacy.md).
- Memory use of about 1.2 GB at the default maximum of 1,000,000 rows.

## Results after both passes

- `npm run check`: typecheck, lint and 193 tests pass; coverage 99 % of lines
  on the library and CLI.
- Python: 12 test methods (including 17 hand-calculated and 3 generated
  vectors as subtests) pass with and without pandas.
- `npm audit --omit=dev`: 0 vulnerabilities.

## Independent review

A separate reviewer, who did not build the project, checked the code against
the law and attacked it. The claims above and in the README were not taken
on trust.

### Checked

- **Law, word by word.** The directive was fetched from the Publications
  Office (CELEX 32023L0970, English). Articles 1–12, 34 and 35 were read in
  full. All 71 quoted paragraphs in docs/legal-basis.md, including recitals
  6, 21, 22, 35, 43 and 44, match the official text exactly. Definitions in
  Article 3(1)(a)–(h), the formulas, the thresholds and dates of Article
  9(2)–(5), the Article 10(1) conditions and their mapping
  (justified/remedied → condition not met), Article 7(1)–(6) wording in the
  answer and the yearly notice, and Article 12 in the privacy rules match
  the code, the docs and the report text.
- **Recomputed by hand.** An independent script with exact fractions
  recomputed the sample report: (a) 24.85 % on both bases, (b) 45.36 %, (c)
  11.44 %, (d) 65.00 %, (e) 81.25 % / 95.00 %, (f) all four bands, and the
  total-pay gap per category (3.92, 5.17, 11.19, 10.47 %). All match the CLI.
- **Medians, quartiles, decimals.** Odd and even counts, ties across band
  boundaries, both quartile methods, rounding half away from zero, the exact
  5 % comparison.
- **TypeScript and Python agree** on 400 further randomised datasets built to
  hit edge cases (1 to 40 workers, ties, zero pay, amounts with six decimals,
  FTE down to 0.000001, every setting combination, category names with
  accents, full-width letters and characters outside the Basic Multilingual
  Plane): no difference. Row validation was compared separately.
- **Attacks.** CSV (quotes, doubled quotes, BOM, CR/LF/CRLF, huge fields,
  formula injection on export, regular expressions), CLI files (paths,
  symlinks, FIFOs, existing files, permissions), HTML and Markdown escaping,
  the CSPs, every way the offline app could send data (network APIs, links,
  forms, prefetch, fonts, images, refresh, `window.open`, `postMessage`),
  small-group suppression by differencing (categories against the
  organisation, total minus basic, bands, counts, Article 7 answers), and the
  Python package (no pickle, eval or file access).
- **Tests that fail when a control is removed.** 34 controls in TypeScript
  and 9 in Python were removed one at a time (escaping, formula guard, every
  suppression rule, the exact threshold, file flags and modes,
  unsafe-character rule, CSP entries, link allow-list, terminal sanitiser,
  row limits, rounding, median, quartile sorting, date clamping, config key
  check, duplicate ids). 40 of 43 failed the tests at once; the 3 that did
  not are findings 7 and 8 below, and they now fail. The controls added in
  this review were checked the same way.
- **README.** The quick start and the Python install were run in a fresh
  clone (deleted afterwards); both produce the documented output.
- **Publish gate.** Every commit is authored and committed by
  antonmacius-droid; no co-author or tool attribution lines in history or
  tracked files.

### Found and fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | The count of workers recorded as neither female nor male was withheld when small, but could be worked out as workers − female − male, or from rows used and rows read. With `include-in-totals`, the female and male shares of a quartile band added up to less than 100 % exactly in the band of such a worker, which showed that person's pay quartile. | When that group is smaller than the minimum, workers, rows read and rows used are withheld too, and the group is left out of the quartile bands; the report says so. Tests and a shared vector added. |
| 2 | Medium | Quartile band shares were shown even when there were fewer than the minimum female (or male) workers overall, so each woman's pay quartile could be read off the bands while every other figure about her was withheld. | Band shares are withheld when the female or male group in the bands is small. Tests and a shared vector added. |
| 3 | Low | Where small-group protection withheld the Article 10(1)(a) test, the report showed "withheld"/"unknown" without saying that the duty still applies. | The report adds a note: Article 10 applies whatever the group size; establish condition (a) from an internal report that is not distributed. Test added. |
| 4 | Low | A quoted field made of many doubled quotes was only measured after it ended, so the field limit did not bound memory (a 48 MB file took about 600 MB). | Doubled quotes count towards the limit while reading. Test added; it fails without the fix. |
| 5 | Low | TypeScript and Python counted id and category lengths differently (UTF-16 code units versus code points) and trimmed cells with different character sets (Python also removed U+001C–U+001F and U+0085 and kept U+FEFF), so the two could accept different files. | Python now counts UTF-16 code units and trims the same characters as JavaScript. Tests in both languages. |
| 6 | Low | Python `Settings` accepted `True` as a minimum group size or decimals, and any value as `suppress_small_groups`. | Rejected; tests added. |
| 7 | Low | Removing the small-band rule from the Python package, or a category whose few workers received nothing from secondary suppression in TypeScript, left all tests green. | Shared vectors `suppression-small-bands`, `suppression-secondary-zero-recipients` and a fourth generated vector (small categories, small "other" group) added; both now fail when removed. |
| 8 | Low | The test for narrowing permissions on `--force` overwrite never widened them first, so removing the `chmod` passed. | The test sets 0644 first; it now fails without the `chmod`. |
| 9 | Low | A report on one pay basis did not say that Article 3(1)(b) defines pay level as both annual and hourly pay. | The report adds a note when only one basis is configured. Test added. |
| 10 | Info | The app and HTML reports did not turn off DNS prefetching of their (fixed) links; the forbidden-API test did not list `postMessage`, service workers, `BroadcastChannel`, `SharedWorker` or `window.location`. | `x-dns-prefetch-control: off` added to both; forbidden list extended. |
| 11 | Info | `.gitignore` named a local tool directory. | Line removed; local excludes stay outside the repository. |

### Not changed, for the owner to decide

- **Article 7 answers for small groups.** Averages for a group below the
  minimum are withheld in the answer, as in the report. Article 7(1) gives
  the worker the right to them; Article 12(3) lets Member States restrict
  access, but only where national law says so. Withholding by default is the
  privacy-protective choice; a national rule may require the figures to be
  given to the worker or routed to representatives.
- **Joint pay assessment on withheld categories.** Condition (a) stays
  "withheld" rather than "met" in the distributed report, because "met"
  reveals whether one identifiable worker earns 5 % more or less than the
  others.
- **README sentence "The existing options are paid platforms and
  spreadsheets."** It is a market claim the code cannot support; keep or
  drop.

### Results after the independent review

- `npm run check`: typecheck, lint and 203 tests pass; coverage 99 % of
  lines.
- Python: 12 test methods (including 21 hand-calculated and 4 generated
  vectors as subtests) pass.
- `npm audit --omit=dev`: 0 vulnerabilities.
