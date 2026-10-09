import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generate, checkGenerated, findUnusedVars } from '../index.js';

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

  it('generates JS file and .d.ts when output ends in .mjs', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'mjs-test.css');
    const output = join(dir, 'cssVars.mjs');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output });

    const js = await readFile(join(dir, 'cssVars.mjs'), 'utf8');
    const dts = await readFile(join(dir, 'cssVars.d.ts'), 'utf8');
    expect(js).toContain("colorPrimary: 'var(--color-primary)'");
    expect(js).not.toContain('as const');
    expect(dts).toContain('export declare const cssVars');
  });

  it('generates JS file and .d.ts when output ends in .JS (case-insensitive)', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'uppercase-ext-test.css');
    const output = join(dir, 'cssVars.JS');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output });

    const js = await readFile(output, 'utf8');
    const dts = await readFile(join(dir, 'cssVars.d.ts'), 'utf8');
    expect(js).toContain("colorPrimary: 'var(--color-primary)'");
    expect(js).not.toContain('as const');
    expect(dts).toContain('export declare const cssVars');
  });

  it('generates JS file and .d.ts when output ends in .cjs', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'cjs-test.css');
    const output = join(dir, 'cssVars.cjs');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output });

    const js = await readFile(join(dir, 'cssVars.cjs'), 'utf8');
    const dts = await readFile(join(dir, 'cssVars.d.ts'), 'utf8');
    expect(js).toContain("colorPrimary: 'var(--color-primary)'");
    expect(js).not.toContain('as const');
    expect(dts).toContain('export declare const cssVars');
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

  it('picks up variables from additional selectors', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'selectors-test.css');
    const output = join(dir, 'selectorVars.ts');
    await writeFile(input, ':root { --color-primary: red; } .dark { --color-bg: #111; }');

    await generate({ input, output, selectors: ['.dark'] });

    const result = await readFile(output, 'utf8');
    expect(result).toContain("colorPrimary: 'var(--color-primary)'");
    expect(result).toContain("colorBg: 'var(--color-bg)'");
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

  it('emits a JSDoc @default comment with the declared CSS value', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'default-test.css');
    const output = join(dir, 'defaultVars.ts');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output });

    const result = await readFile(output, 'utf8');
    expect(result).toContain("/** @default red */\n  colorPrimary: 'var(--color-primary)',");
  });

  it('emits a JSDoc @default comment in the .d.ts sidecar for JS output', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'default-js-test.css');
    const output = join(dir, 'defaultVars.js');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output });

    const dts = await readFile(join(dir, 'defaultVars.d.ts'), 'utf8');
    expect(dts).toContain("/** @default red */\n  colorPrimary: 'var(--color-primary)';");
  });

  it('warns when generated keys collide', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'collision-test.css');
    const output = join(dir, 'collisionVars.ts');
    await writeFile(input, ':root { --my--var: 1px; --my-var: 2px; }');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await generate({ input, output });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('multiple CSS variables map to the same key "myVar" (--my--var, --my-var)'),
    );
    warn.mockRestore();
  });

  it('prunes a var with no detected usage and warns about it', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const input = join(dir, 'prune-test.css');
    const output = join(dir, 'pruneVars.ts');
    const srcDir = join(dir, 'prune-src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(input, ':root { --color-primary: red; --spacing-md: 8px; }');
    await writeFile(join(srcDir, 'app.ts'), 'const c = cssVars.colorPrimary;');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await generate({ input, output, prune: true, usage: `${srcDir}/*.ts` });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pruned 1 unused variable(s): --spacing-md'));
    warn.mockRestore();

    const result = await readFile(output, 'utf8');
    expect(result).toContain("colorPrimary: 'var(--color-primary)'");
    expect(result).not.toContain('spacingMd');
  });

  it('keeps every var when all are used', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const input = join(dir, 'prune-all-used.css');
    const output = join(dir, 'pruneAllUsedVars.ts');
    const srcDir = join(dir, 'prune-src-2');
    await mkdir(srcDir, { recursive: true });
    await writeFile(input, ':root { --color-primary: red; }');
    await writeFile(join(srcDir, 'app.ts'), 'const c = cssVars.colorPrimary;');

    await generate({ input, output, prune: true, usage: `${srcDir}/*.ts` });

    const result = await readFile(output, 'utf8');
    expect(result).toContain("colorPrimary: 'var(--color-primary)'");
  });

  it('throws when prune is combined with group', async () => {
    const input = join(dir, 'prune-group.css');
    const output = join(dir, 'pruneGroupVars.ts');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(input, ':root { --color-primary: red; }');

    await expect(generate({ input, output, prune: true, group: true, usage: `${dir}/*.ts` })).rejects.toThrow(
      /cannot be combined with "group"/,
    );
  });

  it('throws when prune is used without usage', async () => {
    const input = join(dir, 'prune-no-usage.css');
    const output = join(dir, 'pruneNoUsageVars.ts');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(input, ':root { --color-primary: red; }');

    await expect(generate({ input, output, prune: true })).rejects.toThrow(/requires "usage"/);
  });
});

describe('findUnusedVars', () => {
  it('reports vars with no detected usage without writing anything', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const input = join(dir, 'unused-test.css');
    const srcDir = join(dir, 'unused-src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(input, ':root { --color-primary: red; --spacing-md: 8px; }');
    await writeFile(join(srcDir, 'app.ts'), 'const c = cssVars.colorPrimary;');

    const unused = await findUnusedVars({ input, usage: `${srcDir}/*.ts` });
    expect(unused).toEqual(['--spacing-md']);
  });

  it('returns an empty array when everything is used', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const input = join(dir, 'unused-none.css');
    const srcDir = join(dir, 'unused-src-2');
    await mkdir(srcDir, { recursive: true });
    await writeFile(input, ':root { --color-primary: red; }');
    await writeFile(join(srcDir, 'app.ts'), 'cssVars.colorPrimary');

    expect(await findUnusedVars({ input, usage: `${srcDir}/*.ts` })).toEqual([]);
  });

  it('throws when called without usage', async () => {
    const input = join(dir, 'unused-no-usage.css');
    await expect(findUnusedVars({ input })).rejects.toThrow(/requires "usage"/);
  });
});

describe('checkGenerated', () => {
  it('returns false when the output file does not exist yet', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'check-missing.css');
    const output = join(dir, 'checkMissingVars.ts');
    await writeFile(input, ':root { --color-primary: red; }');

    expect(await checkGenerated({ input, output })).toBe(false);
  });

  it('returns true when the existing file matches what would be generated', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'check-fresh.css');
    const output = join(dir, 'checkFreshVars.ts');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output });
    expect(await checkGenerated({ input, output })).toBe(true);
  });

  it('returns false when the CSS source changed since the file was generated', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'check-stale.css');
    const output = join(dir, 'checkStaleVars.ts');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output });
    await writeFile(input, ':root { --color-primary: blue; }');
    expect(await checkGenerated({ input, output })).toBe(false);
  });

  it('does not write the output file', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'check-no-write.css');
    const output = join(dir, 'checkNoWriteVars.ts');
    await writeFile(input, ':root { --color-primary: red; }');

    await checkGenerated({ input, output });
    await expect(readFile(output, 'utf8')).rejects.toThrow();
  });

  it('also checks the .d.ts sidecar for JS output', async () => {
    const { writeFile } = await import('node:fs/promises');
    const input = join(dir, 'check-js.css');
    const output = join(dir, 'checkJsVars.js');
    const dtsPath = join(dir, 'checkJsVars.d.ts');
    await writeFile(input, ':root { --color-primary: red; }');

    await generate({ input, output });
    expect(await checkGenerated({ input, output })).toBe(true);

    await writeFile(dtsPath, 'export declare const cssVars: {};');
    expect(await checkGenerated({ input, output })).toBe(false);
  });
});
