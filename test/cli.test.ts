// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CliError, readFileLimited, writeFileSafe } from '../src/cli/node-io.js';
import { run, sanitiseForTerminal, type CliIo } from '../src/cli/run.js';
import { rawConfig } from './helpers.js';

const CSV = ['id,gender,category,basic,bonus,hours', ...Array.from({ length: 12 }, (_, i) => `${i + 1},${i % 2 === 0 ? 'F' : 'M'},${i < 6 ? 'A' : 'B'},${1000 + i * 10},${i % 3 === 0 ? 0 : 50},100`)].join('\n');

function memoryIo(files: Record<string, string> = {}) {
  const store = new Map(Object.entries(files));
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    readFile: (path, max) => {
      const v = store.get(path);
      if (v === undefined) return Promise.reject(new CliError(`Cannot open ${JSON.stringify(path)} for reading.`));
      const bytes = new TextEncoder().encode(v);
      if (bytes.length > max) return Promise.reject(new CliError('too large', 1));
      return Promise.resolve(bytes);
    },
    writeFile: (path, content, force) => {
      if (store.has(path) && !force) return Promise.reject(new CliError(`${JSON.stringify(path)} already exists. Use --force to overwrite it.`));
      store.set(path, content);
      return Promise.resolve();
    },
    now: () => new Date('2027-03-01T12:00:00Z'),
  };
  return { io, store, out: () => out.join(''), err: () => err.join('') };
}

const FILES = { 'pay.csv': CSV, 'cfg.json': JSON.stringify(rawConfig({ minimumGroupSize: 3 })) };

describe('evenkeel CLI', () => {
  it('prints help and version', async () => {
    const m = memoryIo();
    expect(await run(['--help'], m.io)).toBe(0);
    expect(m.out()).toContain('evenkeel report');
    expect(m.out()).toContain('Evenkeel by AFKzona Group');
    expect(await run([], memoryIo().io)).toBe(2);
    const v = memoryIo();
    expect(await run(['--version'], v.io)).toBe(0);
    expect(v.out()).toBe('0.1.1\n');
  });

  it('writes a config template whose open choices must be made before use', async () => {
    const m = memoryIo({ 'pay.csv': CSV });
    expect(await run(['init', '--out', 'cfg.json'], m.io)).toBe(0);
    expect(await run(['init', '--out', 'cfg.json'], m.io)).toBe(2);
    expect(m.err()).toContain('already exists');
    expect(await run(['validate', '--input', 'pay.csv', '--config', 'cfg.json'], m.io)).toBe(1);
    expect(m.err()).toMatch(/config\.otherGender must be one of/);
    expect(m.err()).toMatch(/config\.quartileMethod must be one of/);
  });

  it('validates a payroll file', async () => {
    const m = memoryIo(FILES);
    expect(await run(['validate', '--input', 'pay.csv', '--config', 'cfg.json'], m.io)).toBe(0);
    expect(m.out()).toBe('OK: 12 rows read, 12 used, 0 with another period left out; 12 workers (6 female, 6 male, 0 neither).\n');
  });

  it('reports row errors with line numbers and exit code 1', async () => {
    const m = memoryIo({ ...FILES, 'pay.csv': `${CSV}\n99,Q,A,x,0,100` });
    expect(await run(['validate', '--input', 'pay.csv', '--config', 'cfg.json'], m.io)).toBe(1);
    expect(m.err()).toContain('Line 14 (column "gender"): The gender code "Q" is not listed');
    expect(m.err()).toContain('Line 14 (column "basic"): The amount is not a valid number');
  });

  it('writes reports in every format, to stdout, a file or a directory', async () => {
    const m = memoryIo(FILES);
    expect(await run(['report', '--input', 'pay.csv', '--config', 'cfg.json', '--employer', 'Acme', '--currency', 'EUR'], m.io)).toBe(0);
    expect(m.out()).toContain('# Pay transparency report – Acme');
    expect(m.out()).toContain('Generated 2027-03-01T12:00:00.000Z');
    const j = memoryIo(FILES);
    expect(await run(['report', '--input', 'pay.csv', '--config', 'cfg.json', '--format', 'json', '--out', 'r.json', '--generated-at', '2027-01-01'], j.io)).toBe(0);
    expect(JSON.parse(j.store.get('r.json') ?? '')).toMatchObject({ schemaVersion: '1.0.0', generatedAt: '2027-01-01' });
    const d = memoryIo(FILES);
    expect(await run(['report', '--input', 'pay.csv', '--config', 'cfg.json', '--format', 'md,json,html,csv', '--out-dir', 'out/'], d.io)).toBe(0);
    expect([...d.store.keys()].filter((k) => k.startsWith('out/')).sort()).toEqual(['out/evenkeel-report.csv', 'out/evenkeel-report.html', 'out/evenkeel-report.json', 'out/evenkeel-report.md']);
    expect(await run(['report', '--input', 'pay.csv', '--config', 'cfg.json', '--format', 'md', '--out-dir', 'out'], d.io)).toBe(2);
    expect(await run(['report', '--input', 'pay.csv', '--config', 'cfg.json', '--format', 'md', '--out-dir', 'out', '--force'], d.io)).toBe(0);
  });

  it('warns loudly when small-group protection is switched off', async () => {
    const m = memoryIo(FILES);
    expect(await run(['report', '--input', 'pay.csv', '--config', 'cfg.json', '--no-suppression', '--submission-date', '2027-06-07'], m.io)).toBe(0);
    expect(m.err()).toContain('small-group protection is off');
    expect(m.out()).toContain('INTERNAL');
    expect(m.out()).toContain('2027-12-07');
  });

  it('rejects bad usage with exit code 2', async () => {
    const cases: string[][] = [
      ['nonsense'],
      ['report', '--input', 'pay.csv'],
      ['report', '--input', 'pay.csv', '--config', 'cfg.json', '--format', 'pdf'],
      ['report', '--input', 'pay.csv', '--config', 'cfg.json', '--format', 'md,md', '--out-dir', 'x'],
      ['report', '--input', 'pay.csv', '--config', 'cfg.json', '--format', 'md,json'],
      ['report', '--input', 'pay.csv', '--config', 'cfg.json', '--out', 'a', '--out-dir', 'b'],
      ['report', '--input', 'pay.csv', '--config', 'cfg.json', '--unknown'],
      ['report', '--input', 'pay.csv', '--config', 'cfg.json', 'extra'],
      ['report', '--input', 'pay.csv', '--config', 'cfg.json', '--currency', 'euro'],
      ['report', '--input', 'missing.csv', '--config', 'cfg.json'],
      ['salary-range', '--min', '1', '--currency', 'EUR', '--period', 'week'],
      ['salary-range', '--min', 'x', '--currency', 'EUR', '--period', 'month'],
      ['obligations', '--workers', 'many'],
      ['obligations', '--workers', '10', '--year', '27'],
      ['obligations', '--workers', '10', '--year', '1999'],
    ];
    for (const args of cases) {
      const m = memoryIo(FILES);
      expect(await run(args, m.io), args.join(' ')).toBe(2);
      expect(m.err()).toMatch(/^evenkeel: /);
    }
  });

  it('rejects invalid configuration files with exit code 1', async () => {
    for (const cfg of ['{', '"x"', JSON.stringify({ ...rawConfig(), extra: 1 })]) {
      const m = memoryIo({ ...FILES, 'cfg.json': cfg });
      expect(await run(['validate', '--input', 'pay.csv', '--config', 'cfg.json'], m.io)).toBe(1);
    }
  });

  it('answers an Article 7 request', async () => {
    const m = memoryIo(FILES);
    expect(await run(['request', '--input', 'pay.csv', '--config', 'cfg.json', '--worker', '1', '--request-date', '2027-01-31'], m.io)).toBe(0);
    expect(m.out()).toContain('Answer to your request for pay information');
    expect(m.out()).toContain('2027-03-31');
    const j = memoryIo(FILES);
    expect(await run(['request', '--input', 'pay.csv', '--config', 'cfg.json', '--worker', '1', '--format', 'json'], j.io)).toBe(0);
    expect(JSON.parse(j.out())).toMatchObject({ workerId: '1', category: 'A' });
    const h = memoryIo(FILES);
    expect(await run(['request', '--input', 'pay.csv', '--config', 'cfg.json', '--worker', '1', '--format', 'html', '--out', 'a.html'], h.io)).toBe(0);
    expect(h.store.get('a.html')).toContain('<!doctype html>');
    const x = memoryIo(FILES);
    expect(await run(['request', '--input', 'pay.csv', '--config', 'cfg.json', '--worker', 'nobody'], x.io)).toBe(1);
    expect(await run(['request', '--input', 'pay.csv', '--config', 'cfg.json'], x.io)).toBe(2);
  });

  it('writes salary range text and reporting obligations', async () => {
    const s = memoryIo();
    expect(await run(['salary-range', '--min', '3000', '--max', '3600', '--currency', 'EUR', '--period', 'month', '--collective-agreement', 'Retail 2026'], s.io)).toBe(0);
    expect(s.out()).toBe('Pay range: EUR 3,000.00 – 3,600.00 gross per month. Collective agreement: Retail 2026.\n');
    const o = memoryIo();
    expect(await run(['obligations', '--workers', '180', '--year', '2030'], o.io)).toBe(0);
    expect(o.out()).toContain('A report is due by 2030-06-07, covering calendar year 2029.');
    const p = memoryIo();
    expect(await run(['obligations', '--workers', '180', '--year', '2029'], p.io)).toBe(0);
    expect(p.out()).toContain('No report is due in 2029');
    const v = memoryIo();
    expect(await run(['obligations', '--workers', '40'], v.io)).toBe(0);
    expect(v.out()).toContain('voluntary');
  });

  it('never prints a stack trace for unexpected errors', async () => {
    const m = memoryIo(FILES);
    const io: CliIo = {
      ...m.io,
      readFile: () => Promise.reject(new TypeError('secret internal detail at /home/x')),
    };
    expect(await run(['validate', '--input', 'pay.csv', '--config', 'cfg.json'], io)).toBe(70);
    expect(m.err()).toBe('evenkeel: unexpected error. Please report it with the command you ran (without your data).\n');
  });

  it('removes terminal control characters from error output', async () => {
    expect(sanitiseForTerminal('a\u001b[2Jb\u009bc\u202ed\n')).toBe('a�[2Jb�c�d\n');
    expect(sanitiseForTerminal('tab\tok\u2028\u061c\u200b')).toBe('tab\tok\ufffd\ufffd\ufffd');
    const m = memoryIo(FILES);
    await run(['report', '--input', '\u001b[31mevil', '--config', 'cfg.json'], m.io);
    expect(m.err()).not.toContain('\u001b');
  });
});

describe('node file access', () => {
  let dir = '';
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'evenkeel-test-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads files up to the limit and rejects larger ones', async () => {
    const p = join(dir, 'in.csv');
    await writeFile(p, 'x'.repeat(100));
    expect((await readFileLimited(p, 100)).length).toBe(100);
    await expect(readFileLimited(p, 99)).rejects.toThrow(/limit is 99 bytes/);
    await expect(readFileLimited(dir, 99)).rejects.toThrow(/not a regular file/);
    await expect(readFileLimited(join(dir, 'missing'), 99)).rejects.toThrow(/Cannot open/);
    await expect(readFileLimited('a\0b', 99)).rejects.toThrow(/Invalid file path/);
  });

  it('creates files with mode 0600 and refuses to overwrite without force', async () => {
    const p = join(dir, 'out.md');
    await writeFileSafe(p, 'one', false);
    expect((await stat(p)).mode & 0o777).toBe(0o600);
    await expect(writeFileSafe(p, 'two', false)).rejects.toThrow(/already exists/);
    await writeFile(p, 'old content that is longer');
    // An existing file with wider permissions is narrowed to 0600 on overwrite.
    await chmod(p, 0o644);
    expect((await stat(p)).mode & 0o777).toBe(0o644);
    await writeFileSafe(p, 'two', true);
    expect(await readFile(p, 'utf8')).toBe('two');
    expect((await stat(p)).mode & 0o777).toBe(0o600);
    await expect(writeFileSafe(join(dir, 'no', 'such', 'dir.md'), 'x', false)).rejects.toThrow(/Cannot write/);
  });

  it.skipIf(process.platform === 'win32')('rejects a FIFO without hanging', async () => {
    const fifo = join(dir, 'pipe');
    execFileSync('mkfifo', [fifo]);
    await expect(readFileLimited(fifo, 100)).rejects.toThrow(/not a regular file/);
    await expect(writeFileSafe(fifo, 'x', true)).rejects.toThrow(/Cannot write|not a regular file/);
  });

  it.skipIf(process.platform === 'win32')('refuses to write through a symbolic link', async () => {
    const target = join(dir, 'target.txt');
    const link = join(dir, 'link.txt');
    await writeFile(target, 'keep');
    await symlink(target, link);
    await expect(writeFileSafe(link, 'x', true)).rejects.toThrow(/symbolic link/);
    await expect(writeFileSafe(link, 'x', false)).rejects.toThrow(/already exists|symbolic link/);
    expect(await readFile(target, 'utf8')).toBe('keep');
  });
});
