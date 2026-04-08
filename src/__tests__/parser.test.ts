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
});
