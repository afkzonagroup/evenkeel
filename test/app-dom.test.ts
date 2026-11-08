// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { isAllowedHref } from '../src/app/dom.js';
import { articleUrl, recitalUrl } from '../src/core/legal.js';

describe('offline app link allow-list', () => {
  it('allows the official text, the attribution and project pages, and blob downloads', () => {
    for (const ok of [articleUrl(9), recitalUrl(22), 'https://eur-lex.europa.eu/eli/dir/2023/970/oj', 'https://afkzonagroup.lt', 'https://github.com/afkzonagroup/evenkeel', 'blob:null/1234']) {
      expect(isAllowedHref(ok), ok).toBe(true);
    }
  });

  it('rejects every other target, so no link can carry data off the machine', () => {
    for (const bad of [
      'https://evil.example/',
      'https://afkzonagroup.lt/?pay=1',
      'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_9?x=1',
      'https://eur-lex.europa.eu/search?q=salary',
      'javascript:alert(1)',
      'data:text/html,x',
      'http://afkzonagroup.lt',
      '#top',
    ]) {
      expect(isAllowedHref(bad), bad).toBe(false);
    }
  });
});
