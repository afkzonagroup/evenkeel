# evenkeel (Python)

Pay-gap indicators of the EU Pay Transparency Directive, Directive (EU)
2023/970, computed locally. This is the Python implementation of the same
formulas as the Evenkeel TypeScript package; both are tested against the
shared vectors in `test-vectors/`.

```sh
pip install evenkeel            # no dependencies
pip install "evenkeel[pandas]"  # adds the DataFrame adapter
```

```python
from evenkeel import Settings, Worker, compute_indicators

workers = [Worker.from_strings("1", "female", "30000"), Worker.from_strings("2", "male", "50000")]
settings = Settings(pay_bases=("annual",), annual_pay="actual",
                    complementary_gap_population="recipients",
                    quartile_method="exact-equal-groups", other_gender="exclude",
                    minimum_group_size=1)
print(compute_indicators(workers, settings)["bases"][0]["genderPayGap"]["gap"])
# {'status': 'ok', 'value': '40.00'}
```

With pandas, read files with `dtype=str` so amounts stay exactly as written,
then call `workers_from_dataframe(df, Columns(...), GenderCodes(...), "exclude")`.

The settings that the directive leaves open have no defaults. See the main
README and `docs/` of the repository for formulas, privacy rules and
limitations.

Licence: AGPL-3.0-only with an attribution term (LICENSE-ADDITIONAL-TERMS.md).
Commercial licence: info@afkzonagroup.lt. Not legal advice.
Evenkeel by AFKzona Group – https://afkzonagroup.lt
