# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Runs the shared test vectors (the TypeScript tests run the same files)."""

import json
import pathlib
import unittest

from evenkeel import Settings, Worker, compute_indicators

VECTORS = pathlib.Path(__file__).resolve().parents[2] / "test-vectors"


def load(name):
    doc = json.loads((VECTORS / name).read_text(encoding="utf-8"))
    assert doc["format"] == 1
    return doc["vectors"]


def workers(items):
    return [
        Worker.from_strings(
            id=w["id"], gender=w["gender"], basic=w["basic"], complementary=w["complementary"],
            category=w["category"], hours=w["hours"], fte=w["fte"],
        )
        for w in items
    ]


def partial_match(test, actual, expected, path):
    if isinstance(expected, list):
        test.assertIsInstance(actual, list, path)
        test.assertEqual(len(actual), len(expected), f"{path}.length")
        for i, e in enumerate(expected):
            partial_match(test, actual[i], e, f"{path}[{i}]")
    elif isinstance(expected, dict):
        test.assertIsInstance(actual, dict, path)
        for key, value in expected.items():
            test.assertIn(key, actual, f"{path}.{key}")
            partial_match(test, actual[key], value, f"{path}.{key}")
    else:
        test.assertEqual(actual, expected, path)


class SharedVectors(unittest.TestCase):
    def test_hand_calculated(self):
        vectors = load("indicators.json")
        self.assertGreaterEqual(len(vectors), 15)
        for v in vectors:
            with self.subTest(v["name"]):
                result = compute_indicators(workers(v["workers"]), Settings.from_dict(v["settings"]))
                partial_match(self, result, v["expected"], v["name"])

    def test_generated_cross_check(self):
        vectors = load("generated.json")
        self.assertGreaterEqual(len(vectors), 3)
        for v in vectors:
            with self.subTest(v["name"]):
                result = compute_indicators(workers(v["workers"]), Settings.from_dict(v["settings"]))
                self.assertEqual(result, v["expected"])


if __name__ == "__main__":
    unittest.main()
