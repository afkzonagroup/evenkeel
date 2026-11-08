// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReportV1 } from './model.js';

/** Renders a report as JSON (schema version 1, two-space indentation, trailing newline). */
export function renderJson(report: ReportV1): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
