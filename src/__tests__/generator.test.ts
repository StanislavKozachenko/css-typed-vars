import { describe, it, expect, vi } from 'vitest';
import ts from 'typescript';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateCode, generateDeclaration, generateJs, generateTokens, findKeyCollisions, computeKey, computeKeyPath } from '../generator.js';
import type { PropertyRule } from '../parser.js';

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

  it('converts a hyphenated prefix to camelCase instead of emitting an invalid key', () => {
    const result = generateCode(['--color-primary'], 'my-theme');
    expect(result).toContain("myThemeColorPrimary: 'var(--color-primary)'");
  });

  it('converts a hyphenated prefix to snake_case', () => {
    const result = generateCode(['--color-primary'], 'my-theme', 'snake');
    expect(result).toContain("my_theme_color_primary: 'var(--color-primary)'");
  });

  it('prefixes a digit-starting prefix with underscore instead of emitting an invalid key (camelCase)', () => {
    const result = generateCode(['--color-primary'], '123brand');
    expect(result).toContain("_123brandColorPrimary: 'var(--color-primary)'");
  });

  it('prefixes a digit-starting prefix with underscore instead of emitting an invalid key (snake)', () => {
    const result = generateCode(['--color-primary'], '123brand', 'snake');
    expect(result).toContain("_123brand_color_primary: 'var(--color-primary)'");
  });

  it('does not prefix a digit-starting prefix in kebab (already quoted)', () => {
    const result = generateCode(['--color-primary'], '123brand', 'kebab');
    expect(result).toContain("'123brand-color-primary': 'var(--color-primary)'");
  });

  it('strips characters invalid in a bare identifier from prefix (camelCase)', () => {
    const result = generateCode(['--color-primary'], "it's");
    expect(result).toContain("itsColorPrimary: 'var(--color-primary)'");
  });

  it('strips characters invalid in a bare identifier from prefix (snake)', () => {
    const result = generateCode(['--color-primary'], "it's", 'snake');
    expect(result).toContain("its_color_primary: 'var(--color-primary)'");
  });

  it('escapes a quote in prefix instead of breaking the kebab string literal', () => {
    const result = generateCode(['--color-primary'], "it's", 'kebab');
    expect(result).toContain("'it\\'s-color-primary': 'var(--color-primary)'");
  });

  it('escapes a newline in prefix instead of breaking the kebab string literal', () => {
    const result = generateCode(['--color-primary'], 'foo\nbar', 'kebab');
    expect(result).toContain("'foo\\nbar-color-primary': 'var(--color-primary)'");
    expect(result).not.toContain('foo\nbar-color-primary');
  });

  it('escapes a carriage return in prefix instead of breaking the kebab string literal', () => {
    const result = generateCode(['--color-primary'], 'foo\rbar', 'kebab');
    expect(result).toContain("'foo\\rbar-color-primary': 'var(--color-primary)'");
  });

  it('escapes a line separator character in prefix instead of breaking the kebab string literal', () => {
    const lineSeparator = String.fromCharCode(8232);
    const result = generateCode(['--color-primary'], `foo${lineSeparator}bar`, 'kebab');
    expect(result).toContain("'foo\\u2028bar-color-primary': 'var(--color-primary)'");
    expect(result).not.toContain(`foo${lineSeparator}bar-color-primary`);
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

  it('deduplicates a real key collision, keeping only the last-colliding var', () => {
    const result = generateCode(['--my--var', '--my-var'], undefined, 'snake');
    expect(result.match(/my_var:/g)).toHaveLength(1);
    expect(result).toContain("my_var: 'var(--my-var)'");
    expect(result).not.toContain('--my--var');
  });

  it('constant naming converts to SCREAMING_SNAKE_CASE', () => {
    const result = generateCode(['--color-primary', '--spacing-md'], undefined, 'constant');
    expect(result).toContain("COLOR_PRIMARY: 'var(--color-primary)'");
    expect(result).toContain("SPACING_MD: 'var(--spacing-md)'");
  });

  it('constant naming with prefix uses underscore separator', () => {
    const result = generateCode(['--color-primary'], 'theme', 'constant');
    expect(result).toContain("THEME_COLOR_PRIMARY: 'var(--color-primary)'");
  });

  it('constant collapses consecutive dashes into single underscore', () => {
    const result = generateCode(['--my--var'], undefined, 'constant');
    expect(result).toContain("MY_VAR: 'var(--my--var)'");
  });

  it('prefixes digit-starting key with underscore (constant)', () => {
    const result = generateCode(['--1st-color'], undefined, 'constant');
    expect(result).toContain("_1ST_COLOR: 'var(--1st-color)'");
  });

  it('pascal naming converts to PascalCase', () => {
    const result = generateCode(['--color-primary', '--spacing-md'], undefined, 'pascal');
    expect(result).toContain("ColorPrimary: 'var(--color-primary)'");
    expect(result).toContain("SpacingMd: 'var(--spacing-md)'");
  });

  it('pascal naming with prefix concatenates both capitalized', () => {
    const result = generateCode(['--color-primary'], 'theme', 'pascal');
    expect(result).toContain("ThemeColorPrimary: 'var(--color-primary)'");
  });

  it('pascal collapses consecutive dashes into single boundary', () => {
    const result = generateCode(['--my--var'], undefined, 'pascal');
    expect(result).toContain("MyVar: 'var(--my--var)'");
  });

  it('prefixes digit-starting key with underscore (pascal)', () => {
    const result = generateCode(['--1st-color'], undefined, 'pascal');
    expect(result).toContain("_1stColor: 'var(--1st-color)'");
  });
});

describe('naming validation', () => {
  it('throws for an unsupported naming value', () => {
    expect(() => generateCode(['--color-primary'], undefined, 'PascalCase' as never)).toThrow(
      /invalid naming "PascalCase"/,
    );
  });

  it('throws for an unsupported naming value in generateJs', () => {
    expect(() => generateJs(['--color-primary'], undefined, 'PascalCase' as never)).toThrow(
      /invalid naming "PascalCase"/,
    );
  });

  it('throws for an unsupported naming value in generateDeclaration', () => {
    expect(() => generateDeclaration(['--color-primary'], undefined, 'PascalCase' as never)).toThrow(
      /invalid naming "PascalCase"/,
    );
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

  it('never emits a duplicate type-literal property on key collision', () => {
    const result = generateDeclaration(['--my--var', '--my-var'], undefined, 'snake');
    expect(result.match(/my_var:/g)).toHaveLength(1);
    expect(result).toContain("my_var: 'var(--my-var)';");
  });
});

describe('JSDoc @default comments', () => {
  it('emits @default above the key when a declared value is available (generateCode)', () => {
    const declarations = new Map([['--color-primary', 'red']]);
    const result = generateCode(['--color-primary'], undefined, undefined, declarations);
    expect(result).toContain("/** @default red */\n  colorPrimary: 'var(--color-primary)',");
  });

  it('emits @default above the key (generateJs)', () => {
    const declarations = new Map([['--color-primary', 'red']]);
    const result = generateJs(['--color-primary'], undefined, undefined, declarations);
    expect(result).toContain("/** @default red */\n  colorPrimary: 'var(--color-primary)',");
  });

  it('emits @default above the key (generateDeclaration)', () => {
    const declarations = new Map([['--color-primary', 'red']]);
    const result = generateDeclaration(['--color-primary'], undefined, undefined, declarations);
    expect(result).toContain("/** @default red */\n  colorPrimary: 'var(--color-primary)';");
  });

  it('omits the comment entirely when no declarations map is given', () => {
    const result = generateCode(['--color-primary']);
    expect(result).not.toContain('@default');
  });

  it('omits the comment for a var with no entry in the declarations map', () => {
    const declarations = new Map([['--spacing-md', '8px']]);
    const result = generateCode(['--color-primary', '--spacing-md'], undefined, undefined, declarations);
    expect(result).not.toContain('@default red');
    expect(result).toContain('@default 8px');
  });

  it('escapes a value containing */ so it cannot break out of the block comment', () => {
    const declarations = new Map([['--weird', 'foo */ bar']]);
    const result = generateCode(['--weird'], undefined, undefined, declarations);
    expect(result).toContain('/** @default foo *\\/ bar */');
  });
});

describe('grouped output (group: true)', () => {
  it('nests entries under their first hyphen segment (generateCode)', () => {
    const result = generateCode(['--color-primary', '--color-secondary', '--spacing-md'], undefined, undefined, undefined, true);
    expect(result).toContain('color: {');
    expect(result).toContain("    primary: 'var(--color-primary)',");
    expect(result).toContain("    secondary: 'var(--color-secondary)',");
    expect(result).toContain("  },");
    expect(result).toContain('spacing: {');
    expect(result).toContain("    md: 'var(--spacing-md)',");
  });

  it('leaves a var with no hyphen ungrouped', () => {
    const result = generateCode(['--radius'], undefined, undefined, undefined, true);
    expect(result).toContain("  radius: 'var(--radius)',");
    expect(result).not.toContain('radius: {');
  });

  it('drops a standalone var when its key collides with a group (group wins)', () => {
    const result = generateCode(['--color', '--color-primary'], undefined, undefined, undefined, true);
    expect(result).toContain('color: {');
    expect(result).toContain("    primary: 'var(--color-primary)',");
    expect(result).not.toContain("  color: 'var(--color)',");
  });

  it('omits the CssVarName type export in grouped mode', () => {
    const result = generateCode(['--color-primary'], undefined, undefined, undefined, true);
    expect(result).not.toContain('CssVarName');
  });

  it('applies naming convention to both group and leaf keys', () => {
    const result = generateCode(['--color-primary'], undefined, 'constant', undefined, true);
    expect(result).toContain('COLOR: {');
    expect(result).toContain("    PRIMARY: 'var(--color-primary)',");
  });

  it('emits @default comments inside groups', () => {
    const declarations = new Map([['--color-primary', 'red']]);
    const result = generateCode(['--color-primary'], undefined, undefined, declarations, true);
    expect(result).toContain("    /** @default red */\n    primary: 'var(--color-primary)',");
  });

  it('throws when combined with prefix', () => {
    expect(() => generateCode(['--color-primary'], 'theme', undefined, undefined, true)).toThrow(/cannot be combined with "prefix"/);
  });

  it('nests entries in generateJs', () => {
    const result = generateJs(['--color-primary'], undefined, undefined, undefined, true);
    expect(result).toContain('color: {');
    expect(result).toContain("    primary: 'var(--color-primary)',");
  });

  it('nests entries with semicolon member separators in generateDeclaration', () => {
    const result = generateDeclaration(['--color-primary', '--radius'], undefined, undefined, undefined, true);
    expect(result).toContain('color: {');
    expect(result).toContain("    primary: 'var(--color-primary)';");
    expect(result).toContain('  };');
    expect(result).toContain("  radius: 'var(--radius)';");
    expect(result).not.toContain('CssVarName');
  });
});

describe('computeKey', () => {
  it('matches the key generateCode would produce for camelCase', () => {
    expect(computeKey('--color-primary')).toBe('colorPrimary');
  });

  it('matches the key generateCode would produce with a prefix', () => {
    expect(computeKey('--color-primary', 'theme')).toBe('themeColorPrimary');
  });

  it('matches the unquoted kebab key (what a bracket-access usage would contain)', () => {
    expect(computeKey('--color-primary', undefined, 'kebab')).toBe('color-primary');
  });

  it('matches the constant-case key', () => {
    expect(computeKey('--color-primary', undefined, 'constant')).toBe('COLOR_PRIMARY');
  });
});

describe('options object', () => {
  const names = ['--color-primary', '--spacing-md'];
  const declarations = new Map([['--color-primary', 'red'], ['--spacing-md', '8px']]);

  it('produces the same output as the legacy positional arguments', () => {
    expect(generateCode(names, { prefix: 'ds', naming: 'snake', declarations }))
      .toBe(generateCode(names, 'ds', 'snake', declarations));
    expect(generateJs(names, { group: true, declarations }))
      .toBe(generateJs(names, undefined, undefined, declarations, true));
    expect(generateDeclaration(names, { naming: 'kebab' }))
      .toBe(generateDeclaration(names, undefined, 'kebab'));
  });

  it('applies options passed as an object', () => {
    const result = generateCode(names, { naming: 'constant', declarations });
    expect(result).toContain("COLOR_PRIMARY: 'var(--color-primary)'");
    expect(result).toContain('/** @default red */');
  });

  it('treats an empty options object like no options', () => {
    expect(generateCode(names, {})).toBe(generateCode(names));
  });
});

describe('runtime helpers (helpers: true)', () => {
  const names = ['--color-primary', '--spacing-md'];

  it('is off by default', () => {
    expect(generateCode(names)).not.toContain('getCssVar');
    expect(generateJs(names)).not.toContain('getCssVar');
    expect(generateDeclaration(names)).not.toContain('getCssVar');
  });

  it('emits CssVarRef and typed helpers in TS output', () => {
    const result = generateCode(names, { helpers: true });
    expect(result).toContain("export type CssVarRef = 'var(--color-primary)' | 'var(--spacing-md)';");
    expect(result).toContain('export function getCssVar(ref: CssVarRef, el: Element = document.documentElement): string {');
    expect(result).toContain('export function setCssVar(ref: CssVarRef, value: string, el: HTMLElement = document.documentElement): void {');
    expect(result).toContain('export type CssVarName = keyof typeof cssVars;');
  });

  it('emits untyped helpers in JS output and declarations in .d.ts output', () => {
    expect(generateJs(names, { helpers: true })).toContain('export function getCssVar(ref, el = document.documentElement) {');
    const dts = generateDeclaration(names, { helpers: true });
    expect(dts).toContain("export type CssVarRef = 'var(--color-primary)' | 'var(--spacing-md)';");
    expect(dts).toContain('export declare function getCssVar(ref: CssVarRef, el?: Element): string;');
    expect(dts).toContain('export declare function setCssVar(ref: CssVarRef, value: string, el?: HTMLElement): void;');
  });

  it('keeps CssVarRef independent of naming and prefix', () => {
    const result = generateCode(names, { helpers: true, naming: 'constant', prefix: 'ds' });
    expect(result).toContain("export type CssVarRef = 'var(--color-primary)' | 'var(--spacing-md)';");
  });

  it('covers grouped leaves and omits a standalone var dropped by a group', () => {
    const result = generateCode(['--color', '--color-primary', '--gap'], { helpers: true, group: true });
    expect(result).toContain("export type CssVarRef = 'var(--color-primary)' | 'var(--gap)';");
    expect(result).not.toContain('CssVarName');
  });

  it('keeps only the last var of a key collision', () => {
    const result = generateCode(['--color-primary', '--color--primary'], { helpers: true });
    expect(result).toContain("export type CssVarRef = 'var(--color--primary)';");
  });

  it('falls back to never when there are no vars', () => {
    expect(generateCode([], { helpers: true })).toContain('export type CssVarRef = never;');
  });

  it('reads and writes the underlying custom property at runtime', () => {
    const js = generateJs(['--color-primary'], { helpers: true });
    const setProperty = vi.fn();
    const getPropertyValue = vi.fn(() => ' red ');
    const el = { style: { setProperty } };
    const run = new Function('getComputedStyle', 'document',
      js.replace(/^export /gm, '') + '\nreturn { getCssVar, setCssVar, cssVars };');
    const { getCssVar, setCssVar, cssVars } = run(() => ({ getPropertyValue }), { documentElement: el });
    expect(getCssVar(cssVars.colorPrimary)).toBe('red');
    expect(getPropertyValue).toHaveBeenCalledWith('--color-primary');
    setCssVar(cssVars.colorPrimary, 'blue');
    expect(setProperty).toHaveBeenCalledWith('--color-primary', 'blue');
  });

  it('builds var() fallbacks at runtime', () => {
    const js = generateJs(['--color-primary', '--gap'], { helpers: true });
    const { withFallback, cssVars } = new Function(js.replace(/^export /gm, '') + '\nreturn { withFallback, cssVars };')();
    expect(withFallback(cssVars.colorPrimary, '#fff')).toBe('var(--color-primary, #fff)');
    expect(withFallback(cssVars.gap, 0)).toBe('var(--gap, 0)');
    expect(withFallback(cssVars.gap, cssVars.colorPrimary)).toBe('var(--gap, var(--color-primary))');
  });

  it('emits withFallback in TS, JS and .d.ts output', () => {
    const names = ['--color-primary'];
    expect(generateCode(names, { helpers: true })).toContain('export function withFallback<R extends CssVarRef, F extends string | number>(ref: R, fallback: F): CssVarWithFallback<R, F> {');
    expect(generateJs(names, { helpers: true })).toContain('export function withFallback(ref, fallback) {');
    expect(generateDeclaration(names, { helpers: true })).toContain('export declare function withFallback<R extends CssVarRef, F extends string | number>(ref: R, fallback: F): CssVarWithFallback<R, F>;');
  });

  it('types the withFallback result as a precise literal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'css-typed-vars-fallback-'));
    try {
      writeFileSync(join(dir, 'vars.ts'), generateCode(['--color-primary', '--gap'], { helpers: true, group: true }));
      writeFileSync(join(dir, 'use.ts'), [
        "import { cssVars, withFallback } from './vars';",
        "export const a: 'var(--color-primary, #fff)' = withFallback(cssVars.color.primary, '#fff');",
        "export const b: 'var(--gap, 0)' = withFallback(cssVars.gap, 0);",
        "export const c: 'var(--gap, var(--color-primary))' = withFallback(cssVars.gap, cssVars.color.primary);",
        "export const wrong: 'var(--gap, 1)' = withFallback(cssVars.gap, 2);",
        '',
      ].join('\n'));
      const program = ts.createProgram([join(dir, 'use.ts')], { strict: true, noEmit: true, types: [], target: ts.ScriptTarget.ES2020, lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'] });
      const errors = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(`Type '"var(--gap, 2)"' is not assignable to type '"var(--gap, 1)"'`);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});


describe('theme values (themes option)', () => {
  const declarations = new Map([['--color-bg', '#fff']]);
  const themes = new Map([
    ['dark', new Map([['--color-bg', '#000'], ['--dark-only', '1px']])],
    ['hc', new Map([['--color-bg', '#ff0']])],
  ]);

  it('emits one @theme tag per theme value, under @default', () => {
    const result = generateCode(['--color-bg', '--dark-only'], { declarations, themes });
    expect(result).toContain([
      '  /**',
      '   * @default #fff',
      '   * @theme dark #000',
      '   * @theme hc #ff0',
      '   */',
      "  colorBg: 'var(--color-bg)',",
    ].join('\n'));
    expect(result).toContain("  /** @theme dark 1px */\n  darkOnly: 'var(--dark-only)',");
  });

  it('emits theme tags in grouped and declaration output too', () => {
    expect(generateCode(['--color-bg'], { declarations, themes, group: true })).toContain('     * @theme dark #000\n     * @theme hc #ff0\n     */\n    bg:');
    expect(generateDeclaration(['--color-bg'], { declarations, themes })).toContain('   * @theme hc #ff0\n   */');
  });

  it('escapes */ in a theme value', () => {
    const result = generateCode(['--x'], { themes: new Map([['dark', new Map([['--x', 'a*/b']])]]) });
    expect(result).toContain('/** @theme dark a*\\/b */');
  });
});

describe('generateTokens (DTCG JSON)', () => {
  const names = ['--color-primary', '--color-link', '--spacing-md', '--duration'];
  const declarations = new Map([
    ['--color-primary', '#3b82f6'],
    ['--color-link', 'var(--color-primary)'],
    ['--spacing-md', '8px'],
    ['--duration', '200ms'],
  ]);
  const properties = new Map<string, PropertyRule>([
    ['--color-primary', { syntax: "'<color>'" }],
    ['--spacing-md', { syntax: '"<length>"' }],
    ['--duration', { syntax: "'<time>'" }],
  ]);

  it('emits flat tokens keyed like the generated object', () => {
    const tokens = JSON.parse(generateTokens(names, { declarations }));
    expect(tokens).toEqual({
      colorLink: { $value: '{colorPrimary}' },
      colorPrimary: { $value: '#3b82f6' },
      duration: { $value: '200ms' },
      spacingMd: { $value: '8px' },
    });
  });

  it('infers $type from the @property syntax', () => {
    const tokens = JSON.parse(generateTokens(names, { declarations, properties }));
    expect(tokens.colorPrimary.$type).toBe('color');
    expect(tokens.spacingMd.$type).toBe('dimension');
    expect(tokens.duration.$type).toBe('duration');
    expect(tokens.colorLink.$type).toBeUndefined();
  });

  it('nests tokens by group and uses dotted aliases', () => {
    const tokens = JSON.parse(generateTokens(names, { declarations, group: true, naming: 'kebab' }));
    expect(tokens.color).toEqual({ primary: { $value: '#3b82f6' }, link: { $value: '{color.primary}' } });
    expect(tokens.spacing.md.$value).toBe('8px');
    expect(tokens.duration.$value).toBe('200ms');
  });

  it('applies the prefix to keys and aliases', () => {
    const tokens = JSON.parse(generateTokens(['--a', '--b'], { prefix: 'ds', declarations: new Map([['--a', '1px'], ['--b', 'var( --a )']]) }));
    expect(tokens).toEqual({ dsA: { $value: '1px' }, dsB: { $value: '{dsA}' } });
  });

  it('keeps var() references to vars outside the document as-is', () => {
    const tokens = JSON.parse(generateTokens(['--a'], { declarations: new Map([['--a', 'var(--elsewhere)']]) }));
    expect(tokens.a.$value).toBe('var(--elsewhere)');
  });

  it('puts theme values under $extensions, resolving aliases there too', () => {
    const themes = new Map([['dark', new Map([['--color-primary', '#60a5fa'], ['--color-link', 'var(--color-primary)']])]]);
    const tokens = JSON.parse(generateTokens(names, { declarations, themes }));
    expect(tokens.colorPrimary.$extensions).toEqual({ 'css-typed-vars': { themes: { dark: '#60a5fa' } } });
    expect(tokens.colorLink.$extensions['css-typed-vars'].themes.dark).toBe('{colorPrimary}');
    expect(tokens.spacingMd.$extensions).toBeUndefined();
  });

  it('falls back to the @property initial-value and skips vars with no default', () => {
    const themes = new Map([['dark', new Map([['--glow', '2px']])]]);
    const tokens = JSON.parse(generateTokens(['--mode', '--glow'], {
      properties: new Map([['--mode', { syntax: '"light | dark"', initialValue: 'light' }]]),
      themes,
    }));
    expect(tokens).toEqual({ mode: { $value: 'light' } });
  });

  it('does not alias to a skipped var', () => {
    const tokens = JSON.parse(generateTokens(['--a', '--b'], {
      declarations: new Map([['--b', 'var(--a)']]),
      themes: new Map([['dark', new Map([['--a', '1px']])]]),
    }));
    expect(tokens).toEqual({ b: { $value: 'var(--a)' } });
  });

  it('ends with a newline and rejects group + prefix', () => {
    expect(generateTokens(['--a'], { declarations: new Map([['--a', '1']]) }).endsWith('}\n')).toBe(true);
    expect(() => generateTokens(['--a-b'], { group: true, prefix: 'x' })).toThrow(/cannot be combined with "prefix"/);
  });
});

describe('CSS doc comments (docs option)', () => {
  const docs = new Map([
    ['--color-primary', { description: 'Primary brand color.' }],
    ['--color-link', { description: 'Old link color.\nKept for v1.', deprecated: 'use --color-primary' as const }],
    ['--c', { deprecated: true as const }],
  ]);
  const declarations = new Map([['--color-primary', '#3b82f6'], ['--color-link', 'blue'], ['--c', '3']]);

  it('emits the description first and @deprecated last, in one block', () => {
    const result = generateCode(['--color-link', '--color-primary', '--c'], { declarations, docs });
    expect(result).toContain(['  /**', '   * Old link color.', '   * Kept for v1.', '   * @default blue', '   * @deprecated use --color-primary', '   */', "  colorLink: 'var(--color-link)',"].join('\n'));
    expect(result).toContain(['  /**', '   * Primary brand color.', '   * @default #3b82f6', '   */'].join('\n'));
    expect(result).toContain(['  /**', '   * @default 3', '   * @deprecated', '   */'].join('\n'));
  });

  it('uses the single-line form for a lone one-line description', () => {
    const result = generateCode(['--x'], { docs: new Map([['--x', { description: 'Just text.' }]]) });
    expect(result).toContain("  /** Just text. */\n  x: 'var(--x)',");
  });

  it('makes TypeScript show the description and flag deprecated usages', () => {
    const source = generateCode(['--color-link', '--color-primary'], { declarations, docs }) + 'cssVars.colorLink;\ncssVars.colorPrimary;\n';
    const files: Record<string, string> = { '/vars.ts': source };
    const service = ts.createLanguageService({
      getScriptFileNames: () => Object.keys(files),
      getScriptVersion: () => '1',
      getScriptSnapshot: (file) => (files[file] === undefined ? undefined : ts.ScriptSnapshot.fromString(files[file])),
      getCurrentDirectory: () => '/',
      getCompilationSettings: () => ({ strict: true, noLib: true }),
      getDefaultLibFileName: () => '/lib.d.ts',
      fileExists: (file) => files[file] !== undefined,
      readFile: (file) => files[file],
    });
    const info = service.getQuickInfoAtPosition('/vars.ts', source.lastIndexOf('colorPrimary'));
    expect(ts.displayPartsToString(info?.documentation)).toBe('Primary brand color.');
    const deprecated = service.getSuggestionDiagnostics('/vars.ts')
      .filter((d) => d.reportsDeprecated)
      .map((d) => source.slice(d.start!, d.start! + d.length!));
    expect(deprecated).toEqual(['colorLink']);
  });

  it('carries docs into design tokens as $description / $deprecated', () => {
    const tokens = JSON.parse(generateTokens(['--color-link', '--color-primary', '--c'], { declarations, docs }));
    expect(tokens.colorPrimary).toEqual({ $value: '#3b82f6', $description: 'Primary brand color.' });
    expect(tokens.colorLink.$deprecated).toBe('use --color-primary');
    expect(tokens.c.$deprecated).toBe(true);
  });

  it('escapes */ in a description', () => {
    expect(generateCode(['--x'], { docs: new Map([['--x', { description: 'a */ b' }]]) })).toContain('/** a *\\/ b */');
  });
});

describe('computeKeyPath', () => {
  it('returns the flat key when group is off', () => {
    expect(computeKeyPath('--color-primary', 'ds')).toEqual(['dsColorPrimary']);
  });

  it('returns [group, leaf] when group is on', () => {
    expect(computeKeyPath('--color-primary-dark', undefined, 'snake', true)).toEqual(['color', 'primary_dark']);
  });

  it('returns a single key for a name with nothing to group by', () => {
    expect(computeKeyPath('--gap', undefined, undefined, true)).toEqual(['gap']);
  });
});

describe('@property syntax support', () => {
  const colorRule: PropertyRule = { syntax: "'<color>'" };
  const enumRule: PropertyRule = { syntax: '"light | dark | system"' };

  it('emits an @syntax JSDoc comment with quotes stripped (generateCode)', () => {
    const properties = new Map([['--color-primary', colorRule]]);
    const result = generateCode(['--color-primary'], undefined, undefined, undefined, undefined, properties);
    expect(result).toContain("/** @syntax <color> */\n  colorPrimary: 'var(--color-primary)',");
  });

  it('emits an @syntax comment (generateJs)', () => {
    const properties = new Map([['--color-primary', colorRule]]);
    const result = generateJs(['--color-primary'], undefined, undefined, undefined, undefined, properties);
    expect(result).toContain("/** @syntax <color> */\n  colorPrimary: 'var(--color-primary)',");
  });

  it('emits an @syntax comment (generateDeclaration)', () => {
    const properties = new Map([['--color-primary', colorRule]]);
    const result = generateDeclaration(['--color-primary'], undefined, undefined, undefined, undefined, properties);
    expect(result).toContain("/** @syntax <color> */\n  colorPrimary: 'var(--color-primary)';");
  });

  it('puts @default and @syntax in one block when both are available', () => {
    const declarations = new Map([['--color-primary', 'red']]);
    const properties = new Map([['--color-primary', colorRule]]);
    const result = generateCode(['--color-primary'], undefined, undefined, declarations, undefined, properties);
    expect(result).toContain("  /**\n   * @default red\n   * @syntax <color>\n   */\n  colorPrimary: 'var(--color-primary)',");
  });

  it('merges several tags into one block that TypeScript quick info reads in full', () => {
    const code = generateCode(['--color-bg'], {
      declarations: new Map([['--color-bg', '#fff']]),
      themes: new Map([['dark', new Map([['--color-bg', '#000']])]]),
      properties: new Map([['--color-bg', colorRule]]),
    });
    const source = code + 'cssVars.colorBg;\n';
    const files: Record<string, string> = { '/vars.ts': source };
    const service = ts.createLanguageService({
      getScriptFileNames: () => Object.keys(files),
      getScriptVersion: () => '1',
      getScriptSnapshot: (file) => (files[file] === undefined ? undefined : ts.ScriptSnapshot.fromString(files[file])),
      getCurrentDirectory: () => '/',
      getCompilationSettings: () => ({ strict: true, noLib: true }),
      getDefaultLibFileName: () => '/lib.d.ts',
      fileExists: (file) => files[file] !== undefined,
      readFile: (file) => files[file],
    });
    const info = service.getQuickInfoAtPosition('/vars.ts', source.lastIndexOf('colorBg'));
    expect(info?.tags?.map((tag) => `${tag.name} ${ts.displayPartsToString(tag.text)}`)).toEqual([
      'default #fff',
      'theme dark #000',
      'syntax <color>',
    ]);
  });

  it('continues a multi-line value inside a merged block', () => {
    const result = generateCode(['--shadow'], {
      declarations: new Map([['--shadow', '0 1px red,\n0 2px blue']]),
      themes: new Map([['dark', new Map([['--shadow', 'none']])]]),
    });
    expect(result).toContain(['  /**', '   * @default 0 1px red,', '   * 0 2px blue', '   * @theme dark none', '   */'].join('\n'));
  });

  it('omits the comment when there is no property rule', () => {
    const result = generateCode(['--color-primary']);
    expect(result).not.toContain('@syntax');
  });

  it('generates a union type for an enum-like custom-ident syntax', () => {
    const properties = new Map([['--theme-mode', enumRule]]);
    const result = generateCode(['--theme-mode'], undefined, undefined, undefined, undefined, properties);
    expect(result).toContain("export type ThemeModeSyntax = 'light' | 'dark' | 'system';");
  });

  it('generates the union type in generateDeclaration too', () => {
    const properties = new Map([['--theme-mode', enumRule]]);
    const result = generateDeclaration(['--theme-mode'], undefined, undefined, undefined, undefined, properties);
    expect(result).toContain("export type ThemeModeSyntax = 'light' | 'dark' | 'system';");
  });

  it('does not generate a union type for a generic data-type syntax', () => {
    const properties = new Map([['--color-primary', colorRule]]);
    const result = generateCode(['--color-primary'], undefined, undefined, undefined, undefined, properties);
    expect(result).not.toContain('Syntax =');
  });

  it('never generates a union type in generateJs (plain JS has no export type)', () => {
    const properties = new Map([['--theme-mode', enumRule]]);
    const result = generateJs(['--theme-mode'], undefined, undefined, undefined, undefined, properties);
    expect(result).not.toContain('export type');
  });

  it('guards the type name against a digit-leading pascal conversion', () => {
    const properties = new Map([['--1st-mode', enumRule]]);
    const result = generateCode(['--1st-mode'], undefined, undefined, undefined, undefined, properties);
    expect(result).toContain("export type _1stModeSyntax = 'light' | 'dark' | 'system';");
  });

  it('also emits @syntax comments and union types for grouped output', () => {
    const properties = new Map([['--color-primary', enumRule]]);
    const result = generateCode(['--color-primary'], undefined, undefined, undefined, true, properties);
    expect(result).toContain('color: {');
    expect(result).toContain("    /** @syntax light | dark | system */\n    primary: 'var(--color-primary)',");
    expect(result).toContain("export type ColorPrimarySyntax = 'light' | 'dark' | 'system';");
  });
});
