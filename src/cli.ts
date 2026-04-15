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
const watchMode = args.includes('--watch');

interface Config {
  input?: string | string[];
  output?: string;
  exclude?: string | string[];
  prefix?: string;
  naming?: NamingConvention;
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
    } catch {
      // file not found or parse error — try next
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
): Promise<void> {
  await generate({ input, output, exclude, prefix, naming });
  console.log(`Generated → ${output}`);
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const input = getArg('--input') ?? config.input;
  const output = getArg('--output') ?? config.output;
  const exclude = getArg('--exclude') ?? config.exclude;
  const prefix = getArg('--prefix') ?? config.prefix;
  const naming = (getArg('--naming') ?? config.naming) as NamingConvention | undefined;

  if (!input || !output) {
    console.error('Usage: css-typed-vars --input <glob> --output <file> [--watch]');
    console.error('Or add a css-typed-vars.config.js file with input and output fields.');
    process.exit(1);
  }

  await run(input, output, exclude, prefix, naming);

  if (watchMode) {
    const patterns = Array.isArray(input) ? input : [input];
    watch(patterns).on('change', (file) => {
      console.log(`Changed: ${file}`);
      run(input, output, exclude, prefix, naming).catch(console.error);
    });
    console.log('Watching for changes...');
  }
}

main().catch(console.error);
