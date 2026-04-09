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
});
