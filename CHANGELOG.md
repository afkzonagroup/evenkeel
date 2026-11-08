# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-11-08

### Fixed

- Decimal parsing trims surrounding spaces in linear time (#18).

### Changed

- Dependabot groups minor and patch updates and ignores major versions (#17).
- Release workflow skips versions already on npm.

## [0.1.0] - 2026-11-08

### Added

- Core library (zero runtime dependencies): strict RFC 4180 CSV reader with
  size, row, field and length limits; typed column mapping; row-level
  validation; exact decimal arithmetic.
- The seven indicators of Article 9(1)(a)–(g) of Directive (EU) 2023/970 on
  the annual and hourly pay bases, with two documented quartile methods.
- Article 10(1) joint pay assessment test per category of workers, with the
  indicative six-month remedy date.
- Small-group protection with primary, few-recipient and secondary
  suppression, covering quartile pay bands and workers recorded as neither
  female nor male.
- Helpers for Article 5(1) (pay range text), Article 6(1) (pay criteria
  statement), Article 7 (answer to an information request), Article 7(3)
  (yearly notice) and Article 9(2)–(5) (who reports and when).
- Reports in Markdown, JSON (schema version 1.0.0), self-contained HTML and
  CSV with formula-injection protection.
- `evenkeel` command line tool.
- Offline single-page app in one HTML file with a strict Content Security
  Policy that blocks all network access.
- Python package `evenkeel` with the same formulas, an optional pandas
  adapter, and shared JSON test vectors used by both implementations.
- Example column-mapping templates for HR exports.

[Unreleased]: https://github.com/afkzonagroup/evenkeel/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/afkzonagroup/evenkeel/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/afkzonagroup/evenkeel/releases/tag/v0.1.0
