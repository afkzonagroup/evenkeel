# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Exact decimal arithmetic, identical to src/core/decimal.ts.

Per-worker amounts are integers counting units of 10^-12 ("fixed" values).
Input decimals are parsed exactly. A division that creates a per-worker value
(hourly pay, pay per full-time equivalent) is rounded once to 10^-12, half
away from zero. Averages, medians, gaps and proportions are exact
:class:`fractions.Fraction` values, rounded half away from zero only when
formatted.
"""

from __future__ import annotations

import re
from fractions import Fraction

SCALE_DIGITS = 12
SCALE = 10**SCALE_DIGITS
MAX_INTEGER_DIGITS = 15
MAX_FRACTION_DIGITS = 6

_DIGITS = re.compile(r"[0-9]+\Z")
_GROUPED = re.compile(r"[0-9]{1,3}(?:G[0-9]{3})+\Z")
_SPACES = re.compile("[ \u00a0\u202f]")


class DecimalError(ValueError):
    """Raised when a decimal string is not a plain decimal number."""


def parse_decimal(text: str, decimal_separator: str = ".", thousands_separator: str = "none") -> int:
    """Parse a decimal string exactly into a fixed value (units of 10^-12).

    Accepts an optional leading minus sign, ASCII digits, a configured
    thousands separator in groups of three and one decimal separator followed
    by 1 to 6 digits. Rejects exponents, plus signs, currency symbols and
    non-ASCII digits.

    >>> parse_decimal("1 234,56", ",", " ")
    1234560000000000
    """
    if decimal_separator not in (".", ","):
        raise DecimalError("decimal separator must be '.' or ','")
    if thousands_separator not in ("none", " ", ".", ",", "'"):
        raise DecimalError("unsupported thousands separator")
    if thousands_separator == decimal_separator:
        raise DecimalError("decimal and thousands separators must differ")
    if not isinstance(text, str):
        raise DecimalError("expected a string")
    s = text.strip(" ")
    if not s:
        raise DecimalError("empty value")
    if len(s) > 64:
        raise DecimalError("value is too long")
    negative = s.startswith("-")
    if negative:
        s = s[1:]
    if s.count(decimal_separator) > 1:
        raise DecimalError("more than one decimal separator")
    int_part, sep, frac_part = s.partition(decimal_separator)
    if sep and not _DIGITS.match(frac_part):
        raise DecimalError("expected digits after the decimal separator")
    if len(frac_part) > MAX_FRACTION_DIGITS:
        raise DecimalError(f"more than {MAX_FRACTION_DIGITS} decimal places")
    if thousands_separator != "none":
        if thousands_separator == " ":
            normalised = _SPACES.sub("G", int_part)
        else:
            normalised = int_part.replace(thousands_separator, "G")
        if "G" in normalised:
            if not _GROUPED.match(normalised):
                raise DecimalError("thousands separators must separate groups of three digits")
            int_part = normalised.replace("G", "")
    if not _DIGITS.match(int_part):
        raise DecimalError("expected a plain decimal number")
    if len(int_part.lstrip("0") or "0") > MAX_INTEGER_DIGITS:
        raise DecimalError(f"more than {MAX_INTEGER_DIGITS} digits before the decimal separator")
    magnitude = int(int_part) * SCALE + int(frac_part.ljust(SCALE_DIGITS, "0") or "0")
    return -magnitude if negative else magnitude


def round_div(num: int, den: int) -> int:
    """Integer division rounded to the nearest integer, halves away from zero."""
    if den == 0:
        raise ZeroDivisionError("division by zero")
    if den < 0:
        num, den = -num, -den
    negative = num < 0
    q, r = divmod(abs(num), den)
    if r * 2 >= den:
        q += 1
    return -q if negative else q


def divide_fixed(a: int, b: int) -> int:
    """a / b for fixed values, rounded once to 10^-12, half away from zero."""
    return round_div(a * SCALE, b)


def format_fraction(value: Fraction, decimals: int) -> str:
    """Format with exactly ``decimals`` digits, half away from zero, never "-0.00"."""
    if not isinstance(decimals, int) or decimals < 0 or decimals > 12:
        raise ValueError("decimals must be an integer from 0 to 12")
    scaled = round_div(value.numerator * 10**decimals, value.denominator)
    digits = str(abs(scaled)).rjust(decimals + 1, "0")
    body = digits if decimals == 0 else f"{digits[:-decimals]}.{digits[-decimals:]}"
    return f"-{body}" if scaled < 0 else body


def fixed_to_fraction(value: int) -> Fraction:
    """A fixed value as an exact fraction of currency units (or hours)."""
    return Fraction(value, SCALE)
