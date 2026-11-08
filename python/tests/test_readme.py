# Copyright 2026 MB AFKzona Group
# SPDX-License-Identifier: AGPL-3.0-only
"""Runs the Python example in README.md in a separate interpreter."""

import pathlib
import re
import subprocess
import sys
import tempfile
import unittest

README = pathlib.Path(__file__).resolve().parents[2] / "README.md"


class ReadmeExample(unittest.TestCase):
    def test_python_example_runs(self):
        text = README.read_text(encoding="utf-8")
        m = re.search(r"<!-- example:python -->\n```python\n(.*?)```", text, re.S)
        self.assertIsNotNone(m)
        with tempfile.TemporaryDirectory() as tmp:
            script = pathlib.Path(tmp) / "example.py"
            script.write_text(m.group(1), encoding="utf-8")
            result = subprocess.run([sys.executable, "-I", str(script)], capture_output=True, text=True, timeout=60, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
