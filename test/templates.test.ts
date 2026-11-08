// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/core/config.js';

const DIR = join(import.meta.dirname, '..', 'templates', 'column-mappings');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.json'));

describe('column-mapping templates', () => {
  it('exist and are labelled as examples', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(4);
    for (const f of FILES) {
      expect(f).toMatch(/^example-/);
      const json = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Record<string, unknown>;
      expect(json.description).toMatch(/^EXAMPLE ONLY - verify every column name/);
    }
  });

  it.each(FILES)('%s is rejected until every open choice is made, then valid', (f) => {
    const json = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Record<string, unknown>;
    const before = validateConfig(json);
    expect(before.ok).toBe(false);
    const filled = Object.fromEntries(
      Object.entries(json).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('CHOOSE: ') ? (v.slice(8).split(' | ')[0] ?? '') : v]),
    );
    const after = validateConfig(filled);
    expect(after.ok, after.ok ? '' : after.errors.join('; ')).toBe(true);
  });
});
