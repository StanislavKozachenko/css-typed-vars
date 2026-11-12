import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
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

  it('prints help with every option and exits 0, even with a config file', async () => {
    for (const flag of ['--help', '-h']) {
      const { cwd, status, stdout } = await runCli({
        'css-typed-vars.config.json': JSON.stringify({ input: 'x.css', output: 'vars.ts' }),
        'x.css': ':root { --a: 1; }',
      }, [flag]);
      expect(status).toBe(0);
      expect(stdout).toContain('Usage: css-typed-vars --input <glob> --output <file> [options]');
      for (const option of ['--exclude', '--naming', '--selector', '--usage-exclude', '--refs-ignore', '--lint-refs']) {
        expect(stdout).toContain(option);
      }
      await expect(readFile(join(cwd, 'vars.ts'), 'utf8')).rejects.toThrow();
    }
  });

  it('rejects an unknown option, suggesting the closest one', async () => {
    const { status, stderr } = await runCli({ 'x.css': ':root { --a: 1; }' }, ['--input', 'x.css', '--ouput', 'vars.ts']);
    expect(status).toBe(1);
    expect(stderr).toContain('css-typed-vars: unknown option "--ouput". Did you mean --output?');
    const far = await runCli({}, ['--frobnicate']);
    expect(far.stderr).toContain('unknown option "--frobnicate". Run with --help');
  });

  it('rejects a stray argument, such as a glob expanded by the shell', async () => {
    const { status, stderr } = await runCli({}, ['--input', 'a.css', 'b.css', '--output', 'vars.ts']);
    expect(status).toBe(1);
    expect(stderr).toContain('unexpected argument "b.css"');
  });

  it('accepts flag values that start with --, and rejects a flag missing its value', async () => {
    const ok = await runCli({ 'x.css': ':root { color: var(--app-height); }' }, ['--input', 'x.css', '--lint-refs', '--refs-ignore', '--app-height']);
    expect(ok.status).toBe(0);
    const missing = await runCli({}, ['--input', 'x.css', '--output']);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('css-typed-vars: --output requires a value.');
  });

  it('reports an output that is already up to date', async () => {
    const { cwd } = await runCli({ 'x.css': ':root { --a: 1; }' }, ['--input', 'x.css', '--output', 'vars.ts']);
    const again = spawnSync(process.execPath, [cliPath, '--input', 'x.css', '--output', 'vars.ts'], { cwd, encoding: 'utf8' });
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('Up to date → vars.ts');
  });

  it('loads the config file given with --config, failing if it is missing', async () => {
    const { cwd, status } = await runCli({
      'configs/vars.config.json': JSON.stringify({ input: 'x.css', output: 'vars.ts', naming: 'snake' }),
      'x.css': ':root { --color-primary: red; }',
    }, ['--config', 'configs/vars.config.json']);
    expect(status).toBe(0);
    expect(await readFile(join(cwd, 'vars.ts'), 'utf8')).toContain("color_primary: 'var(--color-primary)'");
    const missing = await runCli({}, ['--config', 'nope.config.js']);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('css-typed-vars: config file "nope.config.js" not found.');
  });

  it('finds a .cjs config file', async () => {
    const { cwd, status } = await runCli({
      'css-typed-vars.config.cjs': "module.exports = { input: 'x.css', output: 'vars.ts' };",
      'x.css': ':root { --a: 1; }',
    }, []);
    expect(status).toBe(0);
    expect(await readFile(join(cwd, 'vars.ts'), 'utf8')).toContain("a: 'var(--a)'");
  });

  // Needs native type stripping (Node.js 22.18+ / 23.6+).
  it.skipIf(!process.features.typescript)('finds a .ts config file', async () => {
    const { cwd, status } = await runCli({
      'css-typed-vars.config.ts': "const config: { input: string; output: string } = { input: 'x.css', output: 'vars.ts' }; export default config;",
      'x.css': ':root { --a: 1; }',
    }, []);
    expect(status).toBe(0);
    expect(await readFile(join(cwd, 'vars.ts'), 'utf8')).toContain("a: 'var(--a)'");
  });

  it('reports a config file that fails to load instead of skipping it silently', async () => {
    const { status, stderr } = await runCli({
      'css-typed-vars.config.mjs': "import 'some-missing-package'; export default {};",
    }, []);
    expect(status).toBe(1);
    expect(stderr).toContain('css-typed-vars: failed to load config "css-typed-vars.config.mjs"');
  });

  it('runs --prune-check without --output', async () => {
    const { cwd, status, stderr } = await runCli({
      'x.css': ':root { --u: 1; --v: 2; }',
      'src/app.ts': 'cssVars.u;',
    }, ['--input', 'x.css', '--prune-check', '--usage', 'src/*.ts']);
    expect(status).toBe(1);
    expect(stderr).toContain('css-typed-vars: 1 unused variable(s): --v');
    await expect(readFile(join(cwd, 'vars.ts'), 'utf8')).rejects.toThrow();
    const noInput = await runCli({}, ['--prune-check', '--usage', 'src/*.ts']);
    expect(noInput.status).toBe(1);
    expect(noInput.stderr).toContain('css-typed-vars: --prune-check requires --input <glob>');
  });

  it('rejects an invalid --naming value', async () => {
    const { status, stderr } = await runCli({}, ['--input', 'x.css', '--output', 'vars.ts', '--naming', 'shouty']);
    expect(status).toBe(1);
    expect(stderr).toContain('css-typed-vars: invalid --naming value "shouty".');
  });
});

describe('CLI --watch', () => {
  // Starts the CLI in watch mode, resolving once it's watching; the returned
  // `stdout` accumulates everything printed so far.
  async function startWatch(files: Record<string, string>, args: string[]) {
    const cwd = await mkdtemp(join(dir, 'watch-'));
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(cwd, path, '..'), { recursive: true });
      await writeFile(join(cwd, path), content);
    }
    const child = spawn(process.execPath, [cliPath, ...args, '--watch'], { cwd });
    const output = { stdout: '' };
    child.stdout.on('data', (chunk) => { output.stdout += chunk; });
    child.stderr.on('data', (chunk) => { output.stdout += chunk; });
    await waitFor(() => output.stdout.includes('Watching for changes...'));
    // Give the watchers a moment to finish their initial scan.
    await new Promise((r) => setTimeout(r, 300));
    return { cwd, child, output };
  }

  async function waitFor(condition: () => boolean | Promise<boolean>, timeout = 5000) {
    const start = Date.now();
    while (!(await condition())) {
      if (Date.now() - start > timeout) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  it("doesn't regenerate once per existing file on startup", async () => {
    const { child, output } = await startWatch({
      'a.css': ':root { --a: 1; }',
      'b.css': ':root { --b: 1; }',
    }, ['--input', '*.css', '--output', 'vars.ts']);
    await new Promise((r) => setTimeout(r, 500));
    child.kill();
    expect(output.stdout.match(/Generated/g)).toHaveLength(1);
  });

  it('regenerates with --prune when a usage file changes, ignoring its own output', async () => {
    const { cwd, child, output } = await startWatch({
      'styles/x.css': ':root { --u: 1; --v: 2; }',
      'src/app.ts': 'cssVars.u;',
    }, ['--input', 'styles/*.css', '--output', 'src/vars.ts', '--prune', '--usage', 'src/**/*.ts']);
    try {
      expect(await readFile(join(cwd, 'src/vars.ts'), 'utf8')).not.toContain('--v');
      await writeFile(join(cwd, 'src/app.ts'), 'cssVars.u; cssVars.v;');
      await waitFor(async () => (await readFile(join(cwd, 'src/vars.ts'), 'utf8')).includes("v: 'var(--v)'"));
      await new Promise((r) => setTimeout(r, 500));
      // One run at startup, one for the edit — writing src/vars.ts didn't trigger another.
      expect(output.stdout.match(/Generated/g)).toHaveLength(2);
    } finally {
      child.kill();
    }
  });
});
