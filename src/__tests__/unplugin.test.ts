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

interface Hooks {
  buildStart: (this: Context) => Promise<void>;
  load: (this: Context, id: string) => Promise<string | undefined>;
  vite: { configResolved: (config: { command: string }) => void };
}
interface Context {
  addWatchFile: (id: string) => void;
}

// A bundler context that records the files the plugin asks to watch.
function context(): Context & { watched: string[] } {
  const watched: string[] = [];
  return { watched, addWatchFile: (id) => watched.push(id) };
}

// Runs the plugin's buildStart hook, as a bundler would at the start of a build.
async function buildStart(options: Options, ctx: Context = context()): Promise<void> {
  const hooks = plugin.raw(options, { framework: 'rollup' }) as unknown as Hooks;
  await hooks.buildStart.call(ctx);
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

describe('plugin watch files', () => {
  const input = () => join(dir, '*.css').replace(/\\/g, '/');

  it('watches the scanned files from buildStart', async () => {
    const ctx = context();
    await buildStart({ input: input(), dts: false }, ctx);
    expect(ctx.watched).toEqual([join(dir, 'a.css')]);
  });

  it('watches the usage files too with prune', async () => {
    await writeFile(join(dir, 'app.ts'), 'cssVars.colorPrimary;');
    const ctx = context();
    await buildStart({ input: input(), dts: false, prune: true, usage: join(dir, '*.ts').replace(/\\/g, '/') }, ctx);
    expect(ctx.watched).toEqual([join(dir, 'a.css'), join(dir, 'app.ts')]);
  });

  it('watches the scanned files when loading the virtual module', async () => {
    const hooks = plugin.raw({ input: input(), dts: false }, { framework: 'esbuild' }) as unknown as Hooks;
    const ctx = context();
    expect(await hooks.load.call(ctx, '\0css-typed-vars/vars')).toContain('colorPrimary');
    expect(ctx.watched).toEqual([join(dir, 'a.css')]);
  });

  it("doesn't call addWatchFile from buildStart with esbuild, which doesn't allow it there", async () => {
    const hooks = plugin.raw({ input: input(), dts: false }, { framework: 'esbuild' }) as unknown as Hooks;
    const ctx = context();
    await hooks.buildStart.call(ctx);
    expect(ctx.watched).toEqual([]);
  });

  it('leaves watching to the Vite dev server', async () => {
    const hooks = plugin.raw({ input: input(), dts: false }, { framework: 'vite' }) as unknown as Hooks;
    hooks.vite.configResolved({ command: 'serve' });
    const ctx = context();
    await hooks.buildStart.call(ctx);
    await hooks.load.call(ctx, '\0css-typed-vars/vars');
    expect(ctx.watched).toEqual([]);
  });
});
