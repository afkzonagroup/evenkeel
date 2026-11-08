// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * File access for the CLI. Reads are size-limited before the content is
 * loaded. Writes create files with mode 0600, never follow a symbolic link
 * at the target, and never overwrite unless asked.
 *
 * @packageDocumentation
 */

import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

/** Error with a message that is safe to show to the user. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 2,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

function nonblock(): number {
  return typeof constants.O_NONBLOCK === 'number' ? constants.O_NONBLOCK : 0;
}

function assertPath(path: string): void {
  if (path.length === 0 || path.length > 4096 || path.includes('\0')) throw new CliError('Invalid file path.');
}

/**
 * Reads a regular file of at most `maxBytes` bytes. The size is checked on
 * the open file descriptor, and reading stops after `maxBytes + 1` bytes in
 * case the file grows while it is read.
 */
export async function readFileLimited(path: string, maxBytes: number): Promise<Uint8Array> {
  assertPath(path);
  let handle;
  try {
    // O_NONBLOCK: opening a FIFO or device must not hang; such files are then rejected.
    handle = await open(path, constants.O_RDONLY | nonblock());
  } catch {
    throw new CliError(`Cannot open ${JSON.stringify(path)} for reading.`);
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new CliError(`${JSON.stringify(path)} is not a regular file.`);
    if (info.size > maxBytes) throw new CliError(`${JSON.stringify(path)} is ${info.size} bytes; the limit is ${maxBytes} bytes.`, 1);
    const buffer = new Uint8Array(Math.min(info.size, maxBytes) + 1);
    let offset = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
      if (bytesRead === 0) break;
      offset += bytesRead;
      if (offset > maxBytes) throw new CliError(`${JSON.stringify(path)} is larger than the limit of ${maxBytes} bytes.`, 1);
    }
    return buffer.subarray(0, offset);
  } finally {
    await handle.close();
  }
}

/**
 * Writes a file with mode 0600. Without `force`, fails if the file exists.
 * With `force`, truncates an existing regular file but refuses a symbolic
 * link at the target (O_NOFOLLOW, where the platform supports it).
 */
export async function writeFileSafe(path: string, content: string, force: boolean): Promise<void> {
  assertPath(path);
  const nofollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
  const flags = force
    ? constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | nofollow | nonblock()
    : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | nofollow | nonblock();
  let handle;
  try {
    handle = await open(path, flags, 0o600);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    if (code === 'EEXIST') throw new CliError(`${JSON.stringify(path)} already exists. Use --force to overwrite it.`);
    if (code === 'ELOOP') throw new CliError(`${JSON.stringify(path)} is a symbolic link; refusing to write through it.`);
    throw new CliError(`Cannot write ${JSON.stringify(path)}.`);
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new CliError(`${JSON.stringify(path)} is not a regular file.`);
    if (force) await handle.chmod(0o600);
    await handle.writeFile(content, 'utf8');
  } finally {
    await handle.close();
  }
}
