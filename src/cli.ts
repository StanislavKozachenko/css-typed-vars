#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { watch } from 'chokidar';
import { generate, checkGenerated, findUnusedVars, findUndefinedRefs, type Config, type FileReference } from './index.js';
import { VALID_NAMINGS, type NamingConvention } from './generator.js';

const args = process.argv.slice(2).flatMap((arg) => {
  const match = /^(--[\w-]+)=(.*)$/.exec(arg);
  return match ? [match[1], match[2]] : [arg];
});
const getArg = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};
const getArgs = (flag: string): string[] => {
  const result: string[] = [];
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag) result.push(args[i + 1]);
  }
  return result;
};
const watchMode = args.includes('--watch');
const checkMode = args.includes('--check');
const pruneCheckMode = args.includes('--prune-check');
const lintRefsMode = args.includes('--lint-refs');

// Flags that set a target's options, as opposed to mode flags (--watch,
// --check, ...). They can't be used with an array config, since it's
// ambiguous which target they'd apply to.
const OPTION_FLAGS = [
  '--input', '--output', '--exclude', '--prefix', '--naming', '--selector', '--theme',
  '--group', '--prune', '--usage', '--usage-exclude', '--helpers', '--refs-ignore',
];

const USAGE = 'Usage: css-typed-vars --input <glob> --output <file> [options]';

// Flags followed by a value; their value may itself start with `--`
// (`--refs-ignore --app-height`), so it's skipped when looking for unknown flags.
const VALUE_FLAGS = [
  '--input', '--output', '--exclude', '--prefix', '--naming', '--selector', '--theme',
  '--usage', '--usage-exclude', '--refs-ignore', '--config',
];
const BOOLEAN_FLAGS = [
  '--group', '--prune', '--helpers', '--watch', '--check', '--prune-check', '--lint-refs',
  '--version', '-v', '--help', '-h',
];

const HELP = `${USAGE}

Generates typed constants for the CSS custom properties found in <glob>.
Options can also be set in css-typed-vars.config.{js,mjs,cjs,ts,mts,json}; flags take precedence.

Options:
  --config <file>         Config file to use instead of looking one up
  --input <glob>          CSS files to scan (repeatable)
  --output <file>         .ts, .js/.mjs/.cjs (plus a .d.ts), or .json (design tokens)
  --exclude <glob>        Files to skip (repeatable)
  --prefix <prefix>       Prefix every generated key
  --naming <convention>   camelCase (default), snake, kebab, constant or pascal
  --selector <selector>   Also scan this selector's blocks, not just :root/@theme (repeatable)
  --theme <name>=<sel>    Theme block, emitted as @theme JSDoc tags (repeatable)
  --group                 Nest keys by the first hyphen segment (cssVars.color.primary)
  --helpers               Also emit CssVarRef and getCssVar/setCssVar/withFallback
  --prune                 Drop vars with no cssVars.<key> usage (needs --usage)
  --usage <glob>          Source files to scan for cssVars usage (repeatable)
  --usage-exclude <glob>  Source files to skip in the usage scan (repeatable)

Modes:
  --watch                 Regenerate when input (or, with --prune, usage) files change
  --check                 Exit 1 if the output is out of date, without writing
  --prune-check           Exit 1 if any var has no cssVars.<key> usage (needs --usage)
  --lint-refs             Exit 1 on var() references to undeclared variables
  --refs-ignore <name>    Name or --prefix-* pattern for --lint-refs to skip (repeatable)
  --version, -v           Print the version
  --help, -h              Print this help

Docs: https://stanislavkozachenko.github.io/css-typed-vars/`;

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

// Rejects unknown flags (with a suggestion for a likely typo) and stray
// positional arguments — typically an unquoted glob the shell expanded into
// several files, of which only the first would otherwise be used.
function validateArgs(): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (VALUE_FLAGS.includes(arg)) {
      if (i + 1 >= args.length) throw new CliError(`css-typed-vars: ${arg} requires a value.`);
      i++;
      continue;
    }
    if (BOOLEAN_FLAGS.includes(arg)) continue;
    if (arg.startsWith('-')) {
      const known = [...VALUE_FLAGS, ...BOOLEAN_FLAGS].filter((flag) => flag.startsWith('--'));
      const closest = known.reduce((best, flag) => (editDistance(arg, flag) < editDistance(arg, best) ? flag : best));
      const hint = editDistance(arg, closest) <= 2 ? ` Did you mean ${closest}?` : '';
      throw new CliError(`css-typed-vars: unknown option "${arg}".${hint} Run with --help to see all options.`);
    }
    throw new CliError(`css-typed-vars: unexpected argument "${arg}". If it's a glob, quote it so the shell doesn't expand it: --input "src/**/*.css".`);
  }
}

// Thrown for a usage error: printed as-is, then the CLI exits 1.
class CliError extends Error {}

// Looked up in the working directory, first match wins. A `.ts`/`.mts` config
// needs a Node.js version that strips types natively (22.18+, or 23.6+).
const CONFIG_FILES = [
  'css-typed-vars.config.js',
  'css-typed-vars.config.mjs',
  'css-typed-vars.config.cjs',
  'css-typed-vars.config.ts',
  'css-typed-vars.config.mts',
  'css-typed-vars.config.json',
];

async function importConfig(path: string): Promise<Config | Config[]> {
  if (/\.json$/i.test(path)) return JSON.parse(await readFile(path, 'utf8')) as Config | Config[];
  const mod = await import(pathToFileURL(path).href) as { default?: Config | Config[] };
  return mod.default ?? {};
}

async function loadConfig(): Promise<Config | Config[]> {
  const explicit = getArg('--config');
  if (explicit !== undefined) {
    const path = resolve(process.cwd(), explicit);
    if (!(await exists(path))) throw new CliError(`css-typed-vars: config file "${explicit}" not found.`);
    try {
      return await importConfig(path);
    } catch (err) {
      throw new CliError(`css-typed-vars: failed to load config "${explicit}": ${(err as Error).message}`);
    }
  }
  for (const file of CONFIG_FILES) {
    const path = resolve(process.cwd(), file);
    if (!(await exists(path))) continue;
    try {
      return await importConfig(path);
    } catch (err) {
      console.warn(`css-typed-vars: failed to load config "${file}": ${(err as Error).message}`);
    }
  }
  return {};
}

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

// CLI flags take precedence over the config file.
function applyFlags(config: Config): Config {
  const inputArgs = getArgs('--input');
  const excludeArgs = getArgs('--exclude');
  const selectorArgs = getArgs('--selector');
  const themeArgs = getArgs('--theme');
  for (const arg of themeArgs) {
    if (!/^[^=]+=.+$/.test(arg)) {
      throw new CliError(`css-typed-vars: invalid --theme value "${arg}". Expected <name>=<selector or @media prelude>, e.g. dark=[data-theme="dark"].`);
    }
  }
  const usageArgs = getArgs('--usage');
  const usageExcludeArgs = getArgs('--usage-exclude');
  const refsIgnoreArgs = getArgs('--refs-ignore');
  return {
    ...config,
    input: inputArgs.length > 0 ? inputArgs : config.input,
    output: getArg('--output') ?? config.output,
    exclude: excludeArgs.length > 0 ? excludeArgs : config.exclude,
    prefix: getArg('--prefix') ?? config.prefix,
    naming: (getArg('--naming') ?? config.naming) as NamingConvention | undefined,
    selectors: selectorArgs.length > 0 ? selectorArgs : config.selectors,
    themes: themeArgs.length > 0
      ? Object.fromEntries(themeArgs.map((arg) => [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]))
      : config.themes,
    group: args.includes('--group') || config.group,
    prune: args.includes('--prune') || config.prune,
    usage: usageArgs.length > 0 ? usageArgs : config.usage,
    usageExclude: usageExcludeArgs.length > 0 ? usageExcludeArgs : config.usageExclude,
    helpers: args.includes('--helpers') || config.helpers,
    refsIgnore: refsIgnoreArgs.length > 0 ? refsIgnoreArgs : config.refsIgnore,
  };
}

interface Target {
  options: Config;
  /** Message prefix: `css-typed-vars` for a single target, `css-typed-vars [<target>]` for several. */
  tag: string;
}

function loadTargets(config: Config | Config[]): Target[] {
  if (!Array.isArray(config)) return [{ options: applyFlags(config), tag: 'css-typed-vars' }];
  if (config.length === 0) throw new CliError('css-typed-vars: the config file exports an empty array.');
  const used = OPTION_FLAGS.filter((flag) => args.includes(flag));
  if (used.length > 0) {
    throw new CliError(`css-typed-vars: ${used.join(', ')} can't be used with an array config — set options per target in the config file instead.`);
  }
  return config.map((options, i) => ({ options, tag: `css-typed-vars [${options.output ?? `target ${i + 1}`}]` }));
}

function validateModes(): void {
  if (lintRefsMode && (watchMode || checkMode || pruneCheckMode)) {
    throw new CliError('css-typed-vars: --lint-refs cannot be combined with --watch, --check or --prune-check.');
  }
  if (checkMode && watchMode) throw new CliError('css-typed-vars: --check cannot be combined with --watch.');
  if (pruneCheckMode && (watchMode || checkMode)) {
    throw new CliError('css-typed-vars: --prune-check cannot be combined with --watch or --check.');
  }
}

function validateTarget({ options, tag }: Target, single: boolean): void {
  const { input, output, naming, group, prefix, prune, usage } = options;
  if (naming !== undefined && !VALID_NAMINGS.includes(naming)) {
    throw new CliError(`${tag}: invalid --naming value "${naming}". Valid values: ${VALID_NAMINGS.join(', ')}`);
  }
  if (lintRefsMode) {
    if (!input) throw new CliError(`${tag}: --lint-refs requires --input <glob> (or "input" in the config file).`);
    return;
  }
  // --prune-check only reports, so it doesn't need an output file.
  if (pruneCheckMode && !input) {
    throw new CliError(`${tag}: --prune-check requires --input <glob> (or "input" in the config file).`);
  }
  if (!input || (!output && !pruneCheckMode)) {
    throw new CliError(single
      ? `${USAGE}\nOr add a css-typed-vars.config.js file with input and output fields. Run with --help to see all options.`
      : `${tag}: every target needs "input" and "output".`);
  }
  if (group && prefix) throw new CliError(`${tag}: --group cannot be combined with --prefix.`);
  if ((prune || pruneCheckMode) && !usage) {
    throw new CliError(`${tag}: --prune/--prune-check requires --usage <glob> (source files to scan for cssVars usage).`);
  }
}

// Each mode runs for one target and resolves to whether it passed.

async function lintRefs({ options, tag }: Target): Promise<boolean> {
  const refs = await findUndefinedRefs({ input: options.input!, exclude: options.exclude, refsIgnore: options.refsIgnore });
  const format = (ref: FileReference) => `  ${relative(process.cwd(), ref.file).replace(/\\/g, '/')}:${ref.line}:${ref.column}  var(${ref.name}${ref.hasFallback ? ', …' : ''})`;
  const errors = refs.filter((ref) => !ref.hasFallback);
  const warnings = refs.filter((ref) => ref.hasFallback);
  if (warnings.length > 0) {
    console.warn(`${tag}: ${warnings.length} reference(s) to undeclared variables with a fallback:`);
    for (const ref of warnings) console.warn(format(ref));
  }
  if (errors.length > 0) {
    console.error(`${tag}: ${errors.length} reference(s) to undeclared variables:`);
    for (const ref of errors) console.error(format(ref));
    return false;
  }
  console.log(`${tag}: no references to undeclared variables.`);
  return true;
}

async function pruneCheck({ options, tag }: Target): Promise<boolean> {
  const unused = await findUnusedVars({ ...options, input: options.input! });
  if (unused.length > 0) {
    console.error(`${tag}: ${unused.length} unused variable(s): ${unused.join(', ')}`);
    return false;
  }
  console.log(`${tag}: no unused variables.`);
  return true;
}

async function check({ options, tag }: Target): Promise<boolean> {
  if (!(await checkGenerated({ ...options, input: options.input!, output: options.output! }))) {
    console.error(`${tag}: "${options.output}" is out of date. Run without --check to regenerate.`);
    return false;
  }
  console.log(`${tag}: "${options.output}" is up to date.`);
  return true;
}

async function run({ options }: Target): Promise<void> {
  const written = await generate({ ...options, input: options.input!, output: options.output! });
  console.log(`${written ? 'Generated' : 'Up to date'} → ${options.output}`);
}

const toArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

// Regenerates when an input file changes or, with --prune, a source file
// scanned for usage does. Bursts of events are debounced into one run, and
// runs never overlap, so an older run can't overwrite a newer one's output.
function watchTarget(target: Target): void {
  const { input, exclude, output, prune, usage, usageExclude } = target.options;
  // The generated files themselves: a `usage` glob may well match them (`src/**/*.ts`).
  const jsExt = /\.(m|c)?js$/i.exec(output!);
  const outputs = new Set([output!, ...(jsExt ? [output!.slice(0, -jsExt[0].length) + '.d.ts'] : [])].map((path) => resolve(path)));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;
  const regenerate = async (): Promise<void> => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    await run(target).catch(console.error);
    running = false;
    if (pending) {
      pending = false;
      await regenerate();
    }
  };
  const makeHandler = (label: string) => (file: string) => {
    if (outputs.has(resolve(file))) return;
    console.log(`${label}: ${file}`);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void regenerate();
    }, 100);
  };

  const subscribe = (patterns: string[], ignored: string[]) => {
    watch(patterns, { ignoreInitial: true, ...(ignored.length > 0 ? { ignored } : {}) })
      .on('change', makeHandler('Changed'))
      .on('add', makeHandler('Added'))
      .on('unlink', makeHandler('Removed'));
  };
  subscribe(toArray(input), toArray(exclude));
  if (prune) subscribe(toArray(usage), toArray(usageExclude));
}

async function main(): Promise<void> {
  validateArgs();
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  if (args.includes('--version') || args.includes('-v')) {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    console.log(pkg.version);
    process.exit(0);
  }

  const targets = loadTargets(await loadConfig());
  validateModes();
  for (const target of targets) validateTarget(target, targets.length === 1);

  // Targets run one after another, so their output doesn't interleave; a
  // failing check doesn't stop the remaining targets from being checked.
  const mode = lintRefsMode ? lintRefs : pruneCheckMode ? pruneCheck : checkMode ? check : null;
  if (mode) {
    let ok = true;
    for (const target of targets) {
      if (!(await mode(target))) ok = false;
    }
    if (!ok) process.exit(1);
    return;
  }

  for (const target of targets) await run(target);

  if (watchMode) {
    for (const target of targets) watchTarget(target);
    console.log('Watching for changes...');
  }
}

main().catch((err) => {
  console.error(err instanceof CliError ? err.message : err);
  process.exit(1);
});
