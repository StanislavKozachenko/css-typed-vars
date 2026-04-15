import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generate } from '../index.js';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'css-typed-vars-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true });
});

describe('generate', () => {
  it('writes cssVars.ts with typed constants', async () => {
    const input = join(dir, 'vars.css');
    const output = join(dir, 'cssVars.ts');

    const { writeFile } = await import('node:fs/promises');
    await writeFile(input, ':root { --color-primary: red; --spacing-md: 8px; }');

    await generate({ input, output });

    const result = await readFile(output, 'utf8');
    expect(result).toContain("colorPrimary: 'var(--color-primary)'");
    expect(result).toContain("spacingMd: 'var(--spacing-md)'");
    expect(result).toContain('export const cssVars');
    expect(result).toContain('export type CssVarName');
  });

  it('creates output directory if it does not exist', async () => {
    const input = join(dir, 'vars.css');
    const output = join(dir, 'nested', 'deep', 'cssVars.ts');

    await generate({ input, output });

    const result = await readFile(output, 'utf8');
    expect(result).toContain('export const cssVars');
  });

  it('excludes files matching exclude pattern', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const subdir = join(dir, 'vendor');
    await mkdir(subdir, { recursive: true });
    await writeFile(join(subdir, 'lib.css'), ':root { --vendor-var: 1px; }');

    const output = join(dir, 'excludeVars.ts');
    await generate({ input: `${dir}/**/*.css`, output, exclude: `${dir}/vendor/**` });

    const result = await readFile(output, 'utf8');
    expect(result).not.toContain('--vendor-var');
  });

  it('generates JS file and .d.ts when output ends in .js', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'js-test.css');
    const output = join(dir, 'cssVars.js');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output });

    const js = await readFile(join(dir, 'cssVars.js'), 'utf8');
    const dts = await readFile(join(dir, 'cssVars.d.ts'), 'utf8');
    expect(js).toContain("colorPrimary: 'var(--color-primary)'");
    expect(js).not.toContain('as const');
    expect(dts).toContain('export declare const cssVars');
    expect(dts).toContain("colorPrimary: 'var(--color-primary)';");
  });

  it('applies snake naming to generated output', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'naming-test.css');
    const output = join(dir, 'snakeVars.ts');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output, naming: 'snake' });

    const result = await readFile(output, 'utf8');
    expect(result).toContain("color_primary: 'var(--color-primary)'");
  });

  it('applies prefix to generated output', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'prefix-test.css');
    const output = join(dir, 'prefixVars.ts');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output, prefix: 'theme' });

    const result = await readFile(output, 'utf8');
    expect(result).toContain("themeColorPrimary: 'var(--color-primary)'");
    expect(result).not.toContain("colorPrimary: 'var(--color-primary)'");
  });
});
