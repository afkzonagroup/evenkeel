# Contributing

Thank you for helping. Evenkeel handles personal data and legal reporting, so
correctness and security come first.

## Before you start

- Open an issue to discuss larger changes.
- Pull requests require the [Contributor Licence Agreement](CLA.md). Add the
  signature line from CLA.md to your first pull request.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Never put real pay data in issues, tests or fixtures. Use synthetic data.

## Development

```sh
npm ci
npm run check        # typecheck + lint + tests with coverage
npm run build        # library, CLI and dist/app/evenkeel.html
```

Python package:

```sh
cd python
python3 -m venv .venv
.venv/bin/pip install ".[pandas]"
cd tests && ../.venv/bin/python -I -m unittest discover -s .
```

## Rules

- TypeScript strict mode, no `any`, no `@ts-ignore`; `eslint-disable` only
  with a written reason.
- No runtime dependencies.
- Every formula change needs a hand-calculated test with the working in
  comments, and a vector in `test-vectors/indicators.json` that both the
  TypeScript and Python implementations pass.
- If results change on purpose, regenerate the cross-check vectors with
  `npm run build && node scripts/generate-vectors.mjs` and explain why in the
  pull request.
- Every security control needs a test that fails when the control is
  removed.
- Cite the article of Directive (EU) 2023/970 for anything that implements
  the law, quoting the official EUR-Lex text. Do not rely on secondary
  sources for what the law says.
- Where the directive leaves a point open, add a configuration setting
  without a default; do not choose silently.
- Keep the attribution "Evenkeel by AFKzona Group" in interfaces and reports
  (LICENSE-ADDITIONAL-TERMS.md).
- Update CHANGELOG.md.
