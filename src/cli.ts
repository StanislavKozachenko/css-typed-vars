#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { watch } from 'chokidar';
import { generate } from './index.js';
import type { NamingConvention } from './generator.js';

const args = process.argv.slice(2);
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

interface Config {
  input?: string | string[];
  output?: string;
  exclude?: string | string[];
  prefix?: string;
  naming?: NamingConvention;
  selectors?: string[];
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
        const mod = await import(pathToFileURL(path).href) as { default: Config };
        return mod.default;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') continue;
      console.warn(`css-typed-vars: failed to load config "${file}": ${(err as Error).message}`);
    }
  }
  return {};
}

async function run(
  input: string | string[],
  output: string,
  exclude?: string | string[],
  prefix?: string,
  naming?: NamingConvention,
  selectors?: string[],
): Promise<void> {
  await generate({ input, output, exclude, prefix, naming, selectors });
  console.log(`Generated → ${output}`);
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
  const naming = (getArg('--naming') ?? config.naming) as NamingConvention | undefined;
  const selectorArgs = getArgs('--selector');
  const selectors = selectorArgs.length > 0 ? selectorArgs : config.selectors;

  if (!input || !output) {
    console.error('Usage: css-typed-vars --input <glob> --output <file> [--watch]');
    console.error('Or add a css-typed-vars.config.js file with input and output fields.');
    process.exit(1);
  }

  await run(input, output, exclude, prefix, naming, selectors);

  if (watchMode) {
    const patterns = Array.isArray(input) ? input : [input];
    const makeHandler = (label: string) => (file: string) => {
      console.log(`${label}: ${file}`);
      run(input, output, exclude, prefix, naming, selectors).catch(console.error);
    };
    watch(patterns)
      .on('change', makeHandler('Changed'))
      .on('add', makeHandler('Added'))
      .on('unlink', makeHandler('Removed'));
    console.log('Watching for changes...');
  }
}

main().catch(console.error);
