# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Article 9(1)(a)-(g) indicators and the Article 10(1)(a) threshold of
Directive (EU) 2023/970, identical to src/core/indicators.ts.

The result is a plain ``dict`` with the same structure and key names as the
TypeScript ``Indicators`` object and the JSON report, so both implementations
can be checked against the shared vectors in ``test-vectors/``.

Gender pay gap = (male average - female average) / male average x 100
(Article 3(1)(c)); the median gap uses medians (Article 3(1)(e)).
"""

from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from typing import Any, Iterable, Literal, Optional, Sequence

from .fixed import SCALE, divide_fixed, format_fraction, parse_decimal

Gender = Literal["female", "male", "other"]
PayBasis = Literal["annual", "hourly"]

THRESHOLD_PERCENT = Fraction(5)
HUNDRED = Fraction(100)

_PAY_BASES = ("annual", "hourly")
_ANNUAL = ("actual", "full-time-equivalent")
_POPULATIONS = ("recipients", "all-workers")
_QUARTILES = ("exact-equal-groups", "whole-workers-ties-together")
_OTHER = ("reject", "exclude", "include-in-totals")


@dataclass(frozen=True)
class Worker:
    """One worker for the reference period. Amounts are fixed values (10^-12 units)."""

    id: str
    gender: Gender
    category: Optional[str]
    basic: int
    complementary: int
    hours: Optional[int] = None
    fte: Optional[int] = None

    @staticmethod
    def from_strings(
        id: str,
        gender: Gender,
        basic: str,
        complementary: str = "0",
        category: Optional[str] = None,
        hours: Optional[str] = None,
        fte: Optional[str] = None,
    ) -> "Worker":
        """Build a worker from decimal strings with '.' as decimal separator."""
        if gender not in ("female", "male", "other"):
            raise ValueError("gender must be 'female', 'male' or 'other'")
        return Worker(
            id=id,
            gender=gender,
            category=category,
            basic=parse_decimal(basic),
            complementary=parse_decimal(complementary),
            hours=None if hours is None else parse_decimal(hours),
            fte=None if fte is None else parse_decimal(fte),
        )


@dataclass(frozen=True)
class Settings:
    """Settings that change a result. See docs/configuration.md."""

    pay_bases: Sequence[PayBasis]
    complementary_gap_population: str
    quartile_method: str
    other_gender: str
    annual_pay: Optional[str] = None
    minimum_group_size: int = 5
    decimals: int = 2
    suppress_small_groups: bool = True

    def __post_init__(self) -> None:
        if not self.pay_bases or any(b not in _PAY_BASES for b in self.pay_bases) or len(set(self.pay_bases)) != len(self.pay_bases):
            raise ValueError("pay_bases must list 'annual' and/or 'hourly' once each")
        if "annual" in self.pay_bases and self.annual_pay not in _ANNUAL:
            raise ValueError("annual_pay must be 'actual' or 'full-time-equivalent' for the annual basis")
        if self.complementary_gap_population not in _POPULATIONS:
            raise ValueError("complementary_gap_population must be 'recipients' or 'all-workers'")
        if self.quartile_method not in _QUARTILES:
            raise ValueError("quartile_method must be 'exact-equal-groups' or 'whole-workers-ties-together'")
        if self.other_gender not in _OTHER:
            raise ValueError("other_gender must be 'reject', 'exclude' or 'include-in-totals'")
        # bool is a subclass of int in Python; True must not pass as 1.
        if isinstance(self.minimum_group_size, bool) or not isinstance(self.minimum_group_size, int) or not 1 <= self.minimum_group_size <= 1000:
            raise ValueError("minimum_group_size must be an integer from 1 to 1000")
        if isinstance(self.decimals, bool) or not isinstance(self.decimals, int) or not 0 <= self.decimals <= 6:
            raise ValueError("decimals must be an integer from 0 to 6")
        if not isinstance(self.suppress_small_groups, bool):
            raise ValueError("suppress_small_groups must be True or False")

    @staticmethod
    def from_dict(d: dict) -> "Settings":
        """Build settings from the camelCase form used in test vectors and JSON."""
        known = {"payBases", "annualPay", "complementaryGapPopulation", "quartileMethod", "minimumGroupSize", "otherGender", "decimals", "suppressSmallGroups"}
        unknown = set(d) - known
        if unknown:
            raise ValueError(f"unknown settings: {sorted(unknown)}")
        missing = {"payBases", "complementaryGapPopulation", "quartileMethod", "otherGender"} - set(d)
        if missing:
            raise ValueError(f"missing settings: {sorted(missing)}")
        return Settings(
            pay_bases=tuple(d["payBases"]),
            annual_pay=d.get("annualPay"),
            complementary_gap_population=d["complementaryGapPopulation"],
            quartile_method=d["quartileMethod"],
            minimum_group_size=d.get("minimumGroupSize", 5),
            other_gender=d["otherGender"],
            decimals=d.get("decimals", 2),
            suppress_small_groups=d.get("suppressSmallGroups", True),
        )


@dataclass(frozen=True)
class _Levels:
    gender: Gender
    category: Optional[str]
    basic: int
    complementary: int
    total: int
    receives: bool


@dataclass(frozen=True)
class _Stats:
    n: int
    value: Optional[Fraction]
    hidden: Optional[str]
    empty: str


def pay_levels(worker: Worker, basis: str, annual_pay: Optional[str]) -> _Levels:
    """Pay level of one worker on one basis (Article 3(1)(b))."""
    divisor: Optional[int] = None
    if basis == "hourly":
        if worker.hours is None or worker.hours <= 0:
            raise ValueError(f"worker {worker.id} has no hours")
        divisor = worker.hours
    elif annual_pay == "full-time-equivalent":
        if worker.fte is None or worker.fte <= 0:
            raise ValueError(f"worker {worker.id} has no full-time equivalent")
        divisor = worker.fte
    elif annual_pay is None:
        raise ValueError("annual_pay must be set for the annual basis")

    def scale(v: int) -> int:
        return v if divisor is None else divide_fixed(v, divisor)

    return _Levels(
        gender=worker.gender,
        category=worker.category,
        basic=scale(worker.basic),
        complementary=scale(worker.complementary),
        total=scale(worker.basic + worker.complementary),
        receives=worker.complementary > 0,
    )


def _mean(values: Sequence[int]) -> Fraction:
    return Fraction(sum(values), len(values) * SCALE)


def _median(values: Sequence[int]) -> Fraction:
    s = sorted(values)
    mid = len(s) // 2
    if len(s) % 2 == 1:
        return Fraction(s[mid], SCALE)
    return Fraction(s[mid - 1] + s[mid], 2 * SCALE)


def _ok(value: str) -> dict:
    return {"status": "ok", "value": value}


def _na(reason: str) -> dict:
    return {"status": "not-applicable", "reason": reason}


def _sup(reason: str) -> dict:
    return {"status": "suppressed", "reason": reason}


def _figure(s: _Stats, decimals: int) -> dict:
    if s.n == 0 or s.value is None:
        return _na(s.empty)
    if s.hidden is not None:
        return _sup(s.hidden)
    return _ok(format_fraction(s.value, decimals))


def _gap(female: _Stats, male: _Stats, decimals: int, zero_reason: str) -> tuple[dict, Optional[Fraction]]:
    if female.n == 0 or female.value is None:
        return _na(female.empty), None
    if male.n == 0 or male.value is None:
        return _na(male.empty), None
    if male.value == 0:
        return _na(zero_reason), None
    exact = (male.value - female.value) / male.value * HUNDRED
    hidden = female.hidden if female.hidden is not None else male.hidden
    if hidden is not None:
        return _sup(hidden), exact
    return _ok(format_fraction(exact, decimals)), exact


def _empty_reason(sex: str, recipients_only: bool) -> str:
    if recipients_only:
        return f"no-{sex}-recipients"
    return f"no-{sex}-workers"


def _complementary_hidden(population: int, recipients: int, small) -> Optional[str]:
    if small(population):
        return "below-minimum-group-size"
    if small(recipients):
        return "few-recipients"
    return None


def _secondary(counts: dict, primary: set, minimum: int) -> set:
    hidden = set(primary)
    if not hidden:
        return hidden
    candidates = sorted(((cat, n) for cat, n in counts.items() if n > 0 and cat not in hidden), key=lambda x: (x[1], x[0]))
    total = sum(counts.get(c, 0) for c in hidden)
    for cat, n in candidates:
        if len(hidden) >= 2 and total >= minimum:
            break
        hidden.add(cat)
        total += n
    return hidden


def _quartile_bands(items: Sequence[tuple[str, int]], method: str) -> list[dict]:
    bands = [{"size": Fraction(0), "female": Fraction(0), "male": Fraction(0), "other": Fraction(0)} for _ in range(4)]
    n = len(items)
    if n == 0:
        return bands
    ordered = sorted(items, key=lambda x: x[1])
    groups = []
    i = 0
    while i < n:
        level = ordered[i][1]
        start = i
        counts = {"female": 0, "male": 0, "other": 0}
        while i < n and ordered[i][1] == level:
            counts[ordered[i][0]] += 1
            i += 1
        groups.append((start, i - start, counts))
    if method == "exact-equal-groups":
        for start, size, counts in groups:
            lo_g, hi_g, t4 = 4 * start, 4 * (start + size), 4 * size
            for b in range(4):
                overlap = min(hi_g, (b + 1) * n) - max(lo_g, b * n)
                if overlap <= 0:
                    continue
                bands[b]["size"] += Fraction(overlap, 4)
                for g in ("female", "male", "other"):
                    bands[b][g] += Fraction(overlap * counts[g], t4)
        return bands
    for start, size, counts in groups:
        b = min(3, (4 * (2 * start + size - 1)) // (2 * n))
        bands[b]["size"] += size
        for g in ("female", "male", "other"):
            bands[b][g] += counts[g]
    return bands


def compute_indicators(workers: Iterable[Worker], settings: Settings) -> dict[str, Any]:
    """Compute all Article 9(1) indicators and the Article 10(1)(a) threshold.

    Returns a dict with the same structure as the TypeScript ``Indicators``.
    """
    workers = list(workers)
    minimum = settings.minimum_group_size if settings.suppress_small_groups else 0
    d = settings.decimals
    recipients_only = settings.complementary_gap_population == "recipients"

    def small(k: int) -> bool:
        return 0 < k < minimum

    fm = [w for w in workers if w.gender in ("female", "male")]
    females = [w for w in fm if w.gender == "female"]
    males = [w for w in fm if w.gender == "male"]
    # Same rules as the TypeScript: a small group of workers recorded as
    # neither female nor male stays out of the bands, and a small female or
    # male group withholds the band proportions.
    others_in_bands = settings.other_gender == "include-in-totals" and not small(len(workers) - len(fm))
    in_bands = workers if others_in_bands else fm
    band_sex_small = small(len(females)) or small(len(males))
    has_categories = any(w.category is not None for w in workers)

    def receiving(group: list, sex: str) -> dict:
        n = len(group)
        if n == 0:
            return {"workers": 0, "proportion": _na(_empty_reason(sex, False))}
        if small(n):
            return {"workers": n, "proportion": _sup("below-minimum-group-size")}
        k = sum(1 for w in group if w.complementary > 0)
        return {"workers": n, "proportion": _ok(format_fraction(Fraction(100 * k, n), d))}

    bases = []
    for basis in settings.pay_bases:
        levels = [pay_levels(w, basis, settings.annual_pay) for w in fm]

        def total_stats(sex: str, use: str) -> _Stats:
            values = [lv.total for lv in levels if lv.gender == sex]
            empty = _empty_reason(sex, False)
            if not values:
                return _Stats(0, None, None, empty)
            value = _mean(values) if use == "mean" else _median(values)
            return _Stats(len(values), value, "below-minimum-group-size" if small(len(values)) else None, empty)

        def comp_stats(sex: str, use: str) -> _Stats:
            group = [lv for lv in levels if lv.gender == sex]
            recipients = [lv for lv in group if lv.receives]
            values = [lv.complementary for lv in (recipients if recipients_only else group)]
            empty = _empty_reason(sex, recipients_only)
            if not values:
                return _Stats(0, None, None, empty)
            value = _mean(values) if use == "mean" else _median(values)
            return _Stats(len(values), value, _complementary_hidden(len(values), len(recipients), small), empty)

        def mean_gap(fs: _Stats, ms: _Stats) -> dict:
            return {
                "female": {"workers": fs.n, "average": _figure(fs, d)},
                "male": {"workers": ms.n, "average": _figure(ms, d)},
                "gap": _gap(fs, ms, d, "male-average-is-zero")[0],
            }

        def median_gap(fs: _Stats, ms: _Stats) -> dict:
            return {
                "female": {"workers": fs.n, "median": _figure(fs, d)},
                "male": {"workers": ms.n, "median": _figure(ms, d)},
                "gap": _gap(fs, ms, d, "male-median-is-zero")[0],
            }

        band_items = [(w.gender, pay_levels(w, basis, settings.annual_pay).total) for w in in_bands]
        quartiles = []
        for i, b in enumerate(_quartile_bands(band_items, settings.quartile_method)):
            entry: dict[str, Any] = {"band": i + 1, "workers": format_fraction(b["size"], d)}
            if b["size"] == 0:
                entry.update(female=_na("no-workers"), male=_na("no-workers"))
            elif band_sex_small or (minimum > 0 and b["size"] < minimum):
                entry.update(female=_sup("below-minimum-group-size"), male=_sup("below-minimum-group-size"))
            else:
                entry.update(
                    female=_ok(format_fraction(b["female"] / b["size"] * HUNDRED, d)),
                    male=_ok(format_fraction(b["male"] / b["size"] * HUNDRED, d)),
                )
            quartiles.append(entry)

        bases.append(
            {
                "basis": basis,
                "genderPayGap": mean_gap(total_stats("female", "mean"), total_stats("male", "mean")),
                "complementaryPayGap": mean_gap(comp_stats("female", "mean"), comp_stats("male", "mean")),
                "medianGenderPayGap": median_gap(total_stats("female", "median"), total_stats("male", "median")),
                "medianComplementaryPayGap": median_gap(comp_stats("female", "median"), comp_stats("male", "median")),
                "quartilePayBands": quartiles,
                "categories": _category_gaps(levels, settings, minimum) if has_categories else None,
            }
        )

    return {
        "workersIncluded": {"female": len(females), "male": len(males), "otherInBands": len(in_bands) - len(fm)},
        "proportionReceivingComplementary": {"female": receiving(females, "female"), "male": receiving(males, "male")},
        "bases": bases,
    }


def _category_gaps(levels: Sequence[_Levels], settings: Settings, minimum: int) -> list[dict]:
    d = settings.decimals
    recipients_only = settings.complementary_gap_population == "recipients"

    def small(k: int) -> bool:
        return 0 < k < minimum

    names = sorted({lv.category or "" for lv in levels})
    by_cat: dict[str, dict[str, list[_Levels]]] = {name: {"female": [], "male": []} for name in names}
    for lv in levels:
        if lv.gender != "other":
            by_cat[lv.category or ""][lv.gender].append(lv)

    hidden_total: dict[str, set] = {"female": set(), "male": set()}
    hidden_comp: dict[str, set] = {"female": set(), "male": set()}
    for sex in ("female", "male"):
        worker_counts, recipient_counts, primary_total, primary_comp = {}, {}, set(), set()
        for cat, entry in by_cat.items():
            group = entry[sex]
            k = sum(1 for lv in group if lv.receives)
            worker_counts[cat] = len(group)
            recipient_counts[cat] = k
            if small(len(group)):
                primary_total.add(cat)
            if small(k) or small(len(group)):
                primary_comp.add(cat)
        if minimum > 0:
            hidden_total[sex] = _secondary(worker_counts, primary_total, minimum)
            hidden_comp[sex] = _secondary(recipient_counts, primary_comp, minimum)

    out = []
    for category in names:
        entry = by_cat[category]

        def stats(sex: str) -> dict:
            group = entry[sex]
            n = len(group)
            recipients = [lv for lv in group if lv.receives]
            population = recipients if recipients_only else group
            total_hidden = "below-minimum-group-size" if small(n) else ("secondary-suppression" if category in hidden_total[sex] else None)
            comp_hidden = _complementary_hidden(len(population), len(recipients), small)
            if comp_hidden is None and category in hidden_comp[sex]:
                comp_hidden = "secondary-suppression"
            if total_hidden is not None:
                basic_hidden = total_hidden
            elif comp_hidden is None:
                basic_hidden = None
            else:
                basic_hidden = "secondary-suppression" if comp_hidden == "secondary-suppression" else "few-recipients"
            empty = _empty_reason(sex, False)

            def of(values: list, hidden: Optional[str], empty_as: str) -> _Stats:
                if not values:
                    return _Stats(0, None, None, empty_as)
                return _Stats(len(values), _mean(values), hidden, empty_as)

            return {
                "n": n,
                "total": of([lv.total for lv in group], total_hidden, empty),
                "basic": of([lv.basic for lv in group], basic_hidden, empty),
                "complementary": of([lv.complementary for lv in population], comp_hidden, _empty_reason(sex, recipients_only)),
            }

        fs, ms = stats("female"), stats("male")
        total_fig, exact = _gap(fs["total"], ms["total"], d, "male-average-is-zero")
        if exact is None:
            threshold = "not-determinable"
        elif total_fig["status"] == "suppressed":
            threshold = "withheld"
        else:
            threshold = "met" if abs(exact) >= THRESHOLD_PERCENT else "not-met"

        def sex_figures(s: dict) -> dict:
            return {
                "workers": s["n"],
                "basicAverage": _figure(s["basic"], d),
                "complementaryAverage": _figure(s["complementary"], d),
                "totalAverage": _figure(s["total"], d),
            }

        out.append(
            {
                "category": category,
                "female": sex_figures(fs),
                "male": sex_figures(ms),
                "basicPayGap": _gap(fs["basic"], ms["basic"], d, "male-average-is-zero")[0],
                "complementaryPayGap": _gap(fs["complementary"], ms["complementary"], d, "male-average-is-zero")[0],
                "totalPayGap": total_fig,
                "jointAssessmentThreshold": threshold,
            }
        )
    return out
