# Configuration

The CLI and the offline app read the same JSON configuration (schema:
[`schema/config-v1.schema.json`](../schema/config-v1.schema.json)). The library
validates it with `validateConfig()`; unknown keys are errors. `evenkeel init`
writes a template.

Settings marked **open choice** have no default because the directive leaves
them to Member States or employers. Evenkeel refuses to run until you choose,
and every report lists the choices.

## Settings

| Setting | Required | Default | Meaning |
|---|---|---|---|
| `version` | yes | – | Always `1`. |
| `description` | no | – | Free-text note. |
| `csv.delimiter` | no | `","` | `,` `;` tab or `|`. |
| `csv.decimalSeparator` | no | `"."` | `.` or `,`. |
| `csv.thousandsSeparator` | no | `"none"` | `none`, space, `.`, `,` or `'`. With `none`, grouped numbers are errors, never guessed. A space also accepts no-break spaces. |
| `csv.encoding` | no | `"utf-8"` | `utf-8` or `windows-1252`. Invalid bytes are errors. |
| `csv.maxBytes` | no | 52428800 (50 MiB) | Largest input file. Hard limit 512 MiB. |
| `csv.maxRows` | no | 1000000 | Most data rows. Hard limit 5 000 000. |
| `columns.workerId` | yes | – | Worker identifier. Use pseudonymous ids. |
| `columns.gender` | yes | – | Recorded gender code. |
| `columns.category` | no | – | **Open choice.** Category of workers (Article 3(1)(h)). Without it, indicator (g) and the Article 10 test are not computed. |
| `columns.basicPay` | yes | – | One or more columns added up as basic pay. |
| `columns.complementaryPay` | yes | – | **Open choice.** Zero or more columns added up as complementary or variable components. |
| `columns.hours` | for hourly | – | **Open choice.** Hours the pay relates to (for example paid hours). |
| `columns.fte` | for FTE | – | Full-time equivalent fraction, above 0 and at most 1. |
| `columns.period` | no | – | Period of each row; rows with another value than `referencePeriod` are left out and counted. |
| `genderCodes.female`, `.male`, `.other` | yes (`other` may be empty) | – | Codes as written in the export, matched ignoring case. A value in no list is an error, so a typo can never move a worker into the wrong group. |
| `otherGender` | yes | – | **Open choice.** `reject`: rows with an `other` code are errors. `exclude`: left out of all indicators. `include-in-totals`: counted in quartile bands only (band sizes cover all workers); with small-group protection on, a group smaller than `minimumGroupSize` is left out of the bands instead (see [privacy.md](privacy.md)). Never shown as a separate group. |
| `payBases` | yes | – | **Open choice.** `["annual"]`, `["hourly"]` or both. Article 3(1)(b) defines pay level as both. |
| `annualPay` | for annual | – | **Open choice.** `actual` or `full-time-equivalent`. |
| `complementaryGapPopulation` | yes | – | **Open choice.** `recipients` or `all-workers` (zero for non-recipients). |
| `quartileMethod` | yes | – | **Open choice.** `exact-equal-groups` or `whole-workers-ties-together`; see [calculations.md](calculations.md). |
| `minimumGroupSize` | no | 5 | Smallest group whose figures are shown; see [privacy.md](privacy.md). |
| `duplicateWorkerRows` | no | `"reject"` | `reject` or `sum` (for one row per worker and month). With `sum`, gender, category and FTE must match. |
| `referencePeriod` | with `columns.period` | – | Expected period value, for example `"2026"`. |
| `decimals` | no | 2 | Digits after the point in reports (0–6). |

## Report options (CLI flags)

| Flag | Meaning |
|---|---|
| `--employer` | Name shown in the report title. |
| `--currency` | ISO 4217 code used to label amounts. |
| `--generated-at` | Timestamp to record, for reproducible output. |
| `--submission-date` | Date the report is submitted; gives the indicative end of the six-month period of Article 10(1)(c). |
| `--no-suppression` | Turns small-group protection off. Internal use only; the report is marked INTERNAL. |

## Choices fixed by Evenkeel

These are documented conventions, not settings:

- Median of an even count: the midpoint of the two middle values.
- Article 10(1)(a): absolute difference as a percentage of the male average,
  met on either basis.
- Rounding: half away from zero, for display only.
- Negative amounts are rejected; net corrections into period totals first.
- "Receiving" complementary components means an amount above zero.
- Time periods ("within two months", "within six months"): same calendar day,
  clamped to the end of a shorter month, marked indicative.
