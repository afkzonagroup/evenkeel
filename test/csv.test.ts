// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { DEFAULT_CSV_LIMITS, decodeCsvBytes, parseCsv, type CsvLimits } from '../src/core/csv.js';

function table(text: string, delimiter: ',' | ';' | '\t' | '|' = ',', limits: CsvLimits = DEFAULT_CSV_LIMITS) {
  const r = parseCsv(text, delimiter, limits);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function failure(text: string, limits: CsvLimits = DEFAULT_CSV_LIMITS, delimiter: ',' | ';' = ',') {
  const r = parseCsv(text, delimiter, limits);
  if (r.ok) throw new Error('expected failure');
  return r.error;
}

describe('parseCsv (RFC 4180)', () => {
  it('reads header and rows with CRLF, LF and lone CR line endings', () => {
    for (const eol of ['\r\n', '\n', '\r']) {
      const t = table(`a,b${eol}1,2${eol}3,4${eol}`);
      expect(t.header).toEqual(['a', 'b']);
      expect(t.rows.map((r) => r.fields)).toEqual([
        ['1', '2'],
        ['3', '4'],
      ]);
      expect(t.rows.map((r) => r.line)).toEqual([2, 3]);
    }
  });

  it('handles quoted fields with delimiters, line breaks and doubled quotes', () => {
    const t = table('name,note\r\n"Smith, Ann","said ""hi""\r\nthen left"\r\n"",x\r\n');
    expect(t.rows[0]?.fields).toEqual(['Smith, Ann', 'said "hi"\r\nthen left']);
    expect(t.rows[1]?.fields).toEqual(['', 'x']);
    // The row after a two-line quoted field starts on line 4.
    expect(t.rows[1]?.line).toBe(4);
  });

  it('removes a UTF-8 byte order mark', () => {
    expect(table('\ufeffid,pay\n1,2').header).toEqual(['id', 'pay']);
  });

  it('works without a final line break and skips blank lines', () => {
    const t = table('a,b\n\n1,2\n\n\n3,4');
    expect(t.rows.map((r) => r.fields)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps empty fields, including a trailing empty field', () => {
    expect(table('a,b,c\n1,,\n').rows[0]?.fields).toEqual(['1', '', '']);
    expect(table('a,b\n1,').rows[0]?.fields).toEqual(['1', '']);
  });

  it('supports semicolon, tab and pipe delimiters', () => {
    expect(table('a;b\n1,5;2', ';').rows[0]?.fields).toEqual(['1,5', '2']);
    expect(table('a\tb\n1\t2', '\t').rows[0]?.fields).toEqual(['1', '2']);
    expect(table('a|b\n"x|y"|2', '|').rows[0]?.fields).toEqual(['x|y', '2']);
  });

  it('rejects an unsupported delimiter', () => {
    expect(parseCsv('a', ':' as ',', DEFAULT_CSV_LIMITS).ok).toBe(false);
  });

  it('reports structural errors with the line number', () => {
    expect(failure('a,b\n1,"open\n2,3')).toMatchObject({ code: 'unterminated-quote', line: 2 });
    expect(failure('a,b\n1,ab"c\n')).toMatchObject({ code: 'quote-in-unquoted-field', line: 2 });
    expect(failure('a,b\n1,"ab"c\n')).toMatchObject({ code: 'text-after-closing-quote', line: 2 });
    expect(failure('')).toMatchObject({ code: 'empty-input' });
    expect(failure('\n\n')).toMatchObject({ code: 'empty-input' });
  });

  it('enforces the size, row, field-count and field-length limits', () => {
    const small: CsvLimits = { maxBytes: 100, maxRows: 2, maxFields: 3, maxFieldLength: 5 };
    expect(failure('x'.repeat(101), small)).toMatchObject({ code: 'input-too-large' });
    expect(failure('a\n1\n2\n3\n', small)).toMatchObject({ code: 'too-many-rows', line: 4 });
    expect(table('a\n1\n2\n', ',', small).rows).toHaveLength(2);
    expect(failure('a,b,c,d\n', small)).toMatchObject({ code: 'too-many-fields', line: 1 });
    expect(failure('a\n123456\n', small)).toMatchObject({ code: 'field-too-long', line: 2 });
    expect(failure('a\n"123456"\n', small)).toMatchObject({ code: 'field-too-long', line: 2 });
    // Doubled quotes count towards the limit while reading: the field is
    // stopped at the limit, before the missing closing quote is reached.
    expect(failure(`a\n"${'""'.repeat(6)}`, small)).toMatchObject({ code: 'field-too-long', line: 2 });
    expect(failure(`a\n"x${'""'.repeat(4)}y`, small)).toMatchObject({ code: 'field-too-long', line: 2 });
    expect(table('a\n"x""""y"\n', ',', small).rows[0]?.fields).toEqual(['x""y']);
  });

  it('rejects very large input cleanly and quickly', () => {
    const limits: CsvLimits = { ...DEFAULT_CSV_LIMITS, maxBytes: 1_000_000, maxRows: 10_000 };
    const big = `id,pay\n${'1,2\n'.repeat(300_000)}`;
    const started = Date.now();
    expect(failure(big, limits)).toMatchObject({ code: 'input-too-large' });
    const manyRows = `id,pay\n${'1,2\n'.repeat(20_000)}`;
    expect(failure(manyRows, limits)).toMatchObject({ code: 'too-many-rows' });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('decodeCsvBytes', () => {
  it('decodes UTF-8 and removes the byte order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a,ž\n')]);
    const r = decodeCsvBytes(bytes, 'utf-8', 100);
    expect(r).toEqual({ ok: true, value: 'a,ž\n' });
  });

  it('rejects invalid UTF-8 instead of replacing bytes', () => {
    const r = decodeCsvBytes(new Uint8Array([0x61, 0xff, 0x62]), 'utf-8', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-encoding');
  });

  it('decodes Windows-1252', () => {
    const r = decodeCsvBytes(new Uint8Array([0x80, 0x31]), 'windows-1252', 100);
    expect(r).toEqual({ ok: true, value: '€1' });
  });

  it('rejects input over the byte limit before decoding, and unknown encodings', () => {
    expect(decodeCsvBytes(new Uint8Array(101), 'utf-8', 100)).toMatchObject({ ok: false, error: { code: 'input-too-large' } });
    expect(decodeCsvBytes(new Uint8Array(1), 'latin2' as 'utf-8', 100)).toMatchObject({ ok: false, error: { code: 'invalid-option' } });
  });
});
