# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories:
<https://github.com/afkzonagroup/evenkeel/security/advisories/new>. Do not open
a public issue. If you cannot use GitHub, email info@afkzonagroup.lt.

Include the version, what you did, what happened, and a minimal example
**without real pay data**. We aim to acknowledge reports within five working
days and to agree a disclosure date with you.

Supported versions: the latest release.

## Threat model

### Assets

- **Pay data**: worker ids, gender, category, pay amounts, hours, FTE. Personal
  data; gender codes can include special categories of personal data.
- **Reports**: aggregates that the employer publishes, gives to workers or
  sends to authorities. Their correctness matters legally.
- **The user's machine**: files the CLI may read or write; the terminal.

### Actors

- The **employer's analyst** who runs Evenkeel (trusted, may make mistakes).
- **Readers of reports** (workers, representatives, the public): may try to
  infer an individual's pay from published figures.
- A **hostile data source**: a payroll export can contain crafted values,
  for example in category names or worker ids (exports pass through many
  hands and systems).
- A **hostile contributor** proposing code changes.
- A **network attacker** (relevant only if code tried to use the network).

### Trust boundaries

1. CSV input and configuration JSON → parser and validator.
2. Validated data → generated reports opened in spreadsheet programs,
   browsers, Markdown renderers and terminals.
3. The offline app page ↔ the network.
4. Command line arguments → the file system.
5. Contributions → the released package.

### Mitigations

| Threat | Mitigation | Test |
|---|---|---|
| Oversized input (memory or CPU exhaustion) | Byte limit checked on the open file before reading; character, row, field-count and field-length limits while parsing; hard upper bounds on configurable limits | `csv.test.ts`, `cli.test.ts` |
| Malformed CSV read as something else | Strict RFC 4180 parser; structural errors stop with a line number; invalid UTF-8 is rejected, never replaced | `csv.test.ts` |
| Mis-parsed numbers (e.g. `1,234` read as 1.234) | Strict decimal grammar; thousands separators only when configured and in groups of three; no exponents | `decimal.test.ts`, `dataset.test.ts` |
| Silent wrong figures | Any row error rejects the whole input; unknown gender codes are errors; exact arithmetic; unknown configuration keys are errors | `dataset.test.ts`, `config.test.ts`, `indicators.test.ts` |
| Formula (CSV) injection in exported CSV | Cells starting with `=`, `+`, `-`, `@`, tab or CR (also after whitespace, also full-width forms) are prefixed with `'`; plain numbers untouched | `escape.test.ts`, `report.test.ts` |
| HTML/script injection in HTML reports | All text escaped; no scripts; CSP `default-src 'none'` with the stylesheet allowed only by hash | `report.test.ts` |
| Markdown injection (links, HTML, table breakage) | Input data has every ASCII punctuation character backslash-escaped | `escape.test.ts`, `report.test.ts` |
| Terminal escape injection | Control, zero-width and bidirectional characters rejected in ids, categories and names; error output sanitised; excerpts escaped | `dataset.test.ts`, `cli.test.ts` |
| Pay data leaving the machine | No network code (checked); offline app CSP `connect-src 'none'` and `default-src 'none'`; no telemetry; no browser storage | `source-hygiene.test.ts`, `app-build.test.ts` |
| Script injection in the offline app | DOM built with `createElement`/`textContent` only; attribute allow-list; `href` limited to https:, blob: and fragments; script and style allowed only by SHA-256; Trusted Types required | `app-build.test.ts`, lint rules |
| Disclosure of an individual's pay through reports | Minimum group size; few-recipient rule; secondary suppression; quartile band shares withheld when a female, male or other group is small; derivable totals withheld with a small other count; Article 7 answers use the same withheld figures; internal mode clearly marked | `suppression.test.ts`, `report.test.ts`, `helpers-art5-7.test.ts` |
| File overwrite or symlink attacks | Files created with mode 0600; `O_EXCL` without `--force`; `O_NOFOLLOW`; only paths named by the user; output file names in `--out-dir` are fixed | `cli.test.ts` |
| Information leakage in errors | No stack traces; amounts never echoed; only short escaped excerpts of codes | `cli.test.ts`, `dataset.test.ts` |
| Prototype pollution via configuration | Only known keys are read; `__proto__` is rejected as unknown; lookups use `Map` and `Object.hasOwn` | `config.test.ts`, `helpers-art5-7.test.ts` |
| Code execution | No `eval`, `new Function`, dynamic `import()` of input, or child processes in `src/` (checked by tests and lint) | `source-hygiene.test.ts` |
| Trojan Source (hidden Unicode in code) | Tests reject invisible and bidirectional control characters in all code files | `source-hygiene.test.ts` |
| Supply chain | Zero runtime dependencies; exact dev dependency versions; committed lockfile; `files` allow-list; no install scripts; CI actions pinned by SHA with read-only permissions | `source-hygiene.test.ts` |

### Data flows

See [docs/privacy.md](docs/privacy.md). In short: input files are read only
from paths you give; outputs go only to paths you give or to standard output;
the offline app processes everything inside the browser tab.

### Out of scope

- Protecting data on a compromised machine or browser.
- Inference across several reports (for example different years).
- The correctness of the employer's data and category definitions.
