# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Evenkeel: pay-gap indicators of Directive (EU) 2023/970, computed locally.

Python implementation of the same formulas as the TypeScript package,
checked against the shared vectors in ``test-vectors/``. Not legal advice.
Evenkeel by AFKzona Group - https://github.com/afkzonagroup/evenkeel
"""

from .fixed import SCALE, DecimalError, divide_fixed, format_fraction, parse_decimal, round_div
from .indicators import Settings, Worker, compute_indicators, pay_levels
from .records import Columns, GenderCodes, RowError, ValidationFailed, workers_from_dataframe, workers_from_rows

__version__ = "0.1.0"
ATTRIBUTION = "Evenkeel by AFKzona Group"

__all__ = [
    "ATTRIBUTION",
    "SCALE",
    "Columns",
    "DecimalError",
    "GenderCodes",
    "RowError",
    "Settings",
    "ValidationFailed",
    "Worker",
    "compute_indicators",
    "divide_fixed",
    "format_fraction",
    "parse_decimal",
    "pay_levels",
    "round_div",
    "workers_from_dataframe",
    "workers_from_rows",
]
