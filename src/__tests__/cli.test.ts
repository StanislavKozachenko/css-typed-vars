import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

// The CLI runs as a real child process, from a bundle of src/cli.ts placed
// inside node_modules so its runtime dependencies (chokidar, fast-glob) resolve.
const cliPath = resolve('node_modules/.cache/css-typed-vars-tests/cli.mjs');
let dir: string;

beforeAll(async () => {
  await build({
    entryPoints: ['src/cli.ts'],
    outfile: cliPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });
  dir = await mkdtemp(join(tmpdir(), 'css-typed-vars-cli-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true });
});

// Runs the CLI in a fresh project directory containing the given files.
async function runCli(files: Record<string, string>, args: string[]) {
  const cwd = await mkdtemp(join(dir, 'project-'));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(cwd, path, '..'), { recursive: true });
    await writeFile(join(cwd, path), content);
  }
  const result = spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
  return { cwd, status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const twoTargets = JSON.stringify([
  { input: 'a/*.css', output: 'a/vars.ts' },
  { input: 'b/*.css', output: 'b/vars.ts', naming: 'snake' },
]);

describe('CLI with an array config', () => {
  it('generates every target', async () => {
    const { cwd, status, stdout } = await runCli({
      'css-typed-vars.config.json': twoTargets,
      'a/x.css': ':root { --color-primary: red; }',
      'b/x.css': ':root { --spacing-md: 8px; }',
    }, []);
    expect(status).toBe(0);
    expect(stdout).toContain('Generated → a/vars.ts');
    expect(stdout).toContain('Generated → b/vars.ts');
    expect(await readFile(join(cwd, 'a/vars.ts'), 'utf8')).toContain("colorPrimary: 'var(--color-primary)'");
    expect(await readFile(join(cwd, 'b/vars.ts'), 'utf8')).toContain("spacing_md: 'var(--spacing-md)'");
  });

  it('checks every target, failing if any is out of date', async () => {
    const { status, stdout, stderr } = await runCli({
      'css-typed-vars.config.json': twoTargets,
      'a/x.css': ':root { --color-primary: red; }',
      'b/x.css': ':root { --spacing-md: 8px; }',
      'a/vars.ts': "// generated — do not edit\nexport const cssVars = {\n  /** @default red */\n  colorPrimary: 'var(--color-primary)',\n} as const;\n\nexport type CssVarName = keyof typeof cssVars;\n",
    }, ['--check']);
    expect(status).toBe(1);
    expect(stdout).toContain('css-typed-vars [a/vars.ts]: "a/vars.ts" is up to date.');
    expect(stderr).toContain('css-typed-vars [b/vars.ts]: "b/vars.ts" is out of date.');
  });

  it('lints references per target', async () => {
    const { status, stdout, stderr } = await runCli({
      'css-typed-vars.config.json': twoTargets,
      'a/x.css': ':root { --a: 1px; } .x { margin: var(--a); }',
      'b/x.css': '.y { color: var(--missing); }',
    }, ['--lint-refs']);
    expect(status).toBe(1);
    expect(stdout).toContain('css-typed-vars [a/vars.ts]: no references to undeclared variables.');
    expect(stderr).toContain('css-typed-vars [b/vars.ts]: 1 reference(s) to undeclared variables:');
    expect(stderr).toMatch(/b\/x\.css:1:13 {2}var\(--missing\)/);
  });

  it('rejects option flags, which would be ambiguous across targets', async () => {
    const { status, stderr } = await runCli({ 'css-typed-vars.config.json': twoTargets }, ['--group', '--naming', 'kebab']);
    expect(status).toBe(1);
    expect(stderr).toContain("css-typed-vars: --naming, --group can't be used with an array config");
  });

  it('names the target that is missing an output', async () => {
    const { status, stderr } = await runCli({
      'css-typed-vars.config.json': JSON.stringify([{ input: 'a/*.css', output: 'a/vars.ts' }, { input: 'b/*.css' }]),
    }, []);
    expect(status).toBe(1);
    expect(stderr).toContain('css-typed-vars [target 2]: every target needs "input" and "output".');
  });

  it('rejects an empty array', async () => {
    const { status, stderr } = await runCli({ 'css-typed-vars.config.json': '[]' }, []);
    expect(status).toBe(1);
    expect(stderr).toContain('css-typed-vars: the config file exports an empty array.');
  });

  it('accepts an array from a .js config too', async () => {
    const { status, stdout } = await runCli({
      'css-typed-vars.config.mjs': `export default ${twoTargets};`,
      'a/x.css': ':root { --a: 1; }',
      'b/x.css': ':root { --b: 2; }',
    }, []);
    expect(status).toBe(0);
    expect(stdout).toContain('Generated → b/vars.ts');
  });
});

describe('CLI with a single config', () => {
  it('applies flags on top of the config file', async () => {
    const { cwd, status } = await runCli({
      'css-typed-vars.config.json': JSON.stringify({ input: 'x.css', output: 'vars.ts' }),
      'x.css': ':root { --color-primary: red; }',
    }, ['--naming', 'constant']);
    expect(status).toBe(0);
    expect(await readFile(join(cwd, 'vars.ts'), 'utf8')).toContain("COLOR_PRIMARY: 'var(--color-primary)'");
  });

  it('prints usage when input or output is missing', async () => {
    const { status, stderr } = await runCli({}, []);
    expect(status).toBe(1);
    expect(stderr).toContain('Usage: css-typed-vars --input <glob> --output <file>');
  });

  it('keeps the unprefixed messages and rejects incompatible modes', async () => {
    const files = { 'x.css': ':root { --a: 1; }' };
    const check = await runCli(files, ['--input', 'x.css', '--output', 'vars.ts', '--check']);
    expect(check.status).toBe(1);
    expect(check.stderr).toContain('css-typed-vars: "vars.ts" is out of date.');
    const both = await runCli(files, ['--input', 'x.css', '--output', 'vars.ts', '--check', '--watch']);
    expect(both.status).toBe(1);
    expect(both.stderr).toContain('css-typed-vars: --check cannot be combined with --watch.');
  });

  it('rejects an invalid --naming value', async () => {
    const { status, stderr } = await runCli({}, ['--input', 'x.css', '--output', 'vars.ts', '--naming', 'shouty']);
    expect(status).toBe(1);
    expect(stderr).toContain('css-typed-vars: invalid --naming value "shouty".');
  });
});
