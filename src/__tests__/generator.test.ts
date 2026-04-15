import { describe, it, expect } from 'vitest';
import { generateCode, generateDeclaration } from '../generator.js';

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

  it('applies prefix to generated keys', () => {
    const result = generateCode(['--color-primary', '--spacing-md'], 'theme');
    expect(result).toContain("themeColorPrimary: 'var(--color-primary)'");
    expect(result).toContain("themeSpacingMd: 'var(--spacing-md)'");
  });

  it('capitalizes first letter of base key when prefix is set', () => {
    const result = generateCode(['--color-primary'], 'ui');
    expect(result).toContain("uiColorPrimary: 'var(--color-primary)'");
    expect(result).not.toContain("uicolorPrimary:");
  });

  it('produces unchanged keys when prefix is empty string', () => {
    const result = generateCode(['--color-primary'], '');
    expect(result).toContain("colorPrimary: 'var(--color-primary)'");
  });

  it('produces unchanged keys when prefix is undefined', () => {
    const result = generateCode(['--color-primary'], undefined);
    expect(result).toContain("colorPrimary: 'var(--color-primary)'");
  });
});

describe('generateDeclaration', () => {
  it('generates typed exports for css-typed-vars/vars', () => {
    const result = generateDeclaration(['--color-primary', '--spacing-md']);
    expect(result).toContain("colorPrimary: 'var(--color-primary)';");
    expect(result).toContain("spacingMd: 'var(--spacing-md)';");
  });

  it('exports cssVars and CssVarName', () => {
    const result = generateDeclaration(['--color-primary']);
    expect(result).toContain('export declare const cssVars: {');
    expect(result).toContain('export type CssVarName = keyof typeof cssVars;');
  });

  it('returns empty cssVars shape for empty input', () => {
    const result = generateDeclaration([]);
    expect(result).toContain('export declare const cssVars: {');
    expect(result).not.toContain('var(--');
  });

  it('applies prefix in declaration output', () => {
    const result = generateDeclaration(['--color-primary'], 'theme');
    expect(result).toContain("themeColorPrimary: 'var(--color-primary)';");
  });
});
