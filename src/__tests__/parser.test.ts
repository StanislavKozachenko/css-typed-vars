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
});
