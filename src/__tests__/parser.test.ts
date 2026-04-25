import { describe, it, expect } from 'vitest';
import { parseVarNames } from '../parser.js';

describe('parseVarNames', () => {
  it('extracts custom properties from :root block', () => {
    const css = `:root {
      --color-primary: #3b82f6;
      --spacing-md: 8px;
    }`;
    expect(parseVarNames(css)).toEqual(['--color-primary', '--spacing-md']);
  });

  it('returns empty array when no :root block', () => {
    const css = `.foo { --color: red; }`;
    expect(parseVarNames(css)).toEqual([]);
  });

  it('ignores variables outside :root', () => {
    const css = `
      :root { --color-primary: red; }
      .foo { --local-var: blue; }
    `;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('deduplicates variables across multiple :root blocks', () => {
    const css = `
      :root { --color: red; }
      :root { --color: blue; --spacing: 8px; }
    `;
    expect(parseVarNames(css)).toEqual(['--color', '--spacing']);
  });

  it('returns empty array for empty css', () => {
    expect(parseVarNames('')).toEqual([]);
  });

  it('ignores variables inside CSS block comments', () => {
    const css = `:root {
      /* --fake-var: #fff; */
      --color-primary: red;
    }`;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('ignores variables inside SCSS single-line comments', () => {
    const css = `:root {
      // --fake-var: #fff;
      --color-primary: red;
    }`;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('handles :root with attribute selector', () => {
    const css = `:root[data-theme="dark"] { --color-primary: #000; }`;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('handles :root inside @media block', () => {
    const css = `
      @media (prefers-color-scheme: dark) {
        :root { --color-primary: #000; }
      }
    `;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('handles variable names with uppercase and underscores', () => {
    const css = `:root { --colorPrimary: red; --color_secondary: blue; }`;
    expect(parseVarNames(css)).toEqual(['--colorPrimary', '--color_secondary']);
  });

  it('picks up variables from additional selectors', () => {
    const css = `
      :root { --color-primary: red; }
      .dark { --color-primary: #000; --color-bg: #111; }
    `;
    const result = parseVarNames(css, ['.dark']);
    expect(result).toContain('--color-primary');
    expect(result).toContain('--color-bg');
  });

  it('without selectors option still ignores non-root blocks', () => {
    const css = `
      :root { --color-primary: red; }
      .dark { --color-bg: #111; }
    `;
    expect(parseVarNames(css)).toEqual(['--color-primary']);
  });

  it('supports attribute selector syntax', () => {
    const css = `[data-theme="dark"] { --color-bg: #111; --color-text: #fff; }`;
    const result = parseVarNames(css, ['[data-theme="dark"]']);
    expect(result).toContain('--color-bg');
    expect(result).toContain('--color-text');
  });

  it('deduplicates variables across :root and extra selectors', () => {
    const css = `
      :root { --color: red; }
      .dark { --color: #000; --extra: 1px; }
    `;
    const result = parseVarNames(css, ['.dark']);
    expect(result.filter(n => n === '--color')).toHaveLength(1);
    expect(result).toContain('--extra');
  });
});
