// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { csvCell, csvRow, escapeHtml, escapeMarkdown, escapeMarkdownLight } from '../src/report/escape.js';

describe('csvCell (formula injection protection)', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['-1+1', "'-1+1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\t=1', "'\t=1"],
    ['\r=1', "\"'\r=1\""],
    [' =1', "' =1"],
    ['\u3000=1', "'\u3000=1"],
    ['＝1+1', "'＝1+1"],
    ['-', "'-"],
    ['-x', "'-x"],
  ])('neutralises %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('leaves plain numbers and ordinary text alone', () => {
    expect(csvCell('-5.25')).toBe('-5.25');
    expect(csvCell('12')).toBe('12');
    expect(csvCell('Sales')).toBe('Sales');
    expect(csvCell('')).toBe('');
  });

  it('quotes delimiters, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('a;b', ';')).toBe('"a;b"');
    expect(csvRow(['a', '=b'])).toBe("a,'=b\r\n");
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});

describe('escapeMarkdown', () => {
  it('escapes all ASCII punctuation in input data and flattens line breaks', () => {
    expect(escapeMarkdown('[x](y) *b* <i> | #h\nnext')).toBe('\\[x\\]\\(y\\) \\*b\\* \\<i\\> \\| \\#h next');
    expect(escapeMarkdown('www.evil.example')).toBe('www\\.evil\\.example');
  });

  it('leaves plain numbers readable', () => {
    expect(escapeMarkdown('41,000.00')).toBe('41,000.00');
    expect(escapeMarkdown('-5.25 %')).toBe('-5.25 %');
    expect(escapeMarkdown('1.2.3')).toBe('1\\.2\\.3');
  });

  it('light escaping covers inline markup characters in fixed text', () => {
    expect(escapeMarkdownLight('a_b*c|d<e>[f]`g`~h&i!j\\k')).toBe('a\\_b\\*c\\|d\\<e\\>\\[f\\]\\`g\\`\\~h\\&i\\!j\\\\k');
  });
});
