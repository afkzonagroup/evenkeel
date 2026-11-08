// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Calendar date helpers on ISO 8601 dates (YYYY-MM-DD), free of time zones.
 *
 * @packageDocumentation
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A validated calendar date. */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of days in a month (1–12). */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Parses and validates an ISO date such as `2027-06-07`. Returns null when invalid. */
export function parseIsoDate(text: string): CalendarDate | null {
  const m = ISO_DATE.exec(text);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Formats a calendar date as YYYY-MM-DD. */
export function formatIsoDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

/**
 * Adds whole calendar months. When the target month is shorter, the result
 * is its last day (31 August + 6 months = 28 or 29 February).
 *
 * This is an indicative way of counting a period "within N months"; national
 * law may count periods differently.
 */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  if (!Number.isInteger(months) || months < 0 || months > 1200) throw new RangeError('months must be an integer from 0 to 1200');
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}
