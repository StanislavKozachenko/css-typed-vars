import { describe, it, expect } from 'vitest';
import { generateCode } from '../generator.js';

describe('generateCode', () => {
  it('generates typed constants from var names', () => {
    const result = generateCode(['--color-primary', '--spacing-md']);
    expect(result).toContain("colorPrimary: 'var(--color-primary)'");
    expect(result).toContain("spacingMd: 'var(--spacing-md)'");
  });

  it('exports cssVars as const and CssVarName type', () => {
    const result = generateCode(['--color-primary']);
    expect(result).toContain('export const cssVars = {');
    expect(result).toContain('} as const;');
    expect(result).toContain('export type CssVarName = keyof typeof cssVars;');
  });

  it('includes generated header comment', () => {
    const result = generateCode(['--color-primary']);
    expect(result).toContain('// generated — do not edit');
  });

  it('converts kebab-case to camelCase', () => {
    const result = generateCode(['--font-size-base', '--border-radius-lg']);
    expect(result).toContain("fontSizeBase: 'var(--font-size-base)'");
    expect(result).toContain("borderRadiusLg: 'var(--border-radius-lg)'");
  });

  it('returns empty cssVars for empty input', () => {
    const result = generateCode([]);
    expect(result).toContain('export const cssVars = {');
    expect(result).toContain('} as const;');
    expect(result).not.toContain('var(--');
  });
});
