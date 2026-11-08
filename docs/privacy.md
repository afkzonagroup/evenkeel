# Privacy and small-group protection

Pay data is personal data. Article 12 of the directive requires processing in
line with the GDPR, limits use to the principle of equal pay, and lets Member
States restrict access where information "would lead to the disclosure,
either directly or indirectly, of the pay of an identifiable worker"
(Article 12(3)). Recital 44 asks for "specific safeguards … to prevent the
direct or indirect disclosure of information of an identifiable worker".

## Data flows

- **Library and CLI:** read the files you name, write the files you name (mode
  0600, never overwriting without `--force`, never through a symbolic link
  at the target path),
  or standard output. No network code, no telemetry, no temporary files.
- **Offline app:** one HTML file opened from disk. Its Content Security Policy
  sets `connect-src 'none'` (and `default-src 'none'`), so the browser blocks
  every network request the page could make. Files are read with the File
  API; results leave only as downloads you start. Nothing is stored in the
  browser.
- **Reports** hold aggregates only: no worker ids and no individual pay.
  The Article 7 answer holds the requesting worker's own pay level.

## Minimum group size (default 5)

A figure about a group is shown only if the group has at least
`minimumGroupSize` workers. Why 5:

- With 1 worker, an average is that worker's pay.
- With 2, each worker can work out the other's pay from the average and their
  own pay.
- With 3 or 4, one worker alone cannot work out another's pay, but two or
  three colleagues who share their pay can work out the rest.
- 5 adds a margin against such small coalitions while keeping most
  categories of an employer with 100 or more workers reportable.

This is a judgement, not a rule from the directive. Choose a higher value if
your categories are small or your national rules ask for it.

Values below 3 are allowed (national rules may differ) but the report then
carries a warning.

## Rules

1. **Primary suppression.** Averages, medians, gaps and the proportion of
   recipients are withheld for any group below the minimum. Quartile band
   proportions are withheld when a band holds fewer workers than the minimum,
   and in every band when fewer than the minimum female (or male) workers are
   in the bands: the shares would show which band each of them is in.
   Counts of workers are shown: they are not pay.
2. **Few recipients.** If 1 to minimum − 1 workers in a group received
   complementary or variable components, figures on those components are
   withheld even when the group is large: the group average times the
   group size would reveal their amounts. In a category, basic pay is then
   withheld too, because total − basic would reveal the same amounts.
3. **Secondary suppression.** Organisation-wide figures are published. If
   only one category had a withheld figure, it could be derived by
   subtraction. So, per sex, further categories are withheld (smallest first,
   then by name) until the withheld set has at least two categories and
   together at least the minimum number of workers (or recipients).
4. **Article 10 test.** Where the category gap is withheld, the threshold
   result is "withheld" too, and the report says that Article 10 applies
   whatever the group size. Employers and workers' representatives establish
   condition (a) for those categories from an internal report
   (`--no-suppression`), marked INTERNAL, that is not distributed.
5. **Article 7 answers** use the same withheld figures, so an answer plus the
   published report cannot reveal what the report withholds. The answer says
   that, depending on national law (Article 12(3)), the information may be
   available through workers' representatives, the labour inspectorate or
   the equality body.
6. **Workers recorded as neither female nor male** are never reported as a
   group. When fewer than the minimum, their count is withheld, and so are
   the totals it could be worked out from (rows read, rows used, workers).
   With `include-in-totals` they are then left out of the quartile pay bands,
   because the female and male shares of a band would show which band they
   are in; the report says so.

## Limits of this protection

- It protects one report. Comparing reports for different years, or for
  overlapping sets of workers, can still reveal information.
- Medians of odd-sized groups are, by definition, one worker's pay level.
  The directive requires medians; which worker it is stays unknown.
- Small-group protection does not replace a data protection impact
  assessment or your national rules on access to pay information.
