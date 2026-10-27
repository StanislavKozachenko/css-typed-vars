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
const groupFlag = args.includes('--group');
const pruneFlag = args.includes('--prune');
const pruneCheckMode = args.includes('--prune-check');
const lintRefsMode = args.includes('--lint-refs');
const helpersFlag = args.includes('--helpers');

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

async function loadConfig(): Promise<Config> {
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
        return JSON.parse(content) as Config;
      } else {
        const mod = await import(pathToFileURL(path).href) as { default?: Config };
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

interface RunOptions {
  input: string | string[];
  output: string;
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
}

async function run(options: RunOptions): Promise<void> {
  await generate(options);
  console.log(`Generated → ${options.output}`);
}

async function main(): Promise<void> {
  if (args.includes('--version') || args.includes('-v')) {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    console.log(pkg.version);
    process.exit(0);
  }

  const config = await loadConfig();
  const inputArgs = getArgs('--input');
  const input = inputArgs.length > 0 ? inputArgs : config.input;
  const output = getArg('--output') ?? config.output;
  const excludeArgs = getArgs('--exclude');
  const exclude = excludeArgs.length > 0 ? excludeArgs : config.exclude;
  const prefix = getArg('--prefix') ?? config.prefix;
  const namingRaw = getArg('--naming') ?? config.naming;
  if (namingRaw !== undefined && !VALID_NAMINGS.includes(namingRaw as NamingConvention)) {
    console.error(`css-typed-vars: invalid --naming value "${namingRaw}". Valid values: ${VALID_NAMINGS.join(', ')}`);
    process.exit(1);
  }
  const naming = namingRaw as NamingConvention | undefined;
  const selectorArgs = getArgs('--selector');
  const selectors = selectorArgs.length > 0 ? selectorArgs : config.selectors;
  const themeArgs = getArgs('--theme');
  for (const arg of themeArgs) {
    if (!/^[^=]+=.+$/.test(arg)) {
      console.error(`css-typed-vars: invalid --theme value "${arg}". Expected <name>=<selector or @media prelude>, e.g. dark=[data-theme="dark"].`);
      process.exit(1);
    }
  }
  const themes = themeArgs.length > 0
    ? Object.fromEntries(themeArgs.map((arg) => [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]))
    : config.themes;
  const group = groupFlag || config.group;
  const prune = pruneFlag || config.prune;
  const usageArgs = getArgs('--usage');
  const usage = usageArgs.length > 0 ? usageArgs : config.usage;
  const usageExcludeArgs = getArgs('--usage-exclude');
  const usageExclude = usageExcludeArgs.length > 0 ? usageExcludeArgs : config.usageExclude;
  const helpers = helpersFlag || config.helpers;
  const refsIgnoreArgs = getArgs('--refs-ignore');
  const refsIgnore = refsIgnoreArgs.length > 0 ? refsIgnoreArgs : config.refsIgnore;

  if (lintRefsMode) {
    if (!input) {
      console.error('css-typed-vars: --lint-refs requires --input <glob> (or "input" in the config file).');
      process.exit(1);
    }
    if (watchMode || checkMode || pruneCheckMode) {
      console.error('css-typed-vars: --lint-refs cannot be combined with --watch, --check or --prune-check.');
      process.exit(1);
    }
    const refs = await findUndefinedRefs({ input, exclude, refsIgnore });
    const format = (ref: FileReference) => `  ${relative(process.cwd(), ref.file).replace(/\\/g, '/')}:${ref.line}:${ref.column}  var(${ref.name}${ref.hasFallback ? ', …' : ''})`;
    const errors = refs.filter((ref) => !ref.hasFallback);
    const warnings = refs.filter((ref) => ref.hasFallback);
    if (warnings.length > 0) {
      console.warn(`css-typed-vars: ${warnings.length} reference(s) to undeclared variables with a fallback:`);
      for (const ref of warnings) console.warn(format(ref));
    }
    if (errors.length > 0) {
      console.error(`css-typed-vars: ${errors.length} reference(s) to undeclared variables:`);
      for (const ref of errors) console.error(format(ref));
      process.exit(1);
    }
    console.log('css-typed-vars: no references to undeclared variables.');
    return;
  }

  if (!input || !output) {
    console.error('Usage: css-typed-vars --input <glob> --output <file> [--watch] [--check] [--group] [--helpers] [--theme <name>=<selector>] [--prune --usage <glob>] [--prune-check --usage <glob>] [--lint-refs]');
    console.error('Or add a css-typed-vars.config.js file with input and output fields.');
    process.exit(1);
  }

  if (checkMode && watchMode) {
    console.error('css-typed-vars: --check cannot be combined with --watch.');
    process.exit(1);
  }

  if (pruneCheckMode && (watchMode || checkMode)) {
    console.error('css-typed-vars: --prune-check cannot be combined with --watch or --check.');
    process.exit(1);
  }

  if (group && prefix) {
    console.error('css-typed-vars: --group cannot be combined with --prefix.');
    process.exit(1);
  }

  if ((prune || pruneCheckMode) && !usage) {
    console.error('css-typed-vars: --prune/--prune-check requires --usage <glob> (source files to scan for cssVars usage).');
    process.exit(1);
  }

  if (pruneCheckMode) {
    const unused = await findUnusedVars({ input, exclude, selectors, themes, prefix, naming, group, usage, usageExclude });
    if (unused.length > 0) {
      console.error(`css-typed-vars: ${unused.length} unused variable(s): ${unused.join(', ')}`);
      process.exit(1);
    }
    console.log('css-typed-vars: no unused variables.');
    return;
  }

  const runOptions: RunOptions = { input, output, exclude, prefix, naming, selectors, themes, group, prune, usage, usageExclude, helpers };

  if (checkMode) {
    const upToDate = await checkGenerated(runOptions);
    if (!upToDate) {
      console.error(`css-typed-vars: "${output}" is out of date. Run without --check to regenerate.`);
      process.exit(1);
    }
    console.log(`css-typed-vars: "${output}" is up to date.`);
    return;
  }

  await run(runOptions);

  if (watchMode) {
    const patterns = Array.isArray(input) ? input : [input];
    const makeHandler = (label: string) => (file: string) => {
      console.log(`${label}: ${file}`);
      run(runOptions).catch(console.error);
    };
    const ignored = exclude ? (Array.isArray(exclude) ? exclude : [exclude]) : undefined;
    watch(patterns, ignored ? { ignored } : undefined)
      .on('change', makeHandler('Changed'))
      .on('add', makeHandler('Added'))
      .on('unlink', makeHandler('Removed'));
    console.log('Watching for changes...');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
