// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A strict CSV reader following RFC 4180, with limits.
 *
 * - Fields are separated by a configurable single-character delimiter.
 * - Records end with CRLF, LF or a lone CR.
 * - A field may be enclosed in double quotes; inside quotes, delimiters and
 *   line breaks are data and a double quote is written as two double quotes.
 * - A UTF-8 byte order mark at the start is removed.
 * - Blank lines are skipped.
 * - Structural errors (a quote inside an unquoted field, text after a
 *   closing quote, an unterminated quote) stop parsing with the line number,
 *   because the rest of the file cannot be read reliably.
 * - Limits on input size, rows, fields per row and field length are checked
 *   while reading, so oversized input is rejected before it is held in
 *   memory as rows.
 *
 * @packageDocumentation
 */

/** Delimiters accepted by the parser. */
export type CsvDelimiter = ',' | ';' | '\t' | '|';

/** Text encodings accepted by {@link decodeCsvBytes}. */
export type CsvEncoding = 'utf-8' | 'windows-1252';

/** Limits applied while reading CSV input. */
export interface CsvLimits {
  /** Maximum input size in bytes (and in characters after decoding). */
  readonly maxBytes: number;
  /** Maximum number of data rows (the header row is not counted). */
  readonly maxRows: number;
  /** Maximum number of fields in any row. */
  readonly maxFields: number;
  /** Maximum length of a single field in characters. */
  readonly maxFieldLength: number;
}

/** Default limits: 50 MiB, 1,000,000 rows, 500 columns, 10,000 characters per field. */
export const DEFAULT_CSV_LIMITS: CsvLimits = {
  maxBytes: 50 * 1024 * 1024,
  maxRows: 1_000_000,
  maxFields: 500,
  maxFieldLength: 10_000,
};

/** Hard upper bounds that configuration cannot exceed. */
export const CSV_HARD_LIMITS: CsvLimits = {
  maxBytes: 512 * 1024 * 1024,
  maxRows: 5_000_000,
  maxFields: 2_000,
  maxFieldLength: 100_000,
};

/** One data row with the physical line number where it starts (1-based). */
export interface CsvRow {
  readonly line: number;
  readonly fields: readonly string[];
}

/** A parsed CSV file: the header row and the data rows. */
export interface CsvTable {
  readonly header: readonly string[];
  readonly headerLine: number;
  readonly rows: readonly CsvRow[];
}

/** Machine-readable reasons for a CSV failure. */
export type CsvErrorCode =
  | 'input-too-large'
  | 'too-many-rows'
  | 'too-many-fields'
  | 'field-too-long'
  | 'unterminated-quote'
  | 'quote-in-unquoted-field'
  | 'text-after-closing-quote'
  | 'invalid-encoding'
  | 'empty-input'
  | 'invalid-option';

/** A CSV failure with the line where it was detected. */
export interface CsvFailure {
  readonly code: CsvErrorCode;
  readonly message: string;
  readonly line: number | null;
}

/** Result of {@link parseCsv} and {@link decodeCsvBytes}. */
export type CsvResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CsvFailure };

const DELIMITERS: ReadonlySet<string> = new Set([',', ';', '\t', '|']);

function fail<T>(code: CsvErrorCode, message: string, line: number | null): CsvResult<T> {
  return { ok: false, error: { code, message, line } };
}

/**
 * Decodes raw file bytes to text. Rejects input larger than `maxBytes`
 * before decoding and rejects invalid byte sequences instead of replacing
 * them silently. Removes a UTF-8 byte order mark.
 */
export function decodeCsvBytes(bytes: Uint8Array, encoding: CsvEncoding, maxBytes: number): CsvResult<string> {
  if (bytes.byteLength > maxBytes) {
    return fail('input-too-large', `The file is ${bytes.byteLength} bytes; the limit is ${maxBytes} bytes.`, null);
  }
  // Checked at run time too: JavaScript callers are not bound by the type.
  const label: string = encoding;
  if (label !== 'utf-8' && label !== 'windows-1252') {
    return fail('invalid-option', 'Unsupported encoding.', null);
  }
  try {
    const decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: false });
    return { ok: true, value: decoder.decode(bytes) };
  } catch {
    return fail('invalid-encoding', `The file is not valid ${encoding} text. Save it as UTF-8 CSV and try again.`, null);
  }
}

/**
 * Parses CSV text into a header and data rows.
 *
 * @example
 * const result = parseCsv('id,pay\r\n1,"1,5"\r\n', ',', DEFAULT_CSV_LIMITS);
 * // result.ok === true; result.value.rows[0].fields → ['1', '1,5']
 */
export function parseCsv(text: string, delimiter: CsvDelimiter, limits: CsvLimits = DEFAULT_CSV_LIMITS): CsvResult<CsvTable> {
  if (!DELIMITERS.has(delimiter)) return fail('invalid-option', 'Unsupported delimiter.', null);
  if (text.length > limits.maxBytes) {
    return fail('input-too-large', `The input is ${text.length} characters; the limit is ${limits.maxBytes}.`, null);
  }
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRow[] = [];
  const length = input.length;
  let i = 0;
  let line = 1;

  while (i < length) {
    const recordLine = line;
    const fields: string[] = [];
    let endOfRecord = false;
    while (!endOfRecord) {
      let value: string;
      if (input.charCodeAt(i) === 0x22 /* " */) {
        // Quoted field.
        i++;
        const parts: string[] = [];
        let start = i;
        // Characters already moved into `parts`; counted so that a field made
        // of many doubled quotes is stopped at the limit, not after the input.
        let done = 0;
        let closed = false;
        while (i < length) {
          const c = input.charCodeAt(i);
          if (c === 0x22) {
            if (input.charCodeAt(i + 1) === 0x22) {
              parts.push(input.slice(start, i + 1));
              done += i + 1 - start;
              i += 2;
              start = i;
              if (done > limits.maxFieldLength) {
                return fail('field-too-long', `A field is longer than ${limits.maxFieldLength} characters.`, recordLine);
              }
              continue;
            }
            parts.push(input.slice(start, i));
            i++;
            closed = true;
            break;
          }
          if (c === 0x0a) line++;
          else if (c === 0x0d && input.charCodeAt(i + 1) !== 0x0a) line++;
          i++;
          if (done + i - start > limits.maxFieldLength) {
            return fail('field-too-long', `A field is longer than ${limits.maxFieldLength} characters.`, recordLine);
          }
        }
        if (!closed) return fail('unterminated-quote', 'A quoted field is not closed.', recordLine);
        value = parts.join('');
        if (i < length) {
          const next = input.charAt(i);
          if (next !== delimiter && next !== '\n' && next !== '\r') {
            return fail('text-after-closing-quote', 'Unexpected text after a closing quote.', line);
          }
        }
      } else {
        const start = i;
        while (i < length) {
          const ch = input.charAt(i);
          if (ch === delimiter || ch === '\n' || ch === '\r') break;
          if (ch === '"') {
            return fail('quote-in-unquoted-field', 'A double quote appears inside a field that does not start with a quote.', line);
          }
          i++;
        }
        value = input.slice(start, i);
      }
      if (value.length > limits.maxFieldLength) {
        return fail('field-too-long', `A field is longer than ${limits.maxFieldLength} characters.`, recordLine);
      }
      fields.push(value);
      if (fields.length > limits.maxFields) {
        return fail('too-many-fields', `A row has more than ${limits.maxFields} fields.`, recordLine);
      }
      if (i >= length) {
        endOfRecord = true;
      } else {
        const ch = input.charAt(i);
        if (ch === delimiter) {
          i++;
          if (i >= length) {
            // A trailing delimiter at end of input means one more empty field.
            fields.push('');
            endOfRecord = true;
          }
        } else {
          // Line break: CRLF, LF or lone CR.
          if (ch === '\r' && input.charAt(i + 1) === '\n') i += 2;
          else i++;
          line++;
          endOfRecord = true;
        }
      }
    }
    const blank = fields.length === 1 && fields[0] === '';
    if (!blank) {
      records.push({ line: recordLine, fields });
      if (records.length > limits.maxRows + 1) {
        return fail('too-many-rows', `The file has more than ${limits.maxRows} data rows.`, recordLine);
      }
    }
  }

  const [header, ...rows] = records;
  if (header === undefined) return fail('empty-input', 'The file is empty.', null);
  return { ok: true, value: { header: header.fields, headerLine: header.line, rows } };
}
