#!/usr/bin/env node
// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import process from 'node:process';
import { readFileLimited, writeFileSafe } from './node-io.js';
import { run } from './run.js';

const code = await run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readFile: readFileLimited,
  writeFile: writeFileSafe,
  now: () => new Date(),
});
process.exitCode = code;
