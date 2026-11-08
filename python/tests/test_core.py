# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only

import csv
import io
import unittest
from fractions import Fraction

from evenkeel import (
    ATTRIBUTION,
    SCALE,
    Columns,
    DecimalError,
    GenderCodes,
    Settings,
    ValidationFailed,
    Worker,
    compute_indicators,
    divide_fixed,
    format_fraction,
    parse_decimal,
    round_div,
    workers_from_dataframe,
    workers_from_rows,
)

try:
    import pandas
except ImportError:  # pragma: no cover
    pandas = None


class Decimals(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_decimal("1234.56"), 1234_560000000000)
        self.assertEqual(parse_decimal("1 234,56", ",", " "), 1234_560000000000)
        self.assertEqual(parse_decimal("1\u00a0234,5", ",", " "), 1234_500000000000)
        self.assertEqual(parse_decimal("1.234.567,5", ",", "."), 1234567_500000000000)
        self.assertEqual(parse_decimal("-3.25"), -3_250000000000)
        for bad in ["", "-", ".5", "5.", "1e5", "+5", "1,234", "1.0000001", "١٢", "9" * 16, "NaN"]:
            with self.subTest(bad), self.assertRaises(DecimalError):
                parse_decimal(bad)
        with self.assertRaises(DecimalError):
            parse_decimal("1", ",", ",")
        with self.assertRaises(DecimalError):
            parse_decimal("\t42.5")

    def test_rounding(self):
        self.assertEqual(round_div(5, 2), 3)
        self.assertEqual(round_div(-5, 2), -3)
        self.assertEqual(round_div(7, 3), 2)
        self.assertEqual(round_div(5, -2), -3)
        self.assertEqual(divide_fixed(1000 * SCALE, 3 * SCALE), 333_333333333333)
        self.assertEqual(format_fraction(Fraction(1, 8), 2), "0.13")
        self.assertEqual(format_fraction(Fraction(-1, 8), 2), "-0.13")
        self.assertEqual(format_fraction(Fraction(-1, 1000), 2), "0.00")
        self.assertEqual(format_fraction(Fraction(5), 0), "5")
        with self.assertRaises(ValueError):
            format_fraction(Fraction(1), 13)
        with self.assertRaises(ZeroDivisionError):
            round_div(1, 0)


class Indicators(unittest.TestCase):
    def test_gap_and_threshold(self):
        # F 0.38; M 0.10 and 0.70 (average 0.40): exactly 5 %, so the threshold is met.
        ws = [Worker.from_strings("1", "female", "0.38", category="A"), Worker.from_strings("2", "male", "0.10", category="A"), Worker.from_strings("3", "male", "0.70", category="A")]
        s = Settings(pay_bases=("annual",), annual_pay="actual", complementary_gap_population="all-workers", quartile_method="exact-equal-groups", other_gender="exclude", suppress_small_groups=False)
        result = compute_indicators(ws, s)
        cat = result["bases"][0]["categories"][0]
        self.assertEqual(cat["totalPayGap"], {"status": "ok", "value": "5.00"})
        self.assertEqual(cat["jointAssessmentThreshold"], "met")

    def test_settings_validation(self):
        good = dict(pay_bases=("annual",), annual_pay="actual", complementary_gap_population="all-workers", quartile_method="exact-equal-groups", other_gender="exclude")
        Settings(**good)
        for key, value in [("pay_bases", ()), ("pay_bases", ("annual", "annual")), ("annual_pay", None), ("complementary_gap_population", "x"), ("quartile_method", "x"), ("other_gender", "x"), ("minimum_group_size", 0), ("minimum_group_size", True), ("decimals", 7), ("decimals", True), ("suppress_small_groups", 1)]:
            with self.subTest(key), self.assertRaises(ValueError):
                Settings(**{**good, key: value})
        with self.assertRaises(ValueError):
            Settings.from_dict({"payBases": ["annual"], "unknown": 1})
        with self.assertRaises(ValueError):
            Settings.from_dict({"payBases": ["annual"]})
        with self.assertRaises(ValueError):
            Worker.from_strings("1", "f", "1")

    def test_missing_divisors(self):
        s = Settings(pay_bases=("hourly",), complementary_gap_population="all-workers", quartile_method="exact-equal-groups", other_gender="exclude")
        with self.assertRaises(ValueError):
            compute_indicators([Worker.from_strings("1", "female", "1")], s)


COLUMNS = Columns(worker_id="id", gender="gender", basic_pay=("basic",), complementary_pay=("bonus",), category="category", hours="hours")
CODES = GenderCodes(female=("F",), male=("M",), other=("X",))
CSV_TEXT = "id,gender,category,basic,bonus,hours\n1,F,A,1000.50,,1720\n2, m ,A,2000,10.25,1720\n3,X,A,1500,0,1720\n"


class Records(unittest.TestCase):
    def test_rows(self):
        ws = workers_from_rows(csv.DictReader(io.StringIO(CSV_TEXT)), COLUMNS, CODES, "exclude", require_hours=True)
        self.assertEqual([w.gender for w in ws], ["female", "male", "other"])
        self.assertEqual(ws[0].complementary, 0)
        self.assertEqual(ws[1].complementary, 10_250000000000)

    def test_row_errors(self):
        bad = "id,gender,category,basic,bonus,hours\n1,Q,A,1,0,1\n2,F,,x,-1,0\n2,F,A,1,0,9999\n"
        with self.assertRaises(ValidationFailed) as ctx:
            workers_from_rows(csv.DictReader(io.StringIO(bad)), COLUMNS, CODES, "reject", require_hours=True)
        rows = [(e.row, e.column) for e in ctx.exception.errors]
        self.assertEqual(rows, [(1, "gender"), (2, "category"), (2, "basic"), (2, "bonus"), (2, "hours"), (3, "hours")])
        self.assertIn("problems in the input", str(ctx.exception))
        with self.assertRaises(ValidationFailed):
            workers_from_rows(csv.DictReader(io.StringIO("id,gender,category,basic,bonus,hours\n1,X,A,1,0,1\n")), COLUMNS, CODES, "reject")
        with self.assertRaises(ValidationFailed):
            workers_from_rows([{"id": "1\u202e", "gender": "F", "category": "A", "basic": "1", "bonus": "", "hours": "1"}], COLUMNS, CODES, "exclude")
        for ch in ("\u2028", "\u061c", "\u00ad", "\u200d"):
            with self.subTest(ch), self.assertRaises(ValidationFailed):
                workers_from_rows([{"id": "1", "gender": "F", "category": f"A{ch}B", "basic": "1", "bonus": "", "hours": "1"}], COLUMNS, CODES, "exclude")
        with self.assertRaises(ValidationFailed):
            workers_from_rows([], COLUMNS, CODES, "exclude")
        with self.assertRaises(ValueError):
            workers_from_rows([], COLUMNS, GenderCodes(female=("F",), male=("f",)), "exclude")
        # Lengths count UTF-16 code units, as in the TypeScript implementation:
        # 50 emoji are 100 units (accepted), 51 are 102 (rejected).
        emoji = "\U0001F600"
        ok = workers_from_rows([{"id": emoji * 50, "gender": "F", "category": "A", "basic": "1", "bonus": "", "hours": "1"}], COLUMNS, CODES, "exclude")
        self.assertEqual(len(ok), 1)
        with self.assertRaises(ValidationFailed):
            workers_from_rows([{"id": emoji * 51, "gender": "F", "category": "A", "basic": "1", "bonus": "", "hours": "1"}], COLUMNS, CODES, "exclude")
        with self.assertRaises(ValidationFailed):
            workers_from_rows([{"id": "1", "gender": "F", "category": emoji * 101, "basic": "1", "bonus": "", "hours": "1"}], COLUMNS, CODES, "exclude")
        # Cells are trimmed like JavaScript's trim(): a byte order mark goes, a
        # file separator (U+001C) stays and is rejected as a control character.
        trimmed = workers_from_rows([{"id": "\ufeff7", "gender": "F", "category": "A", "basic": "\ufeff1", "bonus": "", "hours": "1"}], COLUMNS, CODES, "exclude")
        self.assertEqual((trimmed[0].id, trimmed[0].basic), ("7", SCALE))
        with self.assertRaises(ValidationFailed):
            workers_from_rows([{"id": "7\x1c", "gender": "F", "category": "A", "basic": "1", "bonus": "", "hours": "1"}], COLUMNS, CODES, "exclude")
        dup = [{"id": "1", "gender": "F", "category": "A", "basic": "1", "bonus": "", "hours": "1"}] * 2
        with self.assertRaises(ValidationFailed):
            workers_from_rows(dup, COLUMNS, CODES, "exclude")

    @unittest.skipIf(pandas is None, "pandas not installed")
    def test_dataframe(self):
        df = pandas.read_csv(io.StringIO(CSV_TEXT), dtype=str, keep_default_na=False)
        ws = workers_from_dataframe(df, COLUMNS, CODES, "exclude")
        self.assertEqual(len(ws), 3)
        self.assertEqual(ws[0].basic, 1000_500000000000)
        floats = pandas.DataFrame({"id": ["1", "2"], "gender": ["F", "M"], "category": ["A", "A"], "basic": [1000.5, 2000.0], "bonus": [float("nan"), 10.25], "hours": [1720.0, 1720.0]})
        ws2 = workers_from_dataframe(floats, COLUMNS, CODES, "exclude")
        self.assertEqual(ws2[0].basic, 1000_500000000000)
        self.assertEqual(ws2[0].complementary, 0)
        with self.assertRaises(ValueError):
            workers_from_dataframe(floats.drop(columns=["hours"]), COLUMNS, CODES, "exclude")

    def test_attribution(self):
        self.assertEqual(ATTRIBUTION, "Evenkeel by AFKzona Group")


if __name__ == "__main__":
    unittest.main()
