import { describe, it, expect } from 'vitest';
import { generateCode, generateDeclaration, generateJs, findKeyCollisions } from '../generator.js';

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

  it('snake naming converts hyphens to underscores', () => {
    const result = generateCode(['--color-primary', '--spacing-md'], undefined, 'snake');
    expect(result).toContain("color_primary: 'var(--color-primary)'");
    expect(result).toContain("spacing_md: 'var(--spacing-md)'");
  });

  it('kebab naming strips -- and keeps hyphens as quoted key', () => {
    const result = generateCode(['--color-primary', '--spacing-md'], undefined, 'kebab');
    expect(result).toContain("'color-primary': 'var(--color-primary)'");
    expect(result).toContain("'spacing-md': 'var(--spacing-md)'");
  });

  it('snake naming with prefix uses underscore separator', () => {
    const result = generateCode(['--color-primary'], 'theme', 'snake');
    expect(result).toContain("theme_color_primary: 'var(--color-primary)'");
  });

  it('kebab naming with prefix uses hyphen separator', () => {
    const result = generateCode(['--color-primary'], 'theme', 'kebab');
    expect(result).toContain("'theme-color-primary': 'var(--color-primary)'");
  });

  it('prefixes digit-starting key with underscore (camelCase)', () => {
    const result = generateCode(['--1st-color', '--2nd-item']);
    expect(result).toContain("_1stColor: 'var(--1st-color)'");
    expect(result).toContain("_2ndItem: 'var(--2nd-item)'");
  });

  it('prefixes digit-starting key with underscore (snake)', () => {
    const result = generateCode(['--1st-color'], undefined, 'snake');
    expect(result).toContain("_1st_color: 'var(--1st-color)'");
  });

  it('does not prefix digit-starting key in kebab (already quoted)', () => {
    const result = generateCode(['--1st-color'], undefined, 'kebab');
    expect(result).toContain("'1st-color': 'var(--1st-color)'");
  });

  it('camelCase collapses consecutive dashes into single boundary', () => {
    const result = generateCode(['--my--var']);
    expect(result).toContain("myVar: 'var(--my--var)'");
  });

  it('snake collapses consecutive dashes into single underscore', () => {
    const result = generateCode(['--my--var'], undefined, 'snake');
    expect(result).toContain("my_var: 'var(--my--var)'");
  });

  it('snake does not produce duplicate keys for --my--var and --my-_var', () => {
    const result = generateCode(['--my--var', '--my-_var'], undefined, 'snake');
    expect(result).toContain("my_var: 'var(--my--var)'");
    expect(result).toContain("my__var: 'var(--my-_var)'");
  });
});

describe('findKeyCollisions', () => {
  it('detects --my--var, --my-var and --myVar colliding on the same camelCase key', () => {
    const collisions = findKeyCollisions(['--my--var', '--my-var', '--myVar']);
    expect(collisions.get('myVar')).toEqual(['--my--var', '--my-var', '--myVar']);
  });

  it('returns an empty map when no keys collide', () => {
    const collisions = findKeyCollisions(['--color-primary', '--spacing-md']);
    expect(collisions.size).toBe(0);
  });

  it('accounts for prefix and naming when detecting collisions', () => {
    const collisions = findKeyCollisions(['--color-primary', '--spacing-md'], 'theme', 'snake');
    expect(collisions.size).toBe(0);
  });

  it('detects collisions under snake naming too', () => {
    const collisions = findKeyCollisions(['--my--var', '--my-var'], undefined, 'snake');
    expect(collisions.get('my_var')).toEqual(['--my--var', '--my-var']);
  });
});

describe('generateJs', () => {
  it('generates plain JS export without as const or CssVarName type', () => {
    const result = generateJs(['--color-primary', '--spacing-md']);
    expect(result).toContain("colorPrimary: 'var(--color-primary)'");
    expect(result).toContain("spacingMd: 'var(--spacing-md)'");
    expect(result).toContain('export const cssVars = {');
    expect(result).toContain('};');
    expect(result).not.toContain('as const');
    expect(result).not.toContain('CssVarName');
  });

  it('includes generated header comment', () => {
    const result = generateJs(['--color-primary']);
    expect(result).toContain('// generated — do not edit');
  });

  it('returns empty cssVars for empty input', () => {
    const result = generateJs([]);
    expect(result).toContain('export const cssVars = {');
    expect(result).toContain('};');
    expect(result).not.toContain('var(--');
  });

  it('applies prefix to generated keys', () => {
    const result = generateJs(['--color-primary'], 'theme');
    expect(result).toContain("themeColorPrimary: 'var(--color-primary)'");
  });

  it('snake naming converts hyphens to underscores', () => {
    const result = generateJs(['--color-primary'], undefined, 'snake');
    expect(result).toContain("color_primary: 'var(--color-primary)'");
  });

  it('kebab naming keeps hyphens as quoted key', () => {
    const result = generateJs(['--color-primary'], undefined, 'kebab');
    expect(result).toContain("'color-primary': 'var(--color-primary)'");
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
