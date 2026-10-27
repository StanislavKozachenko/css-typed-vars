#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { watch } from 'chokidar';
import { generate, checkGenerated, findUnusedVars, findUndefinedRefs, type FileReference } from './index.js';
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

const USAGE = 'Usage: css-typed-vars --input <glob> --output <file> [--watch] [--check] [--group] [--helpers] [--theme <name>=<selector>] [--prune --usage <glob>] [--prune-check --usage <glob>] [--lint-refs]';

interface Config {
  input?: string | string[];
  output?: string;
  exclude?: string | string[];
  prefix?: string;
  naming?: NamingConvention;
  selectors?: string[];
  themes?: Record<string, string>;
  group?: boolean;
  prune?: boolean;
  usage?: string | string[];
  usageExclude?: string | string[];
  helpers?: boolean;
  refsIgnore?: string[];
}

// Thrown for a usage error: printed as-is, then the CLI exits 1.
class CliError extends Error {}

async function loadConfig(): Promise<Config | Config[]> {
  const candidates = [
    'css-typed-vars.config.js',
    'css-typed-vars.config.mjs',
    'css-typed-vars.config.json',
  ];
  for (const file of candidates) {
    const path = resolve(process.cwd(), file);
    try {
      if (file.endsWith('.json')) {
        const content = await readFile(path, 'utf8');
        return JSON.parse(content) as Config | Config[];
      } else {
        const mod = await import(pathToFileURL(path).href) as { default?: Config | Config[] };
        return mod.default ?? {};
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') continue;
      console.warn(`css-typed-vars: failed to load config "${file}": ${(err as Error).message}`);
    }
  }
  return {};
}

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
  if (!input || !output) {
    throw new CliError(single
      ? `${USAGE}\nOr add a css-typed-vars.config.js file with input and output fields.`
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
  await generate({ ...options, input: options.input!, output: options.output! });
  console.log(`Generated → ${options.output}`);
}

function watchTarget(target: Target): void {
  const { input, exclude } = target.options;
  const patterns = Array.isArray(input) ? input : [input!];
  const makeHandler = (label: string) => (file: string) => {
    console.log(`${label}: ${file}`);
    run(target).catch(console.error);
  };
  const ignored = exclude ? (Array.isArray(exclude) ? exclude : [exclude]) : undefined;
  watch(patterns, ignored ? { ignored } : undefined)
    .on('change', makeHandler('Changed'))
    .on('add', makeHandler('Added'))
    .on('unlink', makeHandler('Removed'));
}

async function main(): Promise<void> {
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
