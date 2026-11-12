import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import plugin, { type Options } from '../unplugin.js';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'css-typed-vars-plugin-'));
  await writeFile(join(dir, 'a.css'), ':root { --color-primary: red; }');
});

afterAll(async () => {
  await rm(dir, { recursive: true });
});

// Runs the plugin's buildStart hook, as a bundler would at the start of a build.
async function buildStart(options: Options): Promise<void> {
  const hooks = plugin.raw(options, { framework: 'rollup' }) as { buildStart: () => Promise<void> };
  await hooks.buildStart();
}

describe('plugin buildStart', () => {
  it('creates missing directories for dts and tokens', async () => {
    const dts = join(dir, 'types', 'nested', 'vars.d.ts');
    const tokens = join(dir, 'tokens', 'vars.json');
    await buildStart({ input: join(dir, '*.css').replace(/\\/g, '/'), dts, tokens });
    expect(await readFile(dts, 'utf8')).toContain("colorPrimary: 'var(--color-primary)'");
    expect(JSON.parse(await readFile(tokens, 'utf8'))).toHaveProperty('colorPrimary');
  });
});

describe('plugin buildStart with unchanged output', () => {
  it('leaves an up-to-date dts file untouched', async () => {
    const { stat, utimes } = await import('node:fs/promises');
    const dts = join(dir, 'same', 'vars.d.ts');
    const input = join(dir, '*.css').replace(/\\/g, '/');
    await buildStart({ input, dts });
    const past = new Date('2020-01-01');
    await utimes(dts, past, past);
    await buildStart({ input, dts });
    expect((await stat(dts)).mtime.getTime()).toBe(past.getTime());
  });
});
