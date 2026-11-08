// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { configToJson, validateConfig } from '../src/core/config.js';
import { rawConfig } from './helpers.js';

function errors(input: unknown): string[] {
  const r = validateConfig(input);
  return r.ok ? [] : [...r.errors];
}

describe('validateConfig', () => {
  it('accepts a complete configuration and applies technical defaults only', () => {
    const r = validateConfig(rawConfig());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.csv).toMatchObject({ delimiter: ',', decimalSeparator: '.', thousandsSeparator: 'none', encoding: 'utf-8' });
    expect(r.config.minimumGroupSize).toBe(5);
    expect(r.config.duplicateWorkerRows).toBe('reject');
    expect(r.config.decimals).toBe(2);
    expect(r.config.genderCodes.other).toEqual(['X']);
  });

  it('has no defaults for the choices the directive leaves open', () => {
    for (const key of ['otherGender', 'payBases', 'complementaryGapPopulation', 'quartileMethod', 'genderCodes', 'columns']) {
      const input = Object.fromEntries(Object.entries(rawConfig()).filter(([k]) => k !== key));
      expect(errors(input).join('\n'), key).toMatch(new RegExp(`config\\.${key}`));
    }
    expect(errors(rawConfig({ annualPay: undefined })).join()).toMatch(/config\.annualPay is required/);
  });

  it('rejects the "CHOOSE" placeholders written by evenkeel init', () => {
    const e = errors(rawConfig({ otherGender: 'CHOOSE: reject | exclude | include-in-totals' }));
    expect(e.join()).toMatch(/config\.otherGender must be one of/);
  });

  it('rejects unknown keys so typos are caught, including __proto__', () => {
    expect(errors(rawConfig({ quartileMethd: 'x' })).join()).toMatch(/"quartileMethd" is not a known setting/);
    const polluted = JSON.parse('{"__proto__": {"admin": true}}') as Record<string, unknown>;
    expect(errors({ ...rawConfig(), ...polluted }).join()).toMatch(/__proto__/);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it('checks the relationships between settings', () => {
    const cols = (rawConfig().columns ?? {}) as Record<string, unknown>;
    expect(errors(rawConfig({ columns: { ...cols, hours: undefined } })).join()).toMatch(/hours is required for the hourly/);
    expect(errors(rawConfig({ annualPay: 'full-time-equivalent' })).join()).toMatch(/fte is required/);
    expect(errors(rawConfig({ payBases: ['hourly'] })).join()).toMatch(/annualPay is set but/);
    expect(errors(rawConfig({ payBases: ['hourly'], annualPay: undefined }))).toEqual([]);
    expect(errors(rawConfig({ payBases: ['annual', 'annual'] })).join()).toMatch(/twice/);
    expect(errors(rawConfig({ payBases: [] })).join()).toMatch(/payBases must be/);
    expect(errors(rawConfig({ referencePeriod: '2026' })).join()).toMatch(/must be set together/);
    expect(errors(rawConfig({ columns: { ...cols, period: 'year' }, referencePeriod: '2026' }))).toEqual([]);
    expect(errors(rawConfig({ columns: { ...cols, gender: 'basic' } })).join()).toMatch(/more than once/);
    expect(errors(rawConfig({ csv: { decimalSeparator: ',', thousandsSeparator: ',' } })).join()).toMatch(/must differ/);
    expect(errors(rawConfig({ csv: { delimiter: ';', thousandsSeparator: ';' } })).join()).toMatch(/one of/);
    expect(errors(rawConfig({ csv: { delimiter: ',', decimalSeparator: '.', thousandsSeparator: ',' } })).join()).toMatch(/differ from config\.csv\.delimiter/);
  });

  it('rejects gender codes listed in two groups (case-insensitive)', () => {
    expect(errors(rawConfig({ genderCodes: { female: ['F'], male: ['f'] } })).join()).toMatch(/both female and male/);
    expect(errors(rawConfig({ genderCodes: { female: ['F'], male: ['M'], other: ['m'] } })).join()).toMatch(/both male and other/);
  });

  it('validates types, lengths, ranges and unsafe characters', () => {
    expect(errors(null).join()).toMatch(/must be an object/);
    expect(errors([]).join()).toMatch(/must be an object/);
    expect(errors(rawConfig({ version: 2 })).join()).toMatch(/version must be 1/);
    expect(errors(rawConfig({ minimumGroupSize: 0 })).join()).toMatch(/minimumGroupSize/);
    expect(errors(rawConfig({ minimumGroupSize: 2.5 })).join()).toMatch(/minimumGroupSize/);
    expect(errors(rawConfig({ decimals: 7 })).join()).toMatch(/decimals/);
    expect(errors(rawConfig({ csv: { maxBytes: 10 ** 12 } })).join()).toMatch(/maxBytes/);
    expect(errors(rawConfig({ genderCodes: { female: ['F\u202e'], male: ['M'] } })).join()).toMatch(/control or bidirectional/);
    expect(errors(rawConfig({ genderCodes: { female: ['x'.repeat(201)], male: ['M'] } })).join()).toMatch(/at most 200/);
    expect(errors(rawConfig({ genderCodes: { female: [], male: ['M'] } })).join()).toMatch(/1 to 50 entries/);
    expect(errors(rawConfig({ genderCodes: { female: [1], male: ['M'] } })).join()).toMatch(/non-empty string/);
    expect(errors(rawConfig({ $schema: 5 })).join()).toMatch(/\$schema must be a string/);
    expect(errors(rawConfig({ description: 5 })).join()).toMatch(/description must be a string/);
    expect(errors(rawConfig({ description: 'Payroll export, 2026' }))).toEqual([]);
    expect(errors(rawConfig({ columns: 'id' })).join()).toMatch(/columns must be an object/);
    expect(errors(rawConfig({ payBases: 'annual' })).join()).toMatch(/payBases must be/);
  });

  it('round-trips through configToJson', () => {
    const r = validateConfig(rawConfig({ description: 'note', referencePeriod: '2026', columns: { ...(rawConfig().columns as object), period: 'year' } }));
    if (!r.ok) throw new Error(r.errors.join());
    const again = validateConfig(configToJson(r.config));
    expect(again).toEqual(r);
  });
});
