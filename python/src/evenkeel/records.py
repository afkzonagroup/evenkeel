# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Build validated :class:`Worker` records from rows (for example from
:class:`csv.DictReader`) or from a pandas DataFrame.

The row rules follow the TypeScript implementation (src/core/dataset.ts):
any row error rejects the whole input, gender codes must be listed
explicitly, amounts must be non-negative plain decimals, empty complementary
cells count as zero, hours are at most 8784 and the full-time equivalent is
above 0 and at most 1. Not implemented here: period filtering and adding up
several rows per worker (filter and aggregate the rows before calling).
"""

from __future__ import annotations

import math
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping, Optional, Sequence, cast

from .fixed import SCALE, DecimalError, parse_decimal
from .indicators import Gender, Worker

MAX_ISSUES = 1000
MAX_ID_LENGTH = 100
MAX_CATEGORY_LENGTH = 200
MAX_HOURS = 8784 * SCALE
_UNSAFE_CATEGORIES = frozenset({"Cc", "Cf", "Zl", "Zp"})
# The characters JavaScript's String.prototype.trim() removes. Python's
# str.strip() also removes U+001C-U+001F and U+0085 but keeps U+FEFF; using
# the JavaScript set makes both implementations accept the same cells.
_TRIM = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def _length(text: str) -> int:
    """Length in UTF-16 code units, as JavaScript's ``String.length`` counts it,
    so that both implementations accept and reject the same values."""
    return len(text.encode("utf-16-le")) // 2


def _unsafe(text: str) -> bool:
    """True for control, format (zero-width, bidirectional) or separator characters."""
    return any(unicodedata.category(ch) in _UNSAFE_CATEGORIES for ch in text)


@dataclass(frozen=True)
class Columns:
    """Mapping from column names to fields (same meaning as config.columns)."""

    worker_id: str
    gender: str
    basic_pay: Sequence[str]
    complementary_pay: Sequence[str] = ()
    category: Optional[str] = None
    hours: Optional[str] = None
    fte: Optional[str] = None


@dataclass(frozen=True)
class GenderCodes:
    """Codes as they appear in the data; matching ignores case and surrounding spaces."""

    female: Sequence[str]
    male: Sequence[str]
    other: Sequence[str] = ()


@dataclass
class RowError:
    row: int
    column: Optional[str]
    message: str


@dataclass
class ValidationFailed(ValueError):
    """Raised when rows have errors. ``errors`` lists them (at most 1000)."""

    errors: list = field(default_factory=list)
    more: int = 0

    def __str__(self) -> str:
        head = "; ".join(f"row {e.row}: {e.message}" for e in self.errors[:5])
        return f"{len(self.errors) + self.more} problems in the input: {head}"


def _text(value: Any) -> str:
    """Convert a cell to text. Floats use their shortest decimal representation;
    read files with dtype=str to keep amounts exactly as written."""
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        if math.isinf(value):
            return "inf"
        text = repr(value)
        return text[:-2] if text.endswith(".0") else text
    return str(value).strip(_TRIM)


def workers_from_rows(
    rows: Iterable[Mapping[str, Any]],
    columns: Columns,
    gender_codes: GenderCodes,
    other_gender: str,
    decimal_separator: str = ".",
    thousands_separator: str = "none",
    require_hours: bool = False,
) -> list[Worker]:
    """Validate rows and build workers. Raises :class:`ValidationFailed` on any row error."""
    if other_gender not in ("reject", "exclude", "include-in-totals"):
        raise ValueError("other_gender must be 'reject', 'exclude' or 'include-in-totals'")
    female = {c.strip(_TRIM).lower() for c in gender_codes.female}
    male = {c.strip(_TRIM).lower() for c in gender_codes.male}
    other = {c.strip(_TRIM).lower() for c in gender_codes.other}
    if female & male or female & other or male & other:
        raise ValueError("a gender code is listed in more than one group")
    errors: list[RowError] = []
    more = 0
    seen: set[str] = set()
    workers: list[Worker] = []

    def report(row: int, column: Optional[str], message: str) -> None:
        nonlocal more
        if len(errors) < MAX_ISSUES:
            errors.append(RowError(row, column, message))
        else:
            more += 1

    def amount(row_no: int, row: Mapping[str, Any], name: str, empty_is_zero: bool) -> Optional[int]:
        raw = _text(row.get(name))
        if raw == "":
            if empty_is_zero:
                return 0
            report(row_no, name, "the amount is empty")
            return None
        try:
            v = parse_decimal(raw, decimal_separator, thousands_separator)
        except DecimalError as e:
            report(row_no, name, f"the amount is not a valid number: {e}")
            return None
        if v < 0:
            report(row_no, name, "negative amounts are not accepted")
            return None
        return v

    for row_no, row in enumerate(rows, start=1):
        before = len(errors) + more
        wid = _text(row.get(columns.worker_id))
        if not wid or _length(wid) > MAX_ID_LENGTH or _unsafe(wid):
            report(row_no, columns.worker_id, "the worker id is empty, too long or contains control characters")
        g = _text(row.get(columns.gender)).lower()
        gender: Optional[str] = None
        if g in female:
            gender = "female"
        elif g in male:
            gender = "male"
        elif g in other:
            if other_gender == "reject":
                report(row_no, columns.gender, "the gender is neither female nor male and other_gender is 'reject'")
            else:
                gender = "other"
        else:
            report(row_no, columns.gender, "the gender code is not listed in gender_codes")
        category: Optional[str] = None
        if columns.category is not None:
            category = _text(row.get(columns.category))
            if not category or _length(category) > MAX_CATEGORY_LENGTH or _unsafe(category):
                report(row_no, columns.category, "the category is empty, too long or contains control characters")
        basic = 0
        for name in columns.basic_pay:
            v = amount(row_no, row, name, False)
            basic += v or 0
        comp = 0
        for name in columns.complementary_pay:
            v = amount(row_no, row, name, True)
            comp += v or 0
        hours: Optional[int] = None
        if columns.hours is not None:
            raw = _text(row.get(columns.hours))
            if raw == "":
                if require_hours:
                    report(row_no, columns.hours, "hours are required for the hourly pay basis")
            else:
                try:
                    hours = parse_decimal(raw, decimal_separator, thousands_separator)
                except DecimalError as e:
                    report(row_no, columns.hours, f"hours are not a valid number: {e}")
                else:
                    if hours < 0 or hours > MAX_HOURS or (require_hours and hours == 0):
                        report(row_no, columns.hours, "hours must be above 0 (hourly basis) and at most 8784")
        fte: Optional[int] = None
        if columns.fte is not None:
            try:
                fte = parse_decimal(_text(row.get(columns.fte)), decimal_separator, thousands_separator)
            except DecimalError as e:
                report(row_no, columns.fte, f"the full-time equivalent is not a valid number: {e}")
            else:
                if fte <= 0 or fte > SCALE:
                    report(row_no, columns.fte, "the full-time equivalent must be greater than 0 and at most 1")
        if len(errors) + more != before or gender is None:
            continue
        if wid in seen:
            report(row_no, columns.worker_id, "the worker id appears more than once")
            continue
        seen.add(wid)
        workers.append(Worker(wid, cast(Gender, gender), category, basic, comp, hours, fte))
    if errors or more:
        raise ValidationFailed(errors, more)
    if not workers:
        raise ValidationFailed([RowError(0, None, "no worker rows were found")], 0)
    return workers


def workers_from_dataframe(df: Any, columns: Columns, gender_codes: GenderCodes, other_gender: str, **kwargs: Any) -> list[Worker]:
    """Build workers from a pandas DataFrame (requires the ``pandas`` extra).

    Read CSV files with ``dtype=str`` so amounts stay exactly as written.
    """
    try:
        import pandas  # noqa: F401  (imported only to give a clear error when missing)
    except ImportError as e:  # pragma: no cover - exercised only without pandas
        raise ImportError("workers_from_dataframe needs pandas: pip install 'evenkeel[pandas]'") from e
    wanted = [columns.worker_id, columns.gender, *columns.basic_pay, *columns.complementary_pay]
    wanted += [c for c in (columns.category, columns.hours, columns.fte) if c is not None]
    missing = [c for c in wanted if c not in df.columns]
    if missing:
        raise ValueError(f"the DataFrame has no columns named {missing}")
    return workers_from_rows(df[wanted].to_dict(orient="records"), columns, gender_codes, other_gender, **kwargs)
