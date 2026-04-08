import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanVarNames } from '../scanner.js';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'css-typed-vars-'));
  await writeFile(join(dir, 'a.css'), ':root { --color-primary: red; --spacing-md: 8px; }');
  await writeFile(join(dir, 'b.css'), ':root { --color-secondary: blue; --spacing-md: 8px; }');
  await writeFile(join(dir, 'other.txt'), ':root { --ignored: 1px; }');
});

afterAll(async () => {
  await rm(dir, { recursive: true });
});

describe('scanVarNames', () => {
  it('finds all custom properties across multiple CSS files', async () => {
    const result = await scanVarNames(`${dir}/*.css`);
    expect(result).toContain('--color-primary');
    expect(result).toContain('--color-secondary');
    expect(result).toContain('--spacing-md');
  });

  it('deduplicates variables found in multiple files', async () => {
    const result = await scanVarNames(`${dir}/*.css`);
    expect(result.filter(n => n === '--spacing-md')).toHaveLength(1);
  });

  it('ignores non-CSS files', async () => {
    const result = await scanVarNames(`${dir}/*.css`);
    expect(result).not.toContain('--ignored');
  });

  it('returns empty array when no files match', async () => {
    const result = await scanVarNames(`${dir}/*.scss`);
    expect(result).toEqual([]);
  });

  it('accepts array of patterns', async () => {
    const result = await scanVarNames([`${dir}/a.css`, `${dir}/b.css`]);
    expect(result).toContain('--color-primary');
    expect(result).toContain('--color-secondary');
  });
});
